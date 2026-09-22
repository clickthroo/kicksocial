/**
 * Featured Collection - "The Kickio Grail List: 39 of 136 you can buy today."
 *
 * Kickio curates `collection_sets`: a named list of shirts with one numbered
 * slot each, filled in by hand as a matching product appears. The Grail List
 * has 136 slots. That structure is unusually good social material, because the
 * EMPTY slots are as interesting as the full ones - a collector who owns the
 * 1986 Argentina home has a reason to reply.
 *
 * THE SLOTS ARE THE SET'S, NOT A USER'S
 *
 * `collection_set_slots` has no user column: one row per slot per set, shared
 * by everyone. A collector's own progress against the list is computed from
 * `collections` (what they own) intersected with these slots, and is not stored
 * here. So this post is about Kickio's shelf, never about one person's
 * collection. `collection_set_prefs` and `collection_set_milestones` are the
 * per-user layer, and they hold preferences and achievements, not slots.
 *
 * THREE COUNTS THAT LOOK LIKE ONE
 *
 * 77 slots point at a product. 65 of those products are catalogue-active. Only
 * 39 have a listing you could actually buy. The gap matters because
 * `products` is Kickio's CATALOGUE - a shirt record exists whether or not
 * anyone is selling one - while `listings` is the shelf. Counting catalogue
 * rows and calling them "listed" puts 26 dead ends in a post whose whole
 * purpose is to send people to go and look. `buyable` is therefore counted
 * from `listings` with the same filter Grail of the Day uses, and the
 * catalogue-only slots are reported separately as `catalogued`.
 *
 * (`products.has_active_listing` happened to agree exactly with a real count
 * here - 0 disagreements either way across all 77. It is still not what the
 * post quotes: `teams.listings_count` also looked fine until it was checked,
 * and was out by a factor of two.)
 *
 * WHY IT ONLY POSTS WHEN THE NUMBER MOVES
 *
 * "39 of 136" is the same post every week until someone lists a grail. Rather
 * than a cadence, this recipe has a change rule: it runs weekly and skips
 * unless the list has actually progressed since the last one it posted. The
 * count is carried in the subject ref, so the dedupe machinery that stops a
 * repeat is the same machinery that lets a genuine change through.
 *
 * WHAT IT MUST NOT CLAIM
 *
 * The list is Kickio's editorial opinion, not a ranking anyone can check. The
 * brief forbids "the 136 greatest shirts" framing, and forbids implying the
 * whole list is buyable.
 */
import { kickio } from "../kickio/client.ts";
import { pageIn } from "../kickio/page.ts";
import { engine } from "../engine/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { imageUrls } from "./grail-of-the-day.ts";

export const FEATURED_COLLECTION_KEY = "featured_collection";

interface SetRow {
  id: string;
  slug: string | null;
  name: string | null;
  description: string | null;
  kind: string | null;
  visibility: string | null;
}

interface SlotRow {
  set_id: string;
  sort: number | null;
  label: string | null;
  product_id: string | null;
}

interface ProductRow {
  id: string;
  slug: string | null;
  name: string | null;
  team: string | null;
  season: string | null;
  status: string | null;
  deleted_at: string | null;
  primary_image_url: string | null;
}

export interface FeaturedCollectionConfig {
  /** A list worth posting has to be a list, not a shortlist. */
  minSlots: number;
  /** Fewest slots that must actually be buyable for the post to make sense. */
  minBuyable: number;
  /** Fewest renderable photos for the grid. */
  minPhotos: number;
  /** How many photos the card shows. */
  gridSize: number;
  /** How many missing slots to name in the copy. */
  huntSize: number;
  /** Smallest move in buyable-or-total that counts as news. */
  minGain: number;
  /** A floor under the change rule: never twice inside this many days. */
  cooldownDays: number;
}

export const DEFAULT_FEATURED_COLLECTION_CONFIG: FeaturedCollectionConfig = {
  minSlots: 20,
  minBuyable: 12,
  minPhotos: 6,
  gridSize: 9,
  huntSize: 6,
  minGain: 1,
  cooldownDays: 21,
};

/**
 * Does Kickio hold a shirt record for this slot at all?
 *
 * Deliberately an allowlist on status. `!== 'archived'` would have let
 * `pending` through, and twelve of the Grail List's slots are pending or
 * archived.
 */
