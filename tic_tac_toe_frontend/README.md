# Tic Tac Toe (Angular) + Supabase

A minimal Tic Tac Toe MVP that:
- lets users enter a username
- play a 3x3 game vs a simple AI (random move) or 2-player alternating turns
- saves each game result to Supabase (`win=1`, `draw=0.5`, `loss=0`)
- shows a top-10 leaderboard aggregated by total score (tie-breaker: most recent play)

## Running (dev)

```bash
npm install
npm start
```

The dev server runs on **port 3000** (see `angular.json`).

## Environment variables

This app expects the following variables (provided by the platform) at **build time**:

- `NG_APP_SUPABASE_URL`
- `NG_APP_SUPABASE_KEY` (anon key)

### How env vars are wired (build-time)

The Angular app reads these values from the build toolchain environment (e.g. `import.meta.env`), not from a runtime script.
There is **no** `runtime-env.js` and **no** `window.__env` usage.

To change values locally, set them in your `.env` (or the environment used by your platform) and restart the dev server.

Example `.env`:

```bash
NG_APP_SUPABASE_URL=https://xxx.supabase.co
NG_APP_SUPABASE_KEY=your_anon_key
```

## Supabase schema

This app expects a `scores` table:

```sql
create extension if not exists "uuid-ossp";

create table if not exists public.scores (
  id uuid primary key default uuid_generate_v4(),
  username text not null,
  result numeric not null,
  created_at timestamptz not null default now()
);

-- Optional MVP policies (adjust for production!)
alter table public.scores enable row level security;

create policy "anon_read_scores"
on public.scores for select
to anon
using (true);

create policy "anon_insert_scores"
on public.scores for insert
to anon
with check (true);
```

If the table/policies are missing, the app will show a toast with instructions and continue running.
