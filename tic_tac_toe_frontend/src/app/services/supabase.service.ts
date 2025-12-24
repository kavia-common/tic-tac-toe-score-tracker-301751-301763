import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HAS_SUPABASE, SUPABASE_ANON_KEY, SUPABASE_URL } from '../env';

export interface TopScoreRow {
  username: string;
  score: number;
  created_at: string;
}

/**
 * Scores table shape.
 * Note: DB may contain additional columns; we only depend on these.
 */
interface ScoreRow {
  id?: string;
  username: string;
  score: number;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly client: SupabaseClient | null;

  private warnedAboutSchema = false;

  constructor() {
    if (!HAS_SUPABASE) {
      // Fail gracefully: app still runs, but scores won't persist.
      this.client = null;
      // Do not spam the UI; callers can handle safe fallbacks.
      console.warn('[Supabase] Not configured (missing env vars). Score saving is disabled.');
      return;
    }

    // If HAS_SUPABASE is true, these are non-empty strings by construction.
    this.client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
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
   * Save a single score row.
   *
   * If Supabase is not configured, returns a safe error result.
   */
  async saveScore(
    username: string,
    score: number,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!this.client) {
      // If HAS_SUPABASE is true, we should not hit this; but return safely anyway.
      console.error('[Supabase] saveScore called but client is not initialized.');
      return { ok: false, message: 'Score saving is unavailable right now.' };
    }

    const payload: ScoreRow = { username, score };

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
   * Fetch top scores (default 10), sorted by score desc then created_at desc.
   *
   * Returns a safe empty list when Supabase isn't configured.
   */
  async getTopScores(
    limit = 10,
  ): Promise<{ ok: true; data: TopScoreRow[] } | { ok: false; message: string; data: TopScoreRow[] }> {
    if (!this.client) {
      console.error('[Supabase] getTopScores called but client is not initialized.');
      return { ok: false, message: 'Leaderboard is unavailable right now.', data: [] };
    }

    const res = await this.client
      .from('scores')
      .select('username,score,created_at')
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!res.error && res.data) {
      return { ok: true, data: res.data as TopScoreRow[] };
    }

    if (res.error && this.isMissingTableError(res.error)) {
      return { ok: false, message: this.schemaHelpMessage(), data: [] };
    }

    return {
      ok: false,
      message: `Failed to load leaderboard: ${res.error?.message ?? 'Unknown error'}`,
      data: [],
    };
  }

  private isMissingTableError(error: { message: string; code?: string }): boolean {
    const msg = (error.message || '').toLowerCase();
    // Common PostgREST messages when table is absent
    return (
      (msg.includes('relation') && msg.includes('does not exist')) ||
      msg.includes('could not find the table') ||
      msg.includes('unknown table') ||
      msg.includes('schema cache')
    );
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
  score numeric not null,
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
