/**
 * Featured Set - "The Full Manchester United Collection: 154 on Kickio, 99 to
 * buy today."
 *
 * The sibling of Featured Collection, for the other kind of set Kickio has.
 *
 * TWO KINDS OF SET, BUILT DIFFERENTLY
 *
 * Only `kickio-grail-list` has slots. The other 24 public sets carry no slots
 * at all - they are a `rule` and their contents are computed:
 *
 *   {"teams":["Juventus"],"season_from":1980,
 *    "shirt_types":["Home","Away","Third"],"type_season_from":{"third":2000}}
 *
 * The set's size is seasons x shirt types, and expanding that rule reproduces
 * Kickio's own totals exactly: Juventus Home 47, Home & Away 94, Full
 * Collection 121 (47 + 47 + 27, Third counted only from 2000). That agreement
 * is the reason this recipe can quote a denominator at all - it is Kickio's
 * number, not one this engine invented.
 *
 * WHAT COUNTS AS FILLED
 *
 * A slot is covered when Kickio holds a shirt for that team, type and season,
 * and buyable when one of those has a live listing. Same distinction Featured
 * Collection had to be corrected for: `products` is the catalogue, `listings`
 * is the shelf, and only the second is something a reader can act on.
 *
 * No personal data. This recipe is about Kickio's shelf, which is why it runs
 * today while the two Collector Spotlight recipes wait for a grant.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeResult } from "../engine/types.ts";
import { recentlyFeatured } from "./cooldown.ts";
import { imageUrls } from "./grail-of-the-day.ts";
import { seasonYear } from "./club-archive.ts";

export const FEATURED_SET_KEY = "featured_set";

export interface SetRule {
  teams: string[];
  seasonFrom: number;
  shirtTypes: string[];
  /** Per-type overrides, e.g. Third shirts only counted from 2000. */
  typeSeasonFrom: Record<string, number>;
}

interface SetRow {
  id: string;
  slug: string | null;
  name: string | null;
  kind: string | null;
  visibility: string | null;
  rule: Record<string, unknown> | null;
}

interface ProductRow {
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  name: string | null;
  slug: string | null;
  primary_image_url: string | null;
  id: string;
}

export interface FeaturedSetConfig {
  minSlots: number;
  minBuyable: number;
  minPhotos: number;
  gridSize: number;
  /** The last season a set can reach. Seasons beyond this are not yet played. */
  seasonTo: number;
  cooldownDays: number;
  /** Sets queued by an admin, in order. The head is used and then removed. */
  upNext?: string[];
}

export const DEFAULT_FEATURED_SET_CONFIG: FeaturedSetConfig = {
  minSlots: 12,
  minBuyable: 8,
  minPhotos: 6,
  gridSize: 9,
  seasonTo: new Date().getUTCFullYear(),
  // Six months, matching Club Archive: a set should not come round twice in a
  // season, and an admin picking one should not have to remember when it ran.
  cooldownDays: 180,
  upNext: [],
};

/**
 * Read a set's rule into something countable.
 *
 * Tolerant by design: Kickio writes `team` on some rows and `teams` on others,
 * `shirt_type` on some and `shirt_types` on others. Returns null rather than
 * guessing when neither form is present, so a malformed rule refuses instead of
 * silently counting nothing.
 */
export function parseRule(rule: Record<string, unknown> | null): SetRule | null {
  if (!rule) return null;

  const teams = Array.isArray(rule.teams)
    ? (rule.teams as unknown[]).filter((t): t is string => typeof t === "string")
    : typeof rule.team === "string"
      ? [rule.team]
      : [];

  const shirtTypes = Array.isArray(rule.shirt_types)
    ? (rule.shirt_types as unknown[]).filter((t): t is string => typeof t === "string")
    : typeof rule.shirt_type === "string"
      ? [rule.shirt_type]
      : [];

  if (teams.length === 0 || shirtTypes.length === 0) return null;

  const seasonFrom = Number.isFinite(Number(rule.season_from)) ? Number(rule.season_from) : 1980;

  const typeSeasonFrom: Record<string, number> = {};
  const overrides = rule.type_season_from;
  if (overrides && typeof overrides === "object") {
    for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
      if (Number.isFinite(Number(value))) typeSeasonFrom[key.toLowerCase()] = Number(value);
    }
  }

  return { teams, seasonFrom, shirtTypes, typeSeasonFrom };
}

export interface SetSlot {
  team: string;
  shirtType: string;
  year: number;
}

/** Every (team, type, season) the rule asks for. This is the denominator. */
export function expandRule(rule: SetRule, seasonTo: number): SetSlot[] {
  const slots: SetSlot[] = [];
  for (const team of rule.teams) {
    for (const shirtType of rule.shirtTypes) {
      const from = rule.typeSeasonFrom[shirtType.toLowerCase()] ?? rule.seasonFrom;
      for (let year = from; year <= seasonTo; year++) {
        slots.push({ team, shirtType, year });
      }
    }
  }
  return slots;
}

export function slotKey(team: string, shirtType: string, year: number): string {
  return `${team.trim().toLowerCase()}|${shirtType.trim().toLowerCase()}|${year}`;
}

