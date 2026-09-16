/**
 * Read-only access to the Kickio marketplace database.
 *
 * Kickio is the live marketplace. This engine must never write to it. That rule
 * is enforced here in three independent layers, so it survives a careless edit:
 *
 *   1. Credential  - only a publishable/anon key is accepted. A service-role key
 *                    is rejected at construction, because such a key bypasses RLS
 *                    and could write.
 *   2. Surface     - the exported client exposes `select` only. There is no
 *                    `insert`/`update`/`delete`/`upsert`/`rpc` to reach for.
 *   3. Database    - Kickio's own RLS grants the anon role SELECT on public data
 *                    and no write policy, so a write is refused server-side even
 *                    if layers 1 and 2 were bypassed.
 *
 * If you find yourself needing to write to Kickio, stop: that is a change to the
 * live marketplace and needs explicit sign-off. It does not belong in this repo.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Kickio tables this engine is allowed to read. */
export type KickioTable =
  | "listings"
  | "products"
  | "teams"
  | "price_index_aggregates"
  | "price_index_history"
  | "sales_history";

/**
 * A service-role JWT carries `"role":"service_role"` in its payload and bypasses
 * RLS entirely. Detect it without verifying the signature - we only need to know
 * what the token claims to be in order to refuse it.
 */
function claimsServiceRole(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

/** Only the read half of the query builder is exposed to callers. */
export interface ReadOnlyTable {
  select: SupabaseClient["from"] extends (t: string) => infer B
    ? B extends { select: infer S }
      ? S
      : never
    : never;
}

export interface KickioReader {
  from(table: KickioTable): ReadOnlyTable;
}

let cached: KickioReader | null = null;

export function kickio(): KickioReader {
  if (cached) return cached;

  const url = process.env.KICKIO_SUPABASE_URL;
  const key = process.env.KICKIO_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "KICKIO_SUPABASE_URL and KICKIO_SUPABASE_PUBLISHABLE_KEY must be set. " +
        "Use Kickio's publishable (anon) key - never a service-role key.",
    );
  }

  if (claimsServiceRole(key)) {
    throw new Error(
      "Refusing to connect to Kickio with a service-role key. That key bypasses " +
        "row-level security and can write to the live marketplace. Use the " +
        "publishable (anon) key instead.",
    );
  }

  const raw = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "kickio-content-engine (read-only)" } },
  });

  cached = {
    from(table: KickioTable) {
      const builder = raw.from(table);
      // Hand back only `select`. Bound to the builder so PostgREST still works,
      // but insert/update/delete/upsert are simply not reachable from here.
      return { select: builder.select.bind(builder) } as ReadOnlyTable;
    },
  };

  return cached;
}

/** Test seam: drop the memoised client so env changes take effect. */
export function resetKickioClient(): void {
  cached = null;
}

export const __testing = { claimsServiceRole };