export function isCatalogued(product: ProductRow | null): boolean {
  if (!product) return false;
  if (product.deleted_at !== null) return false;
  return product.status === "active";
}

/**
 * Can a reader open this slot and buy the shirt?
 *
 * A catalogue row is not a shelf. This is the question the post's call to
 * action depends on, so it is answered from `listings`, not from a status
 * column on `products`.
 */
export function isBuyable(product: ProductRow | null, activeListings: number): boolean {
  return isCatalogued(product) && activeListings > 0;
}

export interface SlotSummary {
  sort: number;
  label: string;
  product: { slug: string | null; name: string | null; season: string | null } | null;
  image: string | null;
}

export interface CollectionSummary {
  slug: string;
  name: string;
  description: string | null;
  /** Every slot on the list. */
  slots: number;
  /** Slots you could buy right now. The only number the headline may use. */
  buyable: number;
  /**
   * Slots whose shirt Kickio has a record of but nobody is currently selling.
   * Real, and not an invitation - reported so the 39/65 gap is visible to a
   * reviewer rather than quietly folded into the headline.
   */
  catalogued: number;
  /** Slots with no shirt matched at all. */
  missing: number;
  /** Slots pointing at a pending, archived or deleted shirt record. */
  unlisted: number;
  /** The buyable shirts, in the curator's order. */
  featured: SlotSummary[];
  /** Labels of unfilled slots, curator's order - the hunt list. */
  hunting: string[];
  photos: string[];
}

/**
 * Turn one set's slots into the numbers the card prints.
 *
 * Pure, and exported: every figure here ends up in a claim, so each should be
 * checkable without a database.
 */
export function summariseSet(
  set: SetRow,
  slots: SlotRow[],
  products: Map<string, ProductRow>,
  activeListings: Map<string, number>,
): CollectionSummary | null {
  if (!set.slug || !set.name) return null;

  const ordered = [...slots].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  const featured: SlotSummary[] = [];
  const hunting: string[] = [];
  const photos: string[] = [];
  const seen = new Set<string>();
  let catalogued = 0;
  let unlisted = 0;
  let missing = 0;

  for (const slot of ordered) {
    const label = (slot.label ?? "").trim();
    // `product_id` is on the slot row itself, so an unfilled slot is
    // distinguishable from one whose product the reader simply cannot see.
    if (slot.product_id === null) {
      missing++;
      if (label) hunting.push(label);
      continue;
    }

    const product = products.get(slot.product_id) ?? null;
    if (!isCatalogued(product)) {
      unlisted++;
      continue;
    }
    if (!isBuyable(product, activeListings.get(slot.product_id) ?? 0)) {
      catalogued++;
      continue;
    }

    featured.push({
      sort: slot.sort ?? 0,
      label: label || (product!.name ?? ""),
      product: { slug: product!.slug, name: product!.name, season: product!.season },
      image: imageUrls([product!.primary_image_url])[0] ?? null,
    });

    // A WebP-only shirt is still for sale; it just cannot go in the grid. The
    // photo filter must not reach back and change the count.
    const url = imageUrls([product!.primary_image_url])[0];
    if (url && !seen.has(url)) {
      seen.add(url);
      photos.push(url);
    }
  }

  return {
    slug: set.slug,
    name: set.name,
    description: set.description,
    slots: ordered.length,
    buyable: featured.length,
    catalogued,
    missing,
    unlisted,
    featured,
    hunting,
    photos,
  };
}

export interface CollectionVerdict {
  ok: boolean;
  reason?: string;
}

export function qualifies(
  summary: CollectionSummary,
  config: FeaturedCollectionConfig,
): CollectionVerdict {
  if (summary.slots < config.minSlots) {
    return { ok: false, reason: `${summary.slots} slots (need ${config.minSlots})` };
  }
  if (summary.buyable < config.minBuyable) {
    return {
      ok: false,
      reason:
        `only ${summary.buyable} of ${summary.slots} slots are buyable ` +
        `(need ${config.minBuyable})`,
    };
  }
  if (summary.photos.length < config.minPhotos) {
    return {
      ok: false,
      reason: `only ${summary.photos.length} renderable photos (need ${config.minPhotos})`,
    };
  }
  return { ok: true };
}

