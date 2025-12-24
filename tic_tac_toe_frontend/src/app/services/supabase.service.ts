import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HAS_SUPABASE, SUPABASE_ANON_KEY, SUPABASE_URL } from '../env';

type SupabaseErrorLike = { message: string; code?: string };

/**
 * Leaderboard row as consumed by the leaderboard UI.
 */
export type LeaderboardRow = {
  username: string;
  total: number;
  last_played: string | Date;
};

type ScoreColumnName = 'result' | 'score';

/**
 * Minimal row shape returned from Supabase.
 * We intentionally keep this loose because the column name can vary between `result` and `score`.
 */
type ScoreSelectRow = {
  username: string;
  created_at: string;
  [key: string]: unknown;
};

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly client: SupabaseClient | null = HAS_SUPABASE
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    : null;

  private warnedAboutSchema = false;
  private scoreColumn: ScoreColumnName | null = null;

  /**
   * PUBLIC_INTERFACE
   * Save a single score row to the `scores` table.
   *
   * - Uses `result` column by default (per README schema).
   * - Falls back to `score` if the table uses that older column name.
   * - If Supabase is not configured, returns a safe failure result (callers may ignore).
   */
  async saveScore(
    username: string,
    score: number,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!this.client) {
      return { ok: false, message: 'Score saving is unavailable in this build.' };
    }

    // Prefer cached column choice if we already discovered it.
    const preferred: ScoreColumnName = this.scoreColumn ?? 'result';

    const primary = await this.client.from('scores').insert(this.buildInsertPayload(preferred, username, score));
    if (!primary.error) {
      this.scoreColumn = preferred;
      return { ok: true };
    }

    // Missing table / schema.
    if (this.isMissingTableError(primary.error)) {
      return { ok: false, message: this.schemaHelpMessage() };
    }

    // Fallback if the chosen score column doesn't exist.
    if (this.isMissingColumnError(primary.error, preferred)) {
      const fallback: ScoreColumnName = preferred === 'result' ? 'score' : 'result';
      const secondary = await this.client
        .from('scores')
        .insert(this.buildInsertPayload(fallback, username, score));

      if (!secondary.error) {
        this.scoreColumn = fallback;
        return { ok: true };
      }

      if (secondary.error && this.isMissingTableError(secondary.error)) {
        return { ok: false, message: this.schemaHelpMessage() };
      }

      return { ok: false, message: `Failed to save score: ${secondary.error?.message ?? 'Unknown error'}` };
    }

    return { ok: false, message: `Failed to save score: ${primary.error.message}` };
  }

  /**
   * PUBLIC_INTERFACE
   * Returns the aggregated top-10 leaderboard, computed from rows in the `scores` table.
   *
   * Tie-breaker: most recent play (latest `created_at`) when totals are equal.
   *
   * Behavior:
   * - If Supabase is not configured, returns `[]` (safe fallback).
   * - If schema/policies are missing, throws an Error with instructions (caller should catch).
   */
  async getLeaderboard(): Promise<LeaderboardRow[]> {
    if (!this.client) return [];

    const preferred: ScoreColumnName = this.scoreColumn ?? 'result';
    const resPrimary = await this.client
      .from('scores')
      .select(`username,${preferred},created_at`)
      .order('created_at', { ascending: false })
      .limit(1000);

    // If the preferred column isn't present, try the fallback column name.
    if (resPrimary.error && this.isMissingColumnError(resPrimary.error, preferred)) {
      const fallback: ScoreColumnName = preferred === 'result' ? 'score' : 'result';
      const resFallback = await this.client
        .from('scores')
        .select(`username,${fallback},created_at`)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (resFallback.error) {
        if (this.isMissingTableError(resFallback.error)) throw new Error(this.schemaHelpMessage());
        throw new Error(`Failed to load leaderboard: ${resFallback.error.message}`);
      }

      this.scoreColumn = fallback;
      return this.aggregateLeaderboard(resFallback.data as ScoreSelectRow[], fallback);
    }

    if (resPrimary.error) {
      if (this.isMissingTableError(resPrimary.error)) throw new Error(this.schemaHelpMessage());
      throw new Error(`Failed to load leaderboard: ${resPrimary.error.message}`);
    }

    this.scoreColumn = preferred;
    return this.aggregateLeaderboard(resPrimary.data as ScoreSelectRow[], preferred);
  }

  private buildInsertPayload(column: ScoreColumnName, username: string, score: number): Record<string, unknown> {
    return column === 'result' ? { username, result: score } : { username, score };
  }

  private aggregateLeaderboard(rows: ScoreSelectRow[], scoreColumn: ScoreColumnName): LeaderboardRow[] {
    const byUser = new Map<string, { username: string; total: number; last_played: Date }>();

    for (const r of rows) {
      const username = typeof r.username === 'string' ? r.username : '';
      if (!username) continue;

      const rawScore = Number(r[scoreColumn] ?? 0);
      const score = Number.isFinite(rawScore) ? rawScore : 0;

      const playedAt = this.parseDateSafe(r.created_at);

      const current = byUser.get(username);
      if (!current) {
        byUser.set(username, { username, total: score, last_played: playedAt });
      } else {
        current.total += score;
        if (playedAt.getTime() > current.last_played.getTime()) current.last_played = playedAt;
      }
    }

    return Array.from(byUser.values())
      .sort((a, b) => b.total - a.total || b.last_played.getTime() - a.last_played.getTime())
      .slice(0, 10)
      .map((r) => ({ username: r.username, total: r.total, last_played: r.last_played }));
  }

  private parseDateSafe(value: unknown): Date {
    if (typeof value !== 'string') return new Date(0);
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms) : new Date(0);
  }

  private isMissingTableError(error: SupabaseErrorLike): boolean {
    const msg = (error.message || '').toLowerCase();
    // Common PostgREST messages when table is absent
    return (
      (msg.includes('relation') && msg.includes('does not exist')) ||
      msg.includes('could not find the table') ||
      msg.includes('unknown table') ||
      msg.includes('schema cache')
    );
  }

  private isMissingColumnError(error: SupabaseErrorLike, column: string): boolean {
    const msg = (error.message || '').toLowerCase();
    const c = column.toLowerCase();
    return msg.includes('column') && msg.includes(c) && (msg.includes('does not exist') || msg.includes('not found'));
  }

  private schemaHelpMessage(): string {
    if (this.warnedAboutSchema) {
      return `Supabase table "scores" is missing or not accessible. Please create it in Supabase SQL editor.`;
    }

    this.warnedAboutSchema = true;

    // Keep message aligned with repo README schema (`result` column).
    return `Supabase table "scores" is missing or not accessible.
Create it in Supabase SQL editor with:

create extension if not exists "uuid-ossp";

create table if not exists public.scores (
  id uuid primary key default uuid_generate_v4(),
  username text not null,
  result numeric not null,
  created_at timestamptz not null default now()
);

-- Optional: allow anon inserts/selects for MVP (adjust for production)
alter table public.scores enable row level security;

create policy "anon_read_scores"
on public.scores for select
to anon
using (true);

create policy "anon_insert_scores"
on public.scores for insert
to anon
with check (true);`;
  }
}
