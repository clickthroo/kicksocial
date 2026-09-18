/**
 * Featured Collection - "The Kickio Grail List: 65 of 136, and here's what's
 * still missing."
 *
 * Kickio curates `collection_sets`: a named list of shirts with one numbered
 * slot each, filled in by hand as a matching product appears. The Grail List
 * has 136 slots. That structure is unusually good social material, because the
 * EMPTY slots are as interesting as the full ones - a collector who owns the
 * 1986 Argentina home has a reason to reply.
 *
 * TWO COUNTS THAT LOOK THE SAME AND ARE NOT
 *
 * 77 slots point at a product. Only 65 of those products are active and
 * listed: the other 12 are `pending` or `archived`. Kickio's own RLS makes
 * this easy to get wrong - the `products_read` policy returns any row that is
 * not soft-deleted, whatever its status, so a naive join hands back all 77 and
 * the post claims twelve shirts are buyable when they are not. Every one of
 * those is a link a reader would follow to nothing. `listed` is therefore
 * counted from active, non-deleted, photographed rows only, and a slot that
 * points at a pending product is reported as `stale`, never as listed.
 *
 * WHY IT ONLY POSTS WHEN THE NUMBER MOVES
 *
 * "65 of 136" is the same post every week until someone fills a slot. Rather
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
  minListed: number;
  /** Fewest renderable photos for the grid. */
  minPhotos: number;
  /** How many photos the card shows. */
  gridSize: number;
  /** How many missing slots to name in the copy. */
  huntSize: number;
  /** Smallest move in listed-or-total that counts as news. */
  minGain: number;
  /** A floor under the change rule: never twice inside this many days. */
  cooldownDays: number;
}

export const DEFAULT_FEATURED_COLLECTION_CONFIG: FeaturedCollectionConfig = {
  minSlots: 20,
  minListed: 12,
  minPhotos: 6,
  gridSize: 9,
  huntSize: 6,
  minGain: 1,
  cooldownDays: 21,
};

/**
 * Is this slot's shirt something a reader can actually open and buy?
 *
 * Deliberately an allowlist on status. `!== 'archived'` would have let
 * `pending` through, which is the twelve-shirt overcount this recipe exists to
 * avoid.
 */
export function isListed(product: ProductRow | null): boolean {
  if (!product) return false;
  if (product.deleted_at !== null) return false;
  if (product.status !== "active") return false;
  return imageUrls([product.primary_image_url]).length > 0;
}

export interface SlotSummary {
  sort: number;
  label: string;
  /** The shirt, when the slot has one that is live on Kickio. */
  product: { slug: string | null; name: string | null; season: string | null } | null;
  image: string | null;
}