/**
 * The subject ref carries the two counts, so a list that has not moved dedupes
 * against its own last post and one that has does not.
 */
export function subjectRefFor(slug: string, buyable: number, slots: number): string {
  return `collection:${slug.trim().toLowerCase()}@${buyable}/${slots}`;
}

export interface PriorPost {
  buyable: number;
  slots: number;
  at: string;
  labels: string[];
}

export function parseSubjectRef(
  ref: string,
): { slug: string; buyable: number; slots: number } | null {
  const match = /^collection:(.+)@(\d+)\/(\d+)$/.exec(ref);
  if (!match) return null;
  return {
    slug: match[1],
    buyable: Number.parseInt(match[2], 10),
    slots: Number.parseInt(match[3], 10),
  };
}

export interface ProgressVerdict {
  ok: boolean;
  reason?: string;
  /** What moved, for the copy to lead on. Null on a first post. */
  change?: { buyable: number; slots: number } | null;
}

/**
 * The change rule.
 *
 * Only a gain posts. A drop - a grail sells, its slot stops being buyable - is
 * a real event but reads as the list going backwards, and "38 of 136" after
 * "39 of 136" is a worse post than none. The cooldown is a floor beneath the
 * rule, not an alternative to it: both have to pass.
 */
export function progressVerdict(
  summary: CollectionSummary,
  prior: PriorPost | null,
  config: FeaturedCollectionConfig,
  now: Date = new Date(),
): ProgressVerdict {
  if (!prior) return { ok: true, change: null };

  const sincePost = now.getTime() - new Date(prior.at).getTime();
  if (sincePost < config.cooldownDays * 86_400_000) {
    const days = Math.ceil((config.cooldownDays * 86_400_000 - sincePost) / 86_400_000);
    return {
      ok: false,
      reason: `posted ${prior.buyable}/${prior.slots} recently; ${days} days of cooldown left`,
    };
  }

  const buyableGain = summary.buyable - prior.buyable;
  const slotGain = summary.slots - prior.slots;
  if (buyableGain < config.minGain && slotGain < config.minGain) {
    return {
      ok: false,
      reason:
        `nothing new since ${prior.buyable} of ${prior.slots} on ` +
        `${prior.at.slice(0, 10)} (now ${summary.buyable} of ${summary.slots})`,
    };
  }

  return { ok: true, change: { buyable: buyableGain, slots: slotGain } };
}

/** Labels buyable now that were not buyable in the last post. */
export function newlyListed(summary: CollectionSummary, prior: PriorPost | null): string[] {
  if (!prior || prior.labels.length === 0) return [];
  const before = new Set(prior.labels);
  return summary.featured.map((f) => f.label).filter((l) => !before.has(l));
}

/**
 * The last post this recipe made about this set.
 *
 * Reads the engine's own drafts, never Kickio. Rejected drafts count: a post
 * the reviewer turned down still used up that particular number, and offering
 * it again unchanged would just be rejected again.
 */