export interface SetSummary {
  slug: string;
  name: string;
  rule: SetRule;
  slots: number;
  covered: number;
  buyable: number;
  photos: string[];
  featured: Array<{ name: string | null; season: string | null; shirt_type: string | null }>;
  /** Seasons the rule asks for that Kickio holds nothing at all for. */
  gaps: string[];
}

export function summariseSet(
  set: SetRow,
  rule: SetRule,
  products: ProductRow[],
  buyableIds: Set<string>,
  config: FeaturedSetConfig,
): SetSummary | null {
  if (!set.slug || !set.name) return null;

  const slots = expandRule(rule, config.seasonTo);
  const covered = new Set<string>();
  const buyable = new Set<string>();
  const bySlot = new Map<string, ProductRow[]>();

  for (const product of products) {
    // `season_end_year` is null on every row and some `season` values do not
    // start with a four-digit year, so this parses rather than casts.
    const year = seasonYear(product.season);
    if (year === null || !product.team || !product.shirt_type) continue;
    const key = slotKey(product.team, product.shirt_type, year);
    const list = bySlot.get(key) ?? [];
    list.push(product);
    bySlot.set(key, list);
  }

  const wanted = new Set(slots.map((s) => slotKey(s.team, s.shirtType, s.year)));
  for (const key of wanted) {
    const matches = bySlot.get(key) ?? [];
    if (matches.length === 0) continue;
    covered.add(key);
    if (matches.some((p) => buyableIds.has(p.id))) buyable.add(key);
  }

  // Oldest first, so the grid reads as a timeline. Only buyable shirts - the
  // card sends people shopping.
  const shown = slots
    .filter((s) => buyable.has(slotKey(s.team, s.shirtType, s.year)))
    .sort((a, b) => a.year - b.year)
    .map((s) => (bySlot.get(slotKey(s.team, s.shirtType, s.year)) ?? [])[0])
    .filter((p): p is ProductRow => !!p);

  const seen = new Set<string>();
  const photos: string[] = [];
  const featured: SetSummary["featured"] = [];
  for (const product of shown) {
    const url = imageUrls([product.primary_image_url])[0];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    photos.push(url);
    featured.push({ name: product.name, season: product.season, shirt_type: product.shirt_type });
    if (photos.length >= config.gridSize) break;
  }

  const gaps = slots
    .filter((s) => !covered.has(slotKey(s.team, s.shirtType, s.year)))
    .map((s) => `${s.year} ${s.shirtType}`);

  return {
    slug: set.slug,
    name: set.name,
    rule,
    slots: slots.length,
    covered: covered.size,
    buyable: buyable.size,
    photos,
    featured,
    gaps,
  };
}

export interface SetVerdict {
  ok: boolean;
  reason?: string;
}

