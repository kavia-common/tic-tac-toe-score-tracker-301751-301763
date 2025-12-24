/**
 * Browser runtime env contract.
 * The runtime-env.js file defines window.__env.* keys.
 */
declare global {
  interface Window {
    __env?: Record<string, string | undefined>;
  }
}

export type RuntimeEnvKey = 'NG_APP_SUPABASE_URL' | 'NG_APP_SUPABASE_KEY';

/**
 * PUBLIC_INTERFACE
 * Reads a runtime env var exposed via window.__env (preferred) with a best-effort fallback
 * to process.env for environments where a bundler injects it.
 */
export function getRuntimeEnv(key: RuntimeEnvKey): string | undefined {
  // Prefer runtime-injected values (works for browser deployments)
  const fromWindow = typeof window !== 'undefined' ? window.__env?.[key] : undefined;
  if (fromWindow && fromWindow.trim().length > 0) return fromWindow;

  // Fallback (some build systems replace process.env.* during build)
  const fromProcess = (typeof process !== 'undefined'
    ? (process as { env?: Record<string, string | undefined> }).env?.[key]
    : undefined) as string | undefined;

  if (fromProcess && fromProcess.trim().length > 0) return fromProcess;

  return undefined;
}