export interface CollectionSummary {
  slug: string;
  name: string;
  description: string | null;
  /** Every slot on the list. */
  slots: number;
  /** Slots whose shirt is active, undeleted and photographed. */
  listed: number;
  /** Slots with no shirt matched at all. */
  missing: number;
  /**
   * Slots matched to a shirt that is not live - pending, archived, or with no
   * usable photo. Reported so the gap between 77 and 65 is visible to a
   * reviewer rather than quietly absorbed.
   */
  stale: number;
  /** The listed shirts, in the curator's order. */
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
): CollectionSummary | null {
  if (!set.slug || !set.name) return null;

  const ordered = [...slots].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  const featured: SlotSummary[] = [];
  const hunting: string[] = [];
  const photos: string[] = [];
  const seen = new Set<string>();
  let stale = 0;

  for (const slot of ordered) {
    const label = (slot.label ?? "").trim();
    // `product_id` is on the slot row itself, so an unfilled slot is
    // distinguishable from one whose product the reader simply cannot see.
    if (slot.product_id === null) {
      if (label) hunting.push(label);
      continue;
    }

    const product = products.get(slot.product_id) ?? null;
    if (!isListed(product)) {
      stale++;
      continue;
    }

    const url = imageUrls([product!.primary_image_url])[0];
    featured.push({
      sort: slot.sort ?? 0,
      label: label || (product!.name ?? ""),
      product: { slug: product!.slug, name: product!.name, season: product!.season },
      image: url,
    });
    if (!seen.has(url)) {
      seen.add(url);
      photos.push(url);
    }
  }

  return {
    slug: set.slug,
    name: set.name,
    description: set.description,
    slots: ordered.length,
    listed: featured.length,
    missing: ordered.filter((s) => s.product_id === null).length,
    stale,
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
  if (summary.listed < config.minListed) {
    return {
      ok: false,
      reason: `only ${summary.listed} of ${summary.slots} slots are listed (need ${config.minListed})`,
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
export function subjectRefFor(slug: string, listed: number, slots: number): string {
  return `collection:${slug.trim().toLowerCase()}@${listed}/${slots}`;
}

export interface PriorPost {
  listed: number;
  slots: number;
  at: string;
  labels: string[];
}

export function parseSubjectRef(ref: string): { slug: string; listed: number; slots: number } | null {
  const match = /^collection:(.+)@(\d+)\/(\d+)$/.exec(ref);
  if (!match) return null;
  return {
    slug: match[1],
    listed: Number.parseInt(match[2], 10),
    slots: Number.parseInt(match[3], 10),
  };
}

export interface ProgressVerdict {
  ok: boolean;
  reason?: string;
  /** What moved, for the copy to lead on. Null on a first post. */
  change?: { listed: number; slots: number } | null;
}

/**
 * The change rule.
 *
 * Only a gain posts. A drop - a grail sells, the slot goes back to unlisted -
 * is a real event but reads as the list going backwards, and "64 of 136" after
 * "65 of 136" is a worse post than none. The cooldown is a floor beneath the
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
    return { ok: false, reason: `posted ${prior.listed}/${prior.slots} recently; ${days} days of cooldown left` };
  }

  const listedGain = summary.listed - prior.listed;
  const slotGain = summary.slots - prior.slots;
  if (listedGain < config.minGain && slotGain < config.minGain) {
    return {
      ok: false,
      reason:
        `nothing new since ${prior.listed} of ${prior.slots} on ` +
        `${prior.at.slice(0, 10)} (now ${summary.listed} of ${summary.slots})`,
    };
  }

  return { ok: true, change: { listed: listedGain, slots: slotGain } };
}

/** Labels listed now that were not listed in the last post. */
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
    const labels = row.source_data?.listed_labels;
    return {
      listed: parsed.listed,
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
    return { ok: false, reason: "No public curated collections on Kickio", diagnostics: { sets: 0 } };
  }

  const { data: slotData, error: slotError } = await kickio()
    .from("collection_set_slots")
    .select("set_id,sort,label,product_id")
    .in(
      "set_id",
      sets.map((s) => s.id),
    )
    .limit(1000);

  if (slotError) return { ok: false, reason: `Kickio query failed: ${slotError.message}` };

  const slots = (slotData ?? []) as unknown as SlotRow[];
  const bySet = new Map<string, SlotRow[]>();
  for (const row of slots) {
    const list = bySet.get(row.set_id) ?? [];
    list.push(row);
    bySet.set(row.set_id, list);
  }

  // Fetched separately rather than as a PostgREST embed. The shirts are
  // status-filtered here, in code, because the filter is the whole point -
  // pushing it into the query would make an empty result indistinguishable
  // from a slot that was never filled, and those two are counted differently.
  const productIds = [...new Set(slots.map((s) => s.product_id).filter((id): id is string => !!id))];
  const products = new Map<string, ProductRow>();
  if (productIds.length > 0) {
    const { data: productData, error: productError } = await kickio()
      .from("products")
      .select("id,slug,name,team,season,status,deleted_at,primary_image_url")
      .in("id", productIds)
      .limit(productIds.length);

    if (productError) return { ok: false, reason: `Kickio query failed: ${productError.message}` };
    for (const row of (productData ?? []) as unknown as ProductRow[]) products.set(row.id, row);
  }

  const rejected: Array<{ key: string; reason: string }> = [];
  const eligible: CollectionSummary[] = [];

  for (const set of sets) {
    const summary = summariseSet(set, bySet.get(set.id) ?? [], products);
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
      reason: "No curated collection on Kickio has enough listed shirts to post",
      diagnostics: { sets: sets.length, rejected },
    };
  }

  // Most listed first. The change rule does the rotating, so this does not.
  const winner = eligible.sort((a, b) => b.listed - a.listed)[0];

  const prior = await lastPostFor(winner.slug);
  const progress = progressVerdict(winner, prior, config);
  if (!progress.ok) {
    return {
      ok: false,
      reason: `${winner.name}: ${progress.reason}`,
      diagnostics: {
        set: winner.slug,
        listed: winner.listed,
        slots: winner.slots,
        missing: winner.missing,
        stale: winner.stale,
        prior: prior ? { listed: prior.listed, slots: prior.slots, at: prior.at } : null,
      },
    };
  }

  const added = newlyListed(winner, prior);
  const hunting = winner.hunting.slice(0, config.huntSize);

  const claims: Claim[] = [
    {
      statement: `${winner.listed} of the ${winner.slots} shirts on ${winner.name} are listed on Kickio`,
      value: winner.listed,
      source: "collection_set_slots joined to products (active, not deleted, with a photo)",
      basis:
        `Counted here, not read from a stored total. ${winner.stale} further slots point at a ` +
        "shirt that is pending, archived or unphotographed; those are not counted as listed.",
    },
    {
      statement: `${winner.missing} slots have no shirt matched yet`,
      value: winner.missing,
      source: "collection_set_slots where product_id is null",
      basis: "Slots Kickio's curators have named but not yet filled",
    },
  ];

  if (progress.change && progress.change.listed > 0 && prior) {
    claims.push({
      statement: `Up from ${prior.listed} when this was last posted on ${prior.at.slice(0, 10)}`,
      value: progress.change.listed,
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
      subjectRef: subjectRefFor(winner.slug, winner.listed, winner.slots),
      headline: `${winner.listed} of ${winner.slots} on ${winner.name}`,
      sourceData: {
        subject: winner.name,
        collection: winner.name,
        collection_slug: winner.slug,
        collection_description: winner.description,
        slots: winner.slots,
        listed: winner.listed,
        missing: winner.missing,
        not_listed: winner.stale,
        featured: winner.featured.slice(0, config.gridSize).map((f) => ({
          label: f.label,
          name: f.product?.name ?? null,
          season: f.product?.season ?? null,
        })),
        hunting,
        newly_listed: added,
        previous: prior ? { listed: prior.listed, slots: prior.slots, at: prior.at } : null,
        // Carried so the next run can name what arrived since.
        listed_labels: winner.featured.map((f) => f.label),
        scope_note:
          "The list is Kickio's own curation. Counts describe what Kickio has listed, " +
          "not what exists, and most of the list is not currently buyable.",
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
that are listed, and the ones still being hunted. Ask for the missing ones.

If \`newly_listed\` is non-empty, that is the news: say which shirt just landed and
lead with it.

Three hard rules:
- \`listed\` is how many are BUYABLE ON KICKIO RIGHT NOW. It is not the size of
  the list. Never write or imply that all \`slots\` shirts are available - most
  are not. "x of y" framing, every time.
- The list is KICKIO'S OWN CURATION, an editorial pick. Never call it the
  definitive, official or greatest anything, and never rank the shirts against
  each other. You have a curator's order, not a scoring.
- Do not invent shirts. Every shirt you name must appear in \`featured\` or
  \`hunting\`.`;
