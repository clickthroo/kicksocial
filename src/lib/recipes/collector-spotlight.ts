/**
 * Collector Spotlight - "@dave's collection: 214 shirts, 1983-2024, 31 clubs."
 *
 * The whole collection, not a checklist. It needs nobody to have finished
 * anything, so it works from the first week a collector adds shirts - which is
 * why it is the more useful of the two collector recipes at launch.
 *
 * WHAT IT PUBLISHES, AND WHAT IT WILL NOT
 *
 * Counts, eras, clubs, and the shirts themselves. Never what any of it cost:
 * `paid_cents` is not selected here, and the scoped role is not granted the
 * column, so the promise holds below the application too. A named collector
 * beside a valuation is a shopping list for a burglar, and no privacy setting
 * makes that safe.
 *
 * Never a real name and never a location. `profiles` carries `full_name`,
 * `city`, `signup_city` and `last_login_city`; the card uses the handle or the
 * display name the collector chose, via publicName().
 *
 * BOTH OPT-OUTS, READ EVERY RUN
 *
 * Kickio is opt-out and both switches default to true, so most collectors are
 * eligible from signup. mayFeature() still checks both on every run, and the
 * role's policies check them again in the database. See collector-access.ts.
 *
 * A HUMAN SEES IT FIRST
 *
 * Under an opt-out model the collector may not know this is coming, so the
 * draft carries `collector_handle` and `collector_flags` into the approval
 * queue. The reviewer can say hello before publishing. That is the difference
 * between opt-out plus a person and opt-out plus a cron job.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeResult } from "../engine/types.ts";
import { imageUrls } from "./grail-of-the-day.ts";
import { seasonYear } from "./club-archive.ts";
import {
  DEFAULT_COLLECTOR_COOLDOWN_DAYS,
  loadCollectors,
  postable,
  subjectRefFor,
  type CollectorOption,
} from "./collector-access.ts";

export const COLLECTOR_SPOTLIGHT_KEY = "collector_spotlight";

interface ProductRow {
  id: string;
  name: string | null;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  primary_image_url: string | null;
}

export interface CollectorSpotlightConfig {
  /** A collection worth a post has to be a collection, not three shirts. */
  minShirts: number;
  /** Three shirts from two seasons is a shelf, not a span. */
  minSpanYears: number;
  minClubs: number;
  minPhotos: number;
  gridSize: number;
  cooldownDays: number;
  /** Collectors queued by an admin, by user id. The head is consumed on publish. */
  upNext?: string[];
  /** Extra accounts an admin never wants featured. House accounts are excluded
   *  regardless - see HOUSE_ACCOUNTS in collector-access.ts. */
  excludeUserIds?: string[];
}

export const DEFAULT_COLLECTOR_SPOTLIGHT_CONFIG: CollectorSpotlightConfig = {
  minShirts: 12,
  minSpanYears: 8,
  minClubs: 3,
  minPhotos: 6,
  gridSize: 9,
  cooldownDays: DEFAULT_COLLECTOR_COOLDOWN_DAYS,
  upNext: [],
  excludeUserIds: [],
};

export interface CollectionShape {
  shirts: number;
  earliest: number;
  latest: number;
  spanYears: number;
  clubs: number;
  /** The club they own most of, and how many. */
  topClub: { team: string; shirts: number } | null;
  photos: string[];
  featured: Array<{ name: string | null; season: string | null; team: string | null }>;
}

/**
 * Turn one collector's shirts into the numbers the card prints.
 *
 * Pure and exported: every figure ends up in a claim, so each should be
 * checkable without a database.
 */