export async function lastPostFor(slug: string): Promise<PriorPost | null> {
  const { data, error } = await engine()
    .from("post_drafts")
    .select("subject_ref,created_at,source_data")
    .eq("recipe_key", FEATURED_COLLECTION_KEY)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Cooldown lookup failed: ${error.message}`);

  for (const row of (data ?? []) as Array<{
    subject_ref: string;
    created_at: string;
    source_data: Record<string, unknown> | null;
  }>) {
    const parsed = parseSubjectRef(row.subject_ref);
    if (!parsed || parsed.slug !== slug.trim().toLowerCase()) continue;
    const labels = row.source_data?.buyable_labels;
    return {
      buyable: parsed.buyable,
      slots: parsed.slots,
      at: row.created_at,
      labels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === "string") : [],
    };
  }
  return null;
}

export async function runFeaturedCollection(
  config: FeaturedCollectionConfig = DEFAULT_FEATURED_COLLECTION_CONFIG,
): Promise<RecipeResult> {
  // Curated only. The `generated` sets are named "The Full Everton Collection"
  // and carry no slots - posting one would make exactly the completeness claim
  // every recipe here is written to avoid.
  const { data: setData, error: setError } = await kickio()
    .from("collection_sets")
    .select("id,slug,name,description,kind,visibility")
    .eq("kind", "curated")
    .eq("visibility", "public")
    .limit(50);

  if (setError) return { ok: false, reason: `Kickio query failed: ${setError.message}` };

  const sets = (setData ?? []) as unknown as SetRow[];
  if (sets.length === 0) {
    return {
      ok: false,
      reason: "No public curated collections on Kickio",
      diagnostics: { sets: 0 },
    };
  }

  // Paged. `.limit(1000)` sat exactly on PostgREST's cap, so it could never
  // return more and would never say it had stopped - and the slot count is the
  // denominator of every "N of M" this recipe prints. See lib/kickio/page.ts.
  const slots = await pageIn<SlotRow, string>(
    "Loading set slots",
    sets.map((s) => s.id),
    (batch, from, to) =>
      kickio()
        .from("collection_set_slots")
        .select("set_id,sort,label,product_id")
        .in("set_id", batch)
        .order("id", { ascending: true })
        .range(from, to),
  );

  const bySet = new Map<string, SlotRow[]>();
  for (const row of slots) {
    const list = bySet.get(row.set_id) ?? [];
    list.push(row);
    bySet.set(row.set_id, list);
  }

  // Fetched separately rather than as a PostgREST embed. The status filter
  // belongs in code, where an empty result stays distinguishable from a slot
  // that was never filled - those two are counted differently.
  const productIds = [...new Set(slots.map((s) => s.product_id).filter((id): id is string => !!id))];
  const products = new Map<string, ProductRow>();
  const activeListings = new Map<string, number>();

  if (productIds.length > 0) {
    const productData = await pageIn<ProductRow, string>(
      "Loading slot products",
      productIds,
      (batch, from, to) =>
        kickio()
          .from("products")
          .select("id,slug,name,team,season,status,deleted_at,primary_image_url")
          .in("id", batch)
          .order("id", { ascending: true })
          .range(from, to),
    );
    for (const row of productData) products.set(row.id, row);

    // The shelf, not the catalogue. Same filter Grail of the Day uses to decide
    // a listing is real: in stock, not withdrawn, and the stock checker has not
    // seen it vanish from its source.
    const listingData = await pageIn<{ product_id: string | null }, string>(
      "Loading listings",
      productIds,
      (batch, from, to) =>
        kickio()
          .from("listings")
          .select("product_id")
          .in("product_id", batch)
          .eq("status", "active")
          .is("deleted_at", null)
          .gt("stock_quantity", 0)
          .is("removed_at", null)
          .eq("consecutive_gone_count", 0)
          .order("id", { ascending: true })
          .range(from, to),
    );

    for (const row of listingData) {
      if (!row.product_id) continue;
      activeListings.set(row.product_id, (activeListings.get(row.product_id) ?? 0) + 1);
    }
  }

  const rejected: Array<{ key: string; reason: string }> = [];
  const eligible: CollectionSummary[] = [];

  for (const set of sets) {
    const summary = summariseSet(set, bySet.get(set.id) ?? [], products, activeListings);
    if (!summary) {
      rejected.push({ key: set.slug ?? set.id, reason: "set has no slug or name" });
      continue;
    }
    const verdict = qualifies(summary, config);
    if (verdict.ok) eligible.push(summary);
    else rejected.push({ key: summary.slug, reason: verdict.reason! });
  }

  if (eligible.length === 0) {
    return {
      ok: false,
      reason: "No curated collection on Kickio has enough buyable shirts to post",
      diagnostics: { sets: sets.length, rejected },
    };
  }

  // Most buyable first. The change rule does the rotating, so this does not.
  const winner = eligible.sort((a, b) => b.buyable - a.buyable)[0];

  const prior = await lastPostFor(winner.slug);
  const progress = progressVerdict(winner, prior, config);
  if (!progress.ok) {
    return {
      ok: false,
      reason: `${winner.name}: ${progress.reason}`,
      diagnostics: {
        set: winner.slug,
        buyable: winner.buyable,
        slots: winner.slots,
        catalogued: winner.catalogued,
        missing: winner.missing,
        unlisted: winner.unlisted,
        prior: prior ? { buyable: prior.buyable, slots: prior.slots, at: prior.at } : null,
      },
    };
  }

  const added = newlyListed(winner, prior);
  const hunting = winner.hunting.slice(0, config.huntSize);

  const claims: Claim[] = [
    {
      statement:
        `${winner.buyable} of the ${winner.slots} shirts on ${winner.name} ` +
        "can be bought on Kickio right now",
      value: winner.buyable,
      source: "collection_set_slots -> products (active) -> listings (active, in stock, not removed)",
      basis:
        "Counted from LISTINGS, not from a status column on products. " +
        `${winner.catalogued} further slots have a shirt record on Kickio that nobody is ` +
        `currently selling, and ${winner.unlisted} point at a pending or archived record. ` +
        "Neither is buyable, and neither is counted here.",
    },
    {
      statement: `${winner.missing} slots have no shirt matched yet`,
      value: winner.missing,
      source: "collection_set_slots where product_id is null",
      basis: "Slots Kickio's curators have named but not yet filled",
    },
    {
      statement: `${winner.catalogued} more are on Kickio's catalogue but not for sale`,
      value: winner.catalogued,
      source: "products active, with no active listing",
      basis: "A shirt page exists; there is nothing to buy on it",
    },
  ];

  if (progress.change && progress.change.buyable > 0 && prior) {
    claims.push({
      statement: `Up from ${prior.buyable} when this was last posted on ${prior.at.slice(0, 10)}`,
      value: progress.change.buyable,
      source: "post_drafts.subject_ref of the previous Featured Collection draft",
      basis: "The engine's own record of the last number it published",
    });
  }
  if (progress.change && progress.change.slots > 0 && prior) {
    claims.push({
      statement: `${progress.change.slots} slots added to the list since ${prior.at.slice(0, 10)}`,
      value: progress.change.slots,
      source: "collection_set_slots row count, against the previous draft's",
    });
  }

  return {
    ok: true,
    candidate: {
      subjectRef: subjectRefFor(winner.slug, winner.buyable, winner.slots),
      headline: `${winner.buyable} of ${winner.slots} buyable on ${winner.name}`,
      sourceData: {
        subject: winner.name,
        collection: winner.name,
        collection_slug: winner.slug,
        collection_description: winner.description,
        slots: winner.slots,
        buyable: winner.buyable,
        catalogued_not_for_sale: winner.catalogued,
        missing: winner.missing,
        record_not_active: winner.unlisted,
        featured: winner.featured.slice(0, config.gridSize).map((f) => ({
          label: f.label,
          name: f.product?.name ?? null,
          season: f.product?.season ?? null,
        })),
        hunting,
        newly_listed: added,
        previous: prior ? { buyable: prior.buyable, slots: prior.slots, at: prior.at } : null,
        // Carried so the next run can name what arrived since.
        buyable_labels: winner.featured.map((f) => f.label),
        scope_note:
          "The list is Kickio's own curation, shared by everyone - not one collector's " +
          "progress. `buyable` counts active listings; most of the list cannot be bought.",
      },
      claims,
      images: winner.photos.slice(0, config.gridSize),
    },
  };
}

