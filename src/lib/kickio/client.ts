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
  | "sales_history"
  // Read-only, and only to label sellers in the settings screen.
  | "profiles";

/**
 * Postgres roles this engine is allowed to connect to Kickio as. An allowlist,
 * not a blocklist: a role that is not named here is refused, so a future key for
 * `postgres`, `service_role` or anything else privileged cannot be dropped into
 * the env and quietly gain write access.
 *
 *  - `anon`                  the public marketplace key; RLS-limited, no write policy
 *  - `kickio_content_reader` the scoped read-only role (docs/kickio-read-only-role.sql)
 */
const ALLOWED_ROLES = new Set(["anon", "kickio_content_reader"]);

/**
 * The role a Supabase key claims. Read without verifying the signature - the
 * server verifies that; here we only need to know what to refuse. Returns null
 * when the key states no role (e.g. a modern publishable key).
 */
function claimedRole(key: string): string | null {
  // Modern secret keys carry full privileges and never state a role.
  if (key.startsWith("sb_secret_")) return "service_role";
  if (key.startsWith("sb_publishable_")) return "anon";

  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { role?: string };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
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

  const role = claimedRole(key);
  if (role === null || !ALLOWED_ROLES.has(role)) {
    throw new Error(
      `Refusing to connect to Kickio as '${role ?? "unknown"}'. Kickio is ` +
        "read-only from this project, so only a credential for a role that " +
        `cannot write is accepted: ${[...ALLOWED_ROLES].join(", ")}.`,
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

export const __testing = { claimedRole, ALLOWED_ROLES };
