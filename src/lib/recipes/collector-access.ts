/**
 * The gate every collector-facing recipe goes through.
 *
 * ONE MODULE, NOT TWO COPIES. Collector Spotlight posts a person, and two
 * recipes do it from different angles. The privacy rules are the part that
 * must never drift between them, so they live here and both recipes call in.
 *
 * KICKIO IS OPT-OUT, AND BOTH SWITCHES DEFAULT TO TRUE
 *
 *   profiles.collection_public          "my collection is public"
 *   collector_profile.featured_consent  "Kickio may feature me"
 *
 * So most collectors are eligible from the day they sign up, and the switches
 * are an exclusion list rather than a waiting list. They are still read on
 * every run: an opt-out nobody checks is a decorative column.
 *
 * DEFENCE IN DEPTH, NOT DEFENCE IN COMMENTS
 *
 * The role SQL enforces both switches, the `hidden` flag, and the absence of
 * `paid_cents`, in Kickio's own policies. This module enforces them again. The
 * duplication is the point: either layer alone is one careless edit from not
 * existing, and the cost of getting it wrong is a real person's name on a post
 * they asked not to be on.
 *
 * WHAT IS NEVER READ, LET ALONE PUBLISHED
 *
 * `collections.paid_cents` and `collection_snapshots.total_cents`. A named
 * collector beside a total value is a shopping list for a burglar. The role is
 * not granted those columns, so this is enforced below the application - but
 * no query here asks for them either.
 *
 * BLIND IS NOT EMPTY
 *
 * Under RLS, a role with no matching policy reads zero rows and raises no
 * error. Sold This Week sat disabled for exactly this reason, and "no
 * collectors qualify" would be a plausible-looking lie the week the engine
 * quietly lost its grant. `probeAccess` tells the two apart and says which.
 */
import { kickio } from "../kickio/client.ts";
import { pageAll, pageIn } from "../kickio/page.ts";
import { engine } from "../engine/client.ts";
import { KICKIO_DIRECT_SELLER, APPROVED_PARTNER_SELLER } from "./grail-of-the-day.ts";

/** Both Collector Spotlight recipes share one cooldown, keyed on the person. */
export const COLLECTOR_RECIPE_KEYS = ["collector_spotlight", "collector_set_progress"] as const;

/** Six months, so one collector cannot headline twice in a season. */
export const DEFAULT_COLLECTOR_COOLDOWN_DAYS = 180;

/**
 * Accounts that are not people.
 *
 * Kickio's own account and the partner seller both have collections, both have
 * `collection_public` and `featured_consent` set to true, and both look exactly
 * like a collector to every check in this module. Today they are the two
 * biggest "collections" on the platform, so without this the first Collector
 * Spotlight would have been Kickio posting "look at this collector" about
 * itself.
 *
 * Reused from grail-of-the-day rather than re-typed: the same two UUIDs already
 * mean "this is us" there, and two lists of house accounts would drift.
 */
export const HOUSE_ACCOUNTS = [KICKIO_DIRECT_SELLER, APPROVED_PARTNER_SELLER];

/**
 * A seeded fixture rather than a person.
 *
 * `00000000-0000-0000-...` is not a UUID anybody was assigned. This is a
 * heuristic and it is deliberately narrow - it catches the zero-prefix
 * fixtures and nothing else. Real exclusions belong in HOUSE_ACCOUNTS or in
 * `excludeUserIds`, where they are visible.
 */
export function isFixtureId(userId: string): boolean {
  return /^00000000-0000-0000/.test(userId);
}

export type BlockReason = "house" | "excluded" | null;

export function blockReasonFor(userId: string, excluded: string[] = []): BlockReason {
  if (HOUSE_ACCOUNTS.includes(userId) || isFixtureId(userId)) return "house";
  return excluded.includes(userId) ? "excluded" : null;
}

export interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  collection_public: boolean | null;
  deleted_at: string | null;
}

export interface CollectorProfileRow {
  user_id: string;
  chosen_title: string | null;
  featured_consent: boolean | null;
  streak_weeks: number | null;
}

export interface CollectionRow {
  user_id: string;
  product_id: string | null;
  acquired_at: string | null;
  hidden: boolean | null;
}

/**
 * Is this collector postable?
 *
 * Both switches must be explicitly true. A missing `collector_profile` row is
 * NOT consent: that user has never been shown the switch, and reading a column
 * default as agreement is how an opt-out becomes a surprise. The role SQL fails
 * closed the same way, and says how to change it if you would rather not.
 */