export function qualifies(summary: SetSummary, config: FeaturedSetConfig): SetVerdict {
  if (summary.slots < config.minSlots) {
    return { ok: false, reason: `${summary.slots} slots (need ${config.minSlots})` };
  }
  if (summary.buyable < config.minBuyable) {
    return {
      ok: false,
      reason: `only ${summary.buyable} of ${summary.slots} seasons are buyable (need ${config.minBuyable})`,
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

export function subjectRefFor(slug: string): string {
  return `set:${slug.trim().toLowerCase()}`;
}

/** "since 1980 · Home, Away, Third" - the rule's scope, said on the card. */
export function scopeLine(rule: SetRule, seasonTo: number): string {
  const from = Math.min(rule.seasonFrom, ...Object.values(rule.typeSeasonFrom), seasonTo);
  return `${from}–${seasonTo} · ${rule.shirtTypes.join(", ")}`;
}

export async function runFeaturedSet(
  config: FeaturedSetConfig = DEFAULT_FEATURED_SET_CONFIG,
): Promise<RecipeResult> {
  const queue = (config.upNext ?? []).map((s) => s.trim()).filter(Boolean);
  const queued = queue[0] ?? null;

  let query = kickio()
    .from("collection_sets")
    .select("id,slug,name,kind,visibility,rule")
    .eq("visibility", "public")
    .in("kind", ["generated", "curated"])
    .not("rule", "is", null);
  if (queued) query = query.eq("slug", queued);

  const { data: setData, error: setError } = await query.limit(100);
  if (setError) return { ok: false, reason: `Kickio query failed: ${setError.message}` };

  const sets = (setData ?? []) as unknown as SetRow[];
  if (sets.length === 0) {
    return {
      ok: false,
      reason: queued
        ? `No public rule-based set on Kickio with the slug "${queued}"`
        : "No public rule-based collection sets on Kickio",
      diagnostics: { queued, queue },
    };
  }

  const parsed = sets
    .map((set) => ({ set, rule: parseRule(set.rule) }))
    .filter((entry): entry is { set: SetRow; rule: SetRule } => entry.rule !== null);

  if (parsed.length === 0) {
    return {
      ok: false,
      reason: "No set has a rule this engine can read",
      diagnostics: { sets: sets.length },
    };
  }

  const teams = [...new Set(parsed.flatMap((p) => p.rule.teams))];
  const { data: productData, error: productError } = await kickio()
    .from("products")
    .select("id,team,season,shirt_type,name,slug,primary_image_url")
    .is("deleted_at", null)
    .eq("status", "active")
    .in("team", teams)
    .limit(5000);

  if (productError) return { ok: false, reason: `Kickio query failed: ${productError.message}` };
  const products = (productData ?? []) as unknown as ProductRow[];

  // The shelf, not the catalogue.
  const buyableIds = new Set<string>();
  if (products.length > 0) {
    const { data: listingData, error: listingError } = await kickio()
      .from("listings")
      .select("product_id")
      .in(
        "product_id",
        products.map((p) => p.id),
      )
      .eq("status", "active")
      .is("deleted_at", null)
      .gt("stock_quantity", 0)
      .is("removed_at", null)
      .eq("consecutive_gone_count", 0)
      .limit(20_000);

    if (listingError) return { ok: false, reason: `Kickio query failed: ${listingError.message}` };
    for (const row of (listingData ?? []) as Array<{ product_id: string | null }>) {
      if (row.product_id) buyableIds.add(row.product_id);
    }
  }

  const seen = await recentlyFeatured(FEATURED_SET_KEY, config.cooldownDays);
  const rejected: Array<{ key: string; reason: string }> = [];
  const eligible: SetSummary[] = [];

  for (const { set, rule } of parsed) {
    const byTeam = products.filter((p) => p.team && rule.teams.includes(p.team));
    const summary = summariseSet(set, rule, byTeam, buyableIds, config);
    if (!summary) {
      rejected.push({ key: set.slug ?? set.id, reason: "set has no slug or name" });
      continue;
    }
    // Applies to a queued set too: repeating a subject is what the cooldown is
    // for, and Settings only offers sets that are off it.
    if (seen.has(subjectRefFor(summary.slug))) {
      rejected.push({
        key: summary.slug,
        reason: `covered within the last ${config.cooldownDays} days`,
      });
      continue;
    }
    const verdict = qualifies(summary, config);
    if (verdict.ok) eligible.push(summary);
    else rejected.push({ key: summary.slug, reason: verdict.reason! });
  }

  if (eligible.length === 0) {
    return {
      ok: false,
      reason: queued
        ? `${queued} is queued but cannot run: ${rejected[0]?.reason ?? "no qualifying seasons"}`
        : "No collection set on Kickio has enough buyable seasons right now",
      diagnostics: { queued, queue, considered: parsed.length, rejected },
    };
  }

  const winner = eligible.sort((a, b) => b.buyable - a.buyable)[0];
  const scope = scopeLine(winner.rule, config.seasonTo);

  const claims: Claim[] = [
    {
      statement: `${winner.buyable} of the ${winner.slots} shirts in ${winner.name} can be bought on Kickio right now`,
      value: winner.buyable,
      source: "collection_sets.rule expanded to seasons, matched to products with an active listing",
      basis:
        `The set is defined by a rule (${scope}), not a fixed list. The denominator is ` +
        "the seasons the rule asks for; the numerator counts only seasons with a live listing.",
    },
    {
      statement: `Kickio has a shirt for ${winner.covered} of the ${winner.slots}`,
      value: winner.covered,
      source: "products (active, not deleted) matched by team, shirt type and season",
      basis: `${winner.covered - winner.buyable} of those have no one selling one right now`,
    },
  ];

  return {
    ok: true,
    candidate: {
      subjectRef: subjectRefFor(winner.slug),
      headline: `${winner.buyable} of ${winner.slots} buyable in ${winner.name}`,
      sourceData: {
        subject: winner.name,
        collection: winner.name,
        collection_slug: winner.slug,
        scope,
        slots: winner.slots,
        buyable: winner.buyable,
        covered: winner.covered,
        catalogued_not_for_sale: winner.covered - winner.buyable,
        missing: winner.slots - winner.covered,
        featured: winner.featured,
        hunting: winner.gaps.slice(0, 6),
        scope_note:
          "The set is one of Kickio's own lists, defined by a rule. Counts describe what " +
          "Kickio has listed, not what exists, and most of the set is not currently buyable.",
      },
      claims,
      images: winner.photos.slice(0, config.gridSize),
      ...(queued ? { consumeFromQueue: queued } : {}),
    },
  };
}

export const FEATURED_SET_BRIEF = `**Featured Set** - one of Kickio's own collection lists, and how much of it is on the shelf.

The hook is the sweep and the gap together: a named run of shirts across the
decades, and how much of it you could actually own today. Lead with the count,
name two or three specific shirts from the facts, and mention a season or two
from \`hunting\` that Kickio has nothing for.

Three hard rules:
- \`buyable\` is how many seasons you can BUY RIGHT NOW. \`covered\` is how many
  Kickio has a shirt page for. Never use the set's size as if it were either.
  "x of y" framing, every time.
- \`scope\` says what the set actually covers (the years and kit types). If you
  describe the set, describe it that way - do not imply it covers a club's
  whole history.
- Do not invent shirts or seasons. Everything you name must be in \`featured\`
  or \`hunting\`.`;
