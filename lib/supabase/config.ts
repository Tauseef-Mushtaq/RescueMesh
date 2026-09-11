/**
 * Centralized environment-variable access and validation for Supabase.
 *
 * Only the Supabase variables are validated here. GEMINI_API_KEY is
 * intentionally NOT validated in this module — that belongs to the
 * Gemini/AI module.
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env.local and fill it in.`
    );
  }
  return value;
}

/** Public, browser-safe Supabase config. */
export function getPublicSupabaseConfig() {
  return {
    url: requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL
    ),
    anonKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ),
  };
}

/**
 * Server-only Supabase config, including the service-role key.
 *
 * Never import this file from client components — it will throw if
 * `SUPABASE_SERVICE_ROLE_KEY` is unset, and the key itself must never
 * be sent to the browser.
 */
export function getServiceSupabaseConfig() {
  return {
    ...getPublicSupabaseConfig(),
    serviceRoleKey: requireEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
  };
}