export function mayFeature(
  profile: ProfileRow | undefined,
  collector: CollectorProfileRow | undefined,
): boolean {
  if (!profile || profile.deleted_at !== null) return false;
  if (profile.collection_public !== true) return false;
  if (!collector) return false;
  return collector.featured_consent === true;
}

/**
 * What to call someone on a post.
 *
 * Their handle or the name they chose, never a real name, never a location -
 * `profiles` carries `full_name`, `city`, `signup_city` and `last_login_city`,
 * and none of them belong on a shirt post.
 */
export function publicName(profile: ProfileRow): string | null {
  const display = profile.display_name?.trim();
  if (display) return display;
  const username = profile.username?.trim();
  return username ? `@${username}` : null;
}

export type AccessVerdict =
  | { ok: true; collectors: number }
  | { ok: false; blind: true; reason: string }
  | { ok: false; blind: false; reason: string };

/**
 * Tell "we cannot see collections" apart from "nobody has one yet".
 *
 * `profiles` is readable by every role including anon; `collections` is not
 * readable without the scoped role. So profiles-with-rows and collections-with-
 * none is the signature of a missing grant, and it is worth saying out loud on
 * the run log rather than reporting a shortage of collectors.
 */
export function readAccess(profiles: number, collections: number): AccessVerdict {
  if (collections > 0) return { ok: true, collectors: collections };
  if (profiles === 0) {
    return { ok: false, blind: false, reason: "Kickio has no profiles to read" };
  }
  return {
    ok: false,
    blind: true,
    // Conclusion, then the evidence, then the two steps. This string is also
    // the skip reason on the run log, so it has to stand on its own there as
    // well as under a heading in Settings.
    reason:
      "The engine cannot see Kickio collections — it read " +
      `${profiles} profiles but 0 collection rows, so it is still connecting as ` +
      "`anon`. The kickio_content_reader role was applied on 2026-09-19 and " +
      "can see 23 collection rows, so the grant is in place and the " +
      "credential is not: point KICKIO_SUPABASE_PUBLISHABLE_KEY at a " +
      "kickio_content_reader key (docs/unblocking-sold-this-week.md).",
  };
}

export interface CollectorSummary {
  userId: string;
  name: string;
  title: string | null;
  /** Shirts owned, excluding hidden ones. */
  shirts: number;
  /** When they last added one, for "still collecting" vs dormant. */
  lastAcquired: string | null;
}

export interface CollectorOption extends CollectorSummary {
  lastPostedAt: string | null;
  available: boolean;
  /**
   * Set when this account may never be posted, whatever its consent flags or
   * cooldown say. Listed rather than hidden, so Settings can show WHY the
   * biggest collection on the platform is not on offer.
   */
  blocked: BlockReason;
}

/**
 * Every collection row the engine is allowed to see.
 *
 * Paged, because PostgREST caps a response at a server-configured row count and
 * a single large `.limit()` silently returns a prefix - every count downstream
 * then comes out short. This loop used to be written out here by hand; it now
 * goes through lib/kickio/page.ts, which is the same logic in one place rather
 * than three slightly different copies of it.
 *
 * Note the select list: `paid_cents` is absent, and the role is not granted it.
 */
export async function allCollectionRows(): Promise<CollectionRow[]> {
  return pageAll<CollectionRow>("Loading collections", (from, to) =>
    kickio()
      .from("collections")
      .select("user_id,product_id,acquired_at,hidden")
      .order("user_id", { ascending: true })
      .range(from, to),
  );
}

/**
 * Collectors this engine may post about, biggest collection first.
 *
 * Shared by the two recipes and by the Settings picker, so the list an admin
 * chooses from is exactly the list the recipe will accept.
 */
export function summarise(
  profiles: ProfileRow[],
  collectors: CollectorProfileRow[],
  collections: CollectionRow[],
): CollectorSummary[] {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const consent = new Map(collectors.map((c) => [c.user_id, c]));
  const owned = new Map<string, { shirts: number; last: string | null }>();

  for (const row of collections) {
    // Belt and braces: the policy excludes hidden rows too.
    if (row.hidden === true) continue;
    if (!row.product_id) continue;
    const entry = owned.get(row.user_id) ?? { shirts: 0, last: null };
    entry.shirts++;
    if (row.acquired_at && (!entry.last || row.acquired_at > entry.last)) {
      entry.last = row.acquired_at;
    }
    owned.set(row.user_id, entry);
  }

  const out: CollectorSummary[] = [];
  for (const [userId, entry] of owned) {
    const profile = byId.get(userId);
    const collector = consent.get(userId);
    if (!mayFeature(profile, collector)) continue;
    const name = publicName(profile!);
    if (!name) continue;
    out.push({
      userId,
      name,
      title: collector!.chosen_title?.trim() || null,
      shirts: entry.shirts,
      lastAcquired: entry.last,
    });
  }
  return out.sort((a, b) => b.shirts - a.shirts);
}

