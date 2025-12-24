/**
 * Runtime-injected environment config.
 *
 * The deployment/preview system should generate this file at runtime (or during container start)
 * to expose NG_APP_* variables to the browser.
 *
 * For local development, you may edit this file manually (do NOT commit secrets in real projects).
 */
window.__env = window.__env || {};
// Expected keys:
// window.__env.NG_APP_SUPABASE_URL = "https://xyz.supabase.co";
// window.__env.NG_APP_SUPABASE_KEY = "anon_key";
