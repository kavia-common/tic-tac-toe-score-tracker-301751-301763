import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getRuntimeEnv } from '../env';

export type GameResult = 'win' | 'draw' | 'loss';

export interface LeaderboardRow {
  username: string;
  total_score: number;
  latest_played: string;
}

/**
 * Scores table shape.
 * Note: DB may contain additional columns; we only depend on these.
 */
interface ScoreRow {
  id?: string;
  username: string;
  result: number; // 1 | 0.5 | 0
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly client: SupabaseClient | null;

  private warnedAboutSchema = false;

  constructor() {
    const url = getRuntimeEnv('NG_APP_SUPABASE_URL');
    const key = getRuntimeEnv('NG_APP_SUPABASE_KEY');

    if (!url || !key) {
      // Fail gracefully: app still runs, but scores won't persist.
      this.client = null;
      console.warn(
        '[Supabase] Missing NG_APP_SUPABASE_URL / NG_APP_SUPABASE_KEY. Score saving is disabled.',
      );
      return;
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  /**
   * PUBLIC_INTERFACE
   * Returns whether Supabase is configured.
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * PUBLIC_INTERFACE
   * Save a single game result row. If the table doesn't exist and the current key lacks permissions
   * to create it, we return a user-actionable error but do not crash the app.
   */
  async saveScore(username: string, result: GameResult): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!this.client) {
      return { ok: false, message: 'Supabase is not configured (missing env vars).' };
    }

    const numeric = this.mapResultToScore(result);
    const payload: ScoreRow = { username, result: numeric };

    const insert = await this.client.from('scores').insert(payload);

    if (!insert.error) return { ok: true };

    // Missing table / schema: show manual SQL instruction.
    if (this.isMissingTableError(insert.error)) {
      const msg = this.schemaHelpMessage();
      this.warnedAboutSchema = true;
      return { ok: false, message: msg };
    }

    return { ok: false, message: `Failed to save score: ${insert.error.message}` };
  }

  /**
   * PUBLIC_INTERFACE
   * Fetch top 10 leaderboard rows, aggregated by username.
   * Sorting: total score desc, then latest_played desc.
   *
   * Note: Without a custom SQL view/RPC, we aggregate on the client by reading recent rows.
   * For MVP we fetch up to 1000 latest rows and compute totals.
   */
  async getLeaderboard(): Promise<{ ok: true; data: LeaderboardRow[] } | { ok: false; message: string }> {
    if (!this.client) {
      return { ok: false, message: 'Supabase is not configured (missing env vars).' };
    }

    const res = await this.client
      .from('scores')
      .select('username,result,created_at')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!res.error && res.data) {
      const map = new Map<string, { total: number; latest: string }>();

      for (const row of res.data as ScoreRow[]) {
        if (!row.username || typeof row.result !== 'number' || !row.created_at) continue;
        const prev = map.get(row.username);
        if (!prev) {
          map.set(row.username, { total: row.result, latest: row.created_at });
        } else {
          prev.total += row.result;
          // Because rows are ordered desc, first is latest. But keep max just in case.
          if (row.created_at > prev.latest) prev.latest = row.created_at;
        }
      }

      const rows: LeaderboardRow[] = Array.from(map.entries()).map(([username, agg]) => ({
        username,
        total_score: Number(agg.total.toFixed(2)),
        latest_played: agg.latest,
      }));

      rows.sort((a, b) => {
        if (b.total_score !== a.total_score) return b.total_score - a.total_score;
        return b.latest_played.localeCompare(a.latest_played);
      });

      return { ok: true, data: rows.slice(0, 10) };
    }

    if (res.error && this.isMissingTableError(res.error)) {
      return { ok: false, message: this.schemaHelpMessage() };
    }

    return { ok: false, message: `Failed to load leaderboard: ${res.error?.message ?? 'Unknown error'}` };
  }

  /**
   * PUBLIC_INTERFACE
   * Optional helper: get a user's recent history (last 20 games).
   */
  async getUserHistory(
    username: string,
  ): Promise<{ ok: true; data: ScoreRow[] } | { ok: false; message: string }> {
    if (!this.client) {
      return { ok: false, message: 'Supabase is not configured (missing env vars).' };
    }

    const res = await this.client
      .from('scores')
      .select('id,username,result,created_at')
      .eq('username', username)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!res.error && res.data) return { ok: true, data: res.data as ScoreRow[] };

    if (res.error && this.isMissingTableError(res.error)) {
      return { ok: false, message: this.schemaHelpMessage() };
    }

    return { ok: false, message: `Failed to load history: ${res.error?.message ?? 'Unknown error'}` };
  }

  private mapResultToScore(result: GameResult): number {
    if (result === 'win') return 1;
    if (result === 'draw') return 0.5;
    return 0;
  }

  private isMissingTableError(error: { message: string; code?: string }): boolean {
    const msg = (error.message || '').toLowerCase();
    // Common PostgREST messages when table is absent
    return (
      msg.includes('relation') && msg.includes('does not exist')
    ) || msg.includes('could not find the table') || msg.includes('unknown table') || msg.includes('schema cache');
  }

  private schemaHelpMessage(): string {
    if (this.warnedAboutSchema) {
      return `Supabase table "scores" is missing or not accessible. Please create it in Supabase SQL editor.`;
    }

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