export function shapeOf(
  products: ProductRow[],
  config: CollectorSpotlightConfig,
): CollectionShape | null {
  const years = products
    .map((p) => seasonYear(p.season))
    .filter((y): y is number => y !== null);
  if (years.length === 0) return null;

  const byTeam = new Map<string, number>();
  for (const product of products) {
    const team = product.team?.trim();
    if (!team) continue;
    byTeam.set(team, (byTeam.get(team) ?? 0) + 1);
  }
  const top = [...byTeam.entries()].sort((a, b) => b[1] - a[1])[0];

  const withPhotos = products
    .filter((p) => imageUrls([p.primary_image_url]).length > 0)
    .sort((a, b) => (seasonYear(a.season) ?? 9999) - (seasonYear(b.season) ?? 9999));

  const seen = new Set<string>();
  const photos: string[] = [];
  const featured: CollectionShape["featured"] = [];
  for (const product of withPhotos) {
    const url = imageUrls([product.primary_image_url])[0];
    if (seen.has(url)) continue;
    seen.add(url);
    photos.push(url);
    featured.push({ name: product.name, season: product.season, team: product.team });
    if (photos.length >= config.gridSize) break;
  }

  const earliest = Math.min(...years);
  const latest = Math.max(...years);

  return {
    shirts: products.length,
    earliest,
    latest,
    spanYears: latest - earliest,
    clubs: byTeam.size,
    topClub: top ? { team: top[0], shirts: top[1] } : null,
    photos,
    featured,
  };
}

export interface ShapeVerdict {
  ok: boolean;
  reason?: string;
}

export function qualifies(
  shape: CollectionShape,
  config: CollectorSpotlightConfig,
): ShapeVerdict {
  if (shape.shirts < config.minShirts) {
    return { ok: false, reason: `${shape.shirts} shirts (need ${config.minShirts})` };
  }
  if (shape.spanYears < config.minSpanYears) {
    return {
      ok: false,
      reason:
        `only spans ${shape.spanYears} years, ${shape.earliest}-${shape.latest} ` +
        `(need ${config.minSpanYears})`,
    };
  }
  if (shape.clubs < config.minClubs) {
    return { ok: false, reason: `only ${shape.clubs} clubs (need ${config.minClubs})` };
  }
  if (shape.photos.length < config.minPhotos) {
    return {
      ok: false,
      reason: `only ${shape.photos.length} renderable photos (need ${config.minPhotos})`,
    };
  }
  return { ok: true };
}

export async function runCollectorSpotlight(
  config: CollectorSpotlightConfig = DEFAULT_COLLECTOR_SPOTLIGHT_CONFIG,
): Promise<RecipeResult> {
  const queue = (config.upNext ?? []).map((s) => s.trim()).filter(Boolean);
  const queued = queue[0] ?? null;

  const { options: listed, access } = await loadCollectors(
    config.cooldownDays,
    config.excludeUserIds ?? [],
  );
  // Blocked accounts are dropped here rather than relying on `available`: a
  // queued pick bypasses `available` deliberately, and queueing Kickio's own
  // account must still be impossible.
  const options = postable(listed);
  if (!access.ok) {
    // Says WHICH it is. "No collectors qualify" would be a plausible-looking
    // lie the week the engine loses its grant.
    return { ok: false, reason: access.reason, diagnostics: { blind: access.blind } };
  }

  const candidates = queued
    ? options.filter((c) => c.userId === queued)
    : options.filter((c) => c.available);

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: queued
        ? `Queued collector ${queued} is not eligible: opted out, or inside the ${config.cooldownDays}-day cooldown`
        : "No collector is off cooldown and consenting right now",
      diagnostics: { queued, queue, eligible: options.length },
    };
  }

  // Biggest collection first. The cooldown does the rotating.
  const shortlist = candidates.slice(0, 5);
  const shirts = await shirtsFor(shortlist);

  const rejected: Array<{ key: string; reason: string }> = [];
  let winner: { collector: CollectorOption; shape: CollectionShape } | null = null;

  for (const collector of shortlist) {
    const shape = shapeOf(shirts.get(collector.userId) ?? [], config);
    if (!shape) {
      rejected.push({ key: collector.name, reason: "no parseable seasons" });
      continue;
    }
    const verdict = qualifies(shape, config);
    if (!verdict.ok) {
      rejected.push({ key: collector.name, reason: verdict.reason! });
      continue;
    }
    if (!winner || shape.shirts > winner.shape.shirts) winner = { collector, shape };
    if (queued) break;
  }

  if (!winner) {
    return {
      ok: false,
      reason: queued
        ? `${shortlist[0]?.name ?? queued} cannot run: ${rejected[0]?.reason ?? "collection too small"}`
        : "No consenting collector has a collection big enough to post",
      diagnostics: { queued, queue, considered: shortlist.length, rejected },
    };
  }

  const { collector, shape } = winner;

  const claims: Claim[] = [
    {
      statement: `${collector.name} has ${shape.shirts} shirts in their Kickio collection`,
      value: shape.shirts,
      source: "collections joined to products, hidden rows excluded",
      basis: "What they have added to Kickio, not everything they own",
    },
    {
      statement: `Spanning ${shape.earliest} to ${shape.latest}`,
      value: `${shape.earliest}-${shape.latest}`,
      source: "products.season, earliest and latest in their collection",
    },
    {
      statement: `Across ${shape.clubs} clubs`,
      value: shape.clubs,
      source: "products.team, distinct values in their collection",
    },
  ];
  if (shape.topClub) {
    claims.push({
      statement: `Most of any one club: ${shape.topClub.shirts} ${shape.topClub.team}`,
      value: shape.topClub.shirts,
      source: "products.team, most frequent in their collection",
    });
  }

  return {
    ok: true,
    candidate: {
      subjectRef: subjectRefFor(collector.userId, "spotlight"),
      headline: `${collector.name}: ${shape.shirts} shirts, ${shape.earliest}–${shape.latest}`,
      sourceData: {
        subject: `${collector.name}'s collection`,
        collector: collector.name,
        collector_title: collector.title,
        shirts: shape.shirts,
        earliest: shape.earliest,
        latest: shape.latest,
        span_years: shape.spanYears,
        clubs: shape.clubs,
        top_club: shape.topClub,
        featured: shape.featured,
        // Carried for the reviewer, not for the copy. Under an opt-out model
        // the collector may not know this is coming; the approval screen is
        // where a person can decide to say hello first.
        collector_handle: collector.name,
        collector_flags: "collection_public and featured_consent both true",
        scope_note:
          "A real person's collection, published under Kickio's opt-out setting. " +
          "Never state or imply what it is worth or what any shirt cost.",
      },
      claims,
      images: shape.photos.slice(0, config.gridSize),
      ...(queued ? { consumeFromQueue: queued } : {}),
    },
  };
}