export const FEATURED_COLLECTION_BRIEF = `**Featured Collection** - a curated Kickio list, and how much of it is actually on the shelf.

The hook is the gap. A list of named shirts where most slots are still empty is
an invitation: the collector reading it knows exactly which one they own. Lead
with the count, then name two or three specific shirts from the facts - the ones
you can buy, and the ones still being hunted. Ask for the missing ones.

If \`newly_listed\` is non-empty, that is the news: say which shirt just landed and
lead with it.

\`hunting\` is the best thing on this card. Those are shirts Kickio's curators
named and nobody has produced - so a collector who owns one knows something the
account does not. Name two or three and ask, once, whether anyone has them.

Four hard rules:
- \`buyable\` is how many you can BUY ON KICKIO RIGHT NOW. It is not the size of
  the list, and it is not how many shirts Kickio has a page for. Never write or
  imply that all \`slots\` shirts are available - most are not. "x of y" framing,
  every time.
- \`catalogued_not_for_sale\` shirts have a page and nothing to buy. You may
  mention them as "on the list but nobody's selling one", never as available.
- The list is KICKIO'S OWN CURATION, shared by everyone. It is not one
  collector's progress, and it is not a ranking - never call it the definitive,
  official or greatest anything.
- Do not invent shirts. Every shirt you name must appear in \`featured\` or
  \`hunting\`.`;
