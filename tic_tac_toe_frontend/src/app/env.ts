/**
 * Build-time environment access for browser/SSR.
 *
 * This app is configured to read Supabase settings from build-time env variables:
 * - NG_APP_SUPABASE_URL
 * - NG_APP_SUPABASE_KEY
 *
 * Notes:
 * - Some build setups inject env via `import.meta.env` (Vite-like).
 * - Some SSR/build environments expose env via `process.env`.
 *
 * We intentionally do NOT rely on any runtime script like `runtime-env.js` or `window.__env`.
 */

export type BuildEnvKey = 'NG_APP_SUPABASE_URL' | 'NG_APP_SUPABASE_KEY';

/**
 * PUBLIC_INTERFACE
 * Reads a build-time env var from the current toolchain environment.
 *
 * Priority:
 * 1) import.meta.env (Vite-style)
 * 2) process.env (SSR/build fallback)
 */
export function getBuildEnv(key: BuildEnvKey): string | undefined {
  // 1) import.meta.env (Vite-like)
  const metaEnv = (typeof import.meta !== 'undefined'
    ? (import.meta as { env?: Record<string, unknown> }).env
    : undefined) as Record<string, unknown> | undefined;

  const fromMeta = metaEnv?.[key];
  if (typeof fromMeta === 'string' && fromMeta.trim().length > 0) return fromMeta;

  // 2) process.env (SSR/build fallback)
  const fromProcess = (typeof process !== 'undefined'
    ? (process as { env?: Record<string, string | undefined> }).env?.[key]
    : undefined) as string | undefined;

  if (typeof fromProcess === 'string' && fromProcess.trim().length > 0) return fromProcess;

  return undefined;
}

/**
 * Supabase configuration values (build-time).
 * These are read once at module load time.
 */
export const SUPABASE_URL = getBuildEnv('NG_APP_SUPABASE_URL');
export const SUPABASE_ANON_KEY = getBuildEnv('NG_APP_SUPABASE_KEY');

/**
 * Whether Supabase has been configured correctly.
 */
export const HAS_SUPABASE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// Defensive diagnostics: print presence only (never values).
console.info('[env] NG_APP_SUPABASE_URL present:', !!SUPABASE_URL);
console.info('[env] NG_APP_SUPABASE_KEY present:', !!SUPABASE_ANON_KEY);

