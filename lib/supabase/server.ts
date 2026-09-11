import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig, getServiceSupabaseConfig } from "./config";

/**
 * Session-aware server-side Supabase client for Server Components,
 * Route Handlers, and Server Actions. Reads/writes auth cookies via
 * `next/headers`, and uses the public anon key — RLS still applies.
 */
export async function createClient() {
  const { url, anonKey } = getPublicSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component without a mutable cookie
          // store. Safe to ignore if middleware handles session refresh.
        }
      },
    },
  });
}

/**
 * Privileged, service-role Supabase client. Bypasses RLS.
 *
 * SERVER-ONLY. Never import this from a Client Component and never
 * send its output to the browser. Intended for trusted backend
 * operations (e.g. AI pipelines, admin tasks) in later modules.
 */
export function createServiceClient() {
  const { url, serviceRoleKey } = getServiceSupabaseConfig();
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
