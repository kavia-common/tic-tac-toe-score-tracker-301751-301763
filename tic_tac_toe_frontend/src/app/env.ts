/**
 * Build-time environment access for browser/SSR.
 *
 * This app is configured to read Supabase settings from build-time env variables:
 * - NG_APP_SUPABASE_URL
 * - NG_APP_SUPABASE_KEY
 *
 * Notes:
 * - Some build setups inject env via `import.meta.env` (Vite-like).
 * - Some SSR/build environments expose env via `globalThis.process?.env` (builder/SSR fallback).
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
 * 2) globalThis.process?.env (builder/SSR fallback)
 */
export function getBuildEnv(key: BuildEnvKey): string | undefined {
  // 1) import.meta.env (Vite-like)
  const metaEnv =
    typeof import.meta !== 'undefined'
      ? ((import.meta as unknown as { env?: Record<string, unknown> }).env as
          | Record<string, unknown>
          | undefined)
      : undefined;

  const fromMeta = metaEnv?.[key];
  if (typeof fromMeta === 'string' && fromMeta.trim().length > 0) return fromMeta;

  // 2) globalThis.process?.env (builder adapters / SSR)
  const globalProcess = (globalThis as unknown as { process?: { env?: Record<string, unknown> } }).process;
  const fromGlobalProcess = globalProcess?.env?.[key];
  if (typeof fromGlobalProcess === 'string' && fromGlobalProcess.trim().length > 0) return fromGlobalProcess;

  return undefined;
}

/**
 * Supabase configuration values (build-time).
 * These are read once at module load time.
 */
export const SUPABASE_URL: string = (getBuildEnv('NG_APP_SUPABASE_URL') ?? '').trim();
export const SUPABASE_ANON_KEY: string = (getBuildEnv('NG_APP_SUPABASE_KEY') ?? '').trim();

/**
 * Whether Supabase has been configured correctly.
 * True only when both are non-empty strings.
 */
export const HAS_SUPABASE: boolean = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

// Startup diagnostics: print presence only (never values/secrets).
if (HAS_SUPABASE) {
  console.debug('[Supabase] Supabase env detected');
}