/** The shirts behind a shortlist of collectors, in one round trip. */
async function shirtsFor(
  collectors: CollectorOption[],
): Promise<Map<string, ProductRow[]>> {
  const out = new Map<string, ProductRow[]>();
  if (collectors.length === 0) return out;

  const { data: owned, error: ownedError } = await kickio()
    .from("collections")
    .select("user_id,product_id,hidden")
    .in(
      "user_id",
      collectors.map((c) => c.userId),
    )
    .eq("hidden", false)
    .limit(20_000);

  if (ownedError) throw new Error(`Loading collections failed: ${ownedError.message}`);
  const rows = (owned ?? []) as Array<{ user_id: string; product_id: string | null }>;
  const productIds = [...new Set(rows.map((r) => r.product_id).filter((id): id is string => !!id))];
  if (productIds.length === 0) return out;

  const { data: productData, error: productError } = await kickio()
    .from("products")
    .select("id,name,team,season,shirt_type,primary_image_url")
    .in("id", productIds)
    .is("deleted_at", null)
    .limit(20_000);

  if (productError) throw new Error(`Loading shirts failed: ${productError.message}`);
  const byId = new Map(
    ((productData ?? []) as unknown as ProductRow[]).map((p) => [p.id, p]),
  );

  for (const row of rows) {
    if (!row.product_id) continue;
    const product = byId.get(row.product_id);
    if (!product) continue;
    const list = out.get(row.user_id) ?? [];
    list.push(product);
    out.set(row.user_id, list);
  }
  return out;
}

export const COLLECTOR_SPOTLIGHT_BRIEF = `**Collector Spotlight** - one collector's whole collection.

Write about the COLLECTION, with the collector as its author. The sweep is the
hook: the span of years, the number of clubs, the one club they clearly cannot
stop buying. Pick out two or three specific shirts from the facts and say what
they suggest about the person's taste.

Four hard rules:
- NEVER state or imply what the collection is worth, what any shirt cost, or
  what they paid. Not in a range, not "easily four figures", not at all.
- Use the name in the facts exactly as given. Never guess a real name, a
  location, an age, a gender or a pronoun for this person - write about the
  collection, or use "they".
- Every number describes WHAT THEY HAVE ADDED TO KICKIO, not everything they
  own. Never call the collection complete or definitive, and do not rank it
  against other collectors.
- Warm, not fawning. This is a real person who will read it.`;
