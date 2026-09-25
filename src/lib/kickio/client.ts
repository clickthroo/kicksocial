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
import { engineCredentials, engineToken, resetEngineSession } from "./engine-session.ts";

/** Kickio tables this engine is allowed to read. */
export type KickioTable =
  | "listings"
  | "products"
  | "teams"
  | "price_index_aggregates"
  | "price_index_history"
  | "sales_history"
  // Read-only: Kickio's curated collection lists and their numbered slots.
  | "collection_sets"
  | "collection_set_slots"
  // Personal data. Reachable only as `kickio_content_reader`, which holds
  // COLUMN-level grants (docs/kickio-read-only-role.sql): `paid_cents` and the
  // valuation tables are not granted at all, so the engine cannot read what a
  // collector paid even if a future query asks for it.
  | "collections"
  | "collector_profile"
  | "collection_highlights"
  // Read-only, and only to label sellers in the settings screen.
  | "profiles"
  // Read-only: the buyer protection fee, so posted prices match the site.
  | "marketplace_settings";

/**
 * Tables the engine must read as `anon`, NOT as its signed-in role.
 *
 * `listings` carries an RLS policy whose fourth OR branch is
 * `EXISTS (SELECT 1 FROM orders o WHERE o.listing_id = listings.id AND ...)`,
 * and Postgres checks SELECT privilege on every table a policy touches before
 * it runs any of it - short-circuiting does not save you. The scoped role was
 * granted ten tables and `orders` is not one of them, so as
 * `kickio_content_reader` the table is not merely empty, it is
 * `permission denied for table orders` on every single read.
 *
 * `anon` has the same table-level grant on `orders` that Supabase gives every
 * project by default, so the policy evaluates, returns nothing, and the public
 * marketplace rows come back - all 1,634 of them. That is the right credential
 * for this table anyway: these are the listings anybody can see on kickio.com,
 * and reading them with the narrower key is the least privilege that works.
 *
 * Routed here rather than at the nine call sites, because a recipe added later
 * would have no way of knowing, and the failure is total rather than partial.
 *
 * The alternative fix - granting `kickio_content_reader` SELECT on `orders`
 * - is a change to Kickio's own permissions and needs sign-off there. It is
 * also more access than a content tool has any business holding.
 */
const PUBLIC_ONLY: ReadonlySet<KickioTable> = new Set<KickioTable>(["listings"]);

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

  // The key above is now only the GATEWAY credential - Kickio's edge refuses a
  // request whose `apikey` is not one of its own issued keys, which is what
  // killed the hand-minted token. Authorisation comes from the signed-in
  // session below, if one is configured.
  //
  // Without engine credentials this is exactly the client it has always been:
  // publishable key, `anon`, and the recipes that need more say so plainly.
  const signedIn = engineCredentials() !== null;

  const common = {
    auth: { persistSession: false, autoRefreshToken: false } as const,
    global: { headers: { "x-application-name": "kickio-content-engine (read-only)" } },
  };

  const raw = createClient(url, key, {
    ...common,
    // Checked on every issued token, not just the first: a hook that is
    // disabled later starts handing back `authenticated`, which on Kickio can
    // write. engine-session.ts refuses it rather than connecting.
    ...(signedIn ? { accessToken: () => engineToken(ALLOWED_ROLES) } : {}),
  });

  // The same key with no session on top, so the request arrives as whatever
  // the key itself claims. Identical to `raw` when no engine credentials are
  // configured.
  const publicRaw = signedIn ? createClient(url, key, common) : raw;

  cached = {
    from(table: KickioTable) {
      // This whole route depends on the gateway key being an `anon` key. The
      // allowlist above also permits a `kickio_content_reader` key, and if one
      // were set here the "public" client would be the scoped role too - and
      // the read would fail with a Postgres error about a table nobody
      // mentioned. Say what is actually wrong instead.
      if (PUBLIC_ONLY.has(table) && role !== "anon") {
        throw new Error(
          `Kickio's ${table} can only be read with an anon key, because its ` +
            "row-level policy reads `orders` and the scoped role has no grant " +
            `on that table. KICKIO_SUPABASE_PUBLISHABLE_KEY currently claims ` +
            `'${role}'. Set it to Kickio's publishable (anon) key; the engine ` +
            "sign-in still supplies the scoped role for everything else.",
        );
      }
      const builder = (PUBLIC_ONLY.has(table) ? publicRaw : raw).from(table);
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
  resetEngineSession();
}

export const __testing = { claimedRole, ALLOWED_ROLES, PUBLIC_ONLY };
