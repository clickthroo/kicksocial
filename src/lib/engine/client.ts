/**
 * The content engine's own database. Unlike the Kickio client this one may
 * write - but only ever to the engine's own project, never to Kickio.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function engine(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.ENGINE_SUPABASE_URL;
  const key = process.env.ENGINE_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("ENGINE_SUPABASE_URL and ENGINE_SUPABASE_SERVICE_KEY must be set.");
  }

  if (process.env.KICKIO_SUPABASE_URL && url === process.env.KICKIO_SUPABASE_URL) {
    // A misconfiguration here would point write credentials at the live
    // marketplace. Fail loudly rather than risk it.
    throw new Error(
      "ENGINE_SUPABASE_URL is the same as KICKIO_SUPABASE_URL. The engine must " +
        "not hold write credentials to the Kickio database.",
    );
  }

  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

export function resetEngineClient(): void {
  cached = null;
}
