import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "./config";

/**
 * Browser-safe Supabase client for use in Client Components.
 *
 * Uses only the public URL and anon key — never the service-role key.
 */
export function createClient() {
  const { url, anonKey } = getPublicSupabaseConfig();
  return createBrowserClient(url, anonKey);
}