/** Case-stable identity for cooldown and dedupe. */
export function subjectRefFor(userId: string, kind: "spotlight" | "progress", suffix = ""): string {
  return `collector:${userId}:${kind}${suffix}`;
}

/**
 * When each collector was last posted, across BOTH recipes.
 *
 * Keyed on the person rather than the recipe. Two recipes with private
 * cooldowns would put the same collector on the feed twice in a fortnight
 * under two different headlines, which reads worse than a repeat.
 */
export async function lastPostedByCollector(): Promise<Map<string, string>> {
  const { data, error } = await engine()
    .from("post_drafts")
    .select("recipe_key,subject_ref,created_at")
    .in("recipe_key", [...COLLECTOR_RECIPE_KEYS])
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Cooldown lookup failed: ${error.message}`);

  const out = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ subject_ref: string; created_at: string }>) {
    const userId = parseCollectorRef(row.subject_ref);
    if (userId && !out.has(userId)) out.set(userId, row.created_at);
  }
  return out;
}

export function parseCollectorRef(ref: string): string | null {
  const match = /^collector:([0-9a-fA-F-]{36}):/.exec(ref);
  return match ? match[1] : null;
}

export function withCooldown(
  collectors: CollectorSummary[],
  lastPosted: Map<string, string>,
  cooldownDays: number,
  now: Date = new Date(),
  excludeUserIds: string[] = [],
): CollectorOption[] {
  const cutoff = now.getTime() - cooldownDays * 86_400_000;
  return collectors
    .map((c) => {
      const posted = lastPosted.get(c.userId) ?? null;
      const blocked = blockReasonFor(c.userId, excludeUserIds);
      return {
        ...c,
        lastPostedAt: posted,
        // A house account is never available, however long ago it last ran.
        available: blocked === null && (!posted || new Date(posted).getTime() < cutoff),
        blocked,
      };
    })
    .sort((a, b) => {
      // Available first. A greyed name at the top of the list is an invitation
      // to pick the one thing that will not work.
      if (a.available !== b.available) return a.available ? -1 : 1;
      return b.shirts - a.shirts;
    });
}

/**
 * The collectors a recipe may actually post, as opposed to the ones Settings
 * lists. Blocked accounts are filtered here and NOT left to the `available`
 * flag, because a queued pick bypasses `available` on purpose - queueing
 * Kickio's own account must still be impossible.
 */
export function postable(options: CollectorOption[]): CollectorOption[] {
  return options.filter((c) => c.blocked === null);
}

/** Load everything both recipes and the Settings picker need, in one place. */
export async function loadCollectors(
  cooldownDays = DEFAULT_COLLECTOR_COOLDOWN_DAYS,
  excludeUserIds: string[] = [],
): Promise<{ options: CollectorOption[]; access: AccessVerdict }> {
  // All three paged. `.limit(5000)` did not raise the cap - PostgREST stops at
  // 1,000 rows and says nothing - so past that point a collector simply would
  // not exist as far as this engine was concerned, and `readAccess` below
  // counts these rows to decide whether the engine is blind at all.
  const [profiles, collectorRows, collections] = await Promise.all([
    pageAll<ProfileRow>("Loading profiles", (from, to) =>
      kickio()
        .from("profiles")
        .select("id,username,display_name,collection_public,deleted_at")
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    pageAll<CollectorProfileRow>("Loading collector profiles", (from, to) =>
      kickio()
        .from("collector_profile")
        .select("user_id,chosen_title,featured_consent,streak_weeks")
        .order("user_id", { ascending: true })
        .range(from, to),
    ),
    allCollectionRows(),
  ]);
  const collectors = collectorRows;
  const access = readAccess(profiles.length, collections.length);
  if (!access.ok) return { options: [], access };

  const lastPosted = await lastPostedByCollector();
  return {
    options: withCooldown(
      summarise(profiles, collectors, collections),
      lastPosted,
      cooldownDays,
      new Date(),
      excludeUserIds,
    ),
    access,
  };
}
