/**
 * Legend Shelf - several recognisable players' shirts, all live and buyable on
 * Kickio right now, shown together.
 *
 * WHY THIS EXISTS
 *
 * Every other recipe scores a *shirt*. This one leans on the one signal that
 * reaches further than the collector audience: a name a non-collector would
 * recognise. A single Grail of the Day post can happen to carry a legend's
 * printing, but it is not selected for that, and one shirt cannot make the
 * "spot the name you know" format work - it needs a lineup.
 *
 * NAME MATCHING IS AN ALLOWLIST, DELIBERATELY - see grail-of-the-day.ts's
 * SIGNAL_VALUES for the same lesson learned once already: matching by negation
 * ("anything that isn't a known non-signal") fails open. Here failing open
 * would be worse than a missed signal, because the tile prints the resulting
 * name in large type - a wrong attribution is not a missing bonus point, it is
 * a false claim on the card itself. So a `player_name` value is only ever
 * mapped to a legend it is listed under, and an ambiguous surname (shared with
 * another well-known player) additionally requires the listing's team to be
 * one of that legend's `teamHints` before it counts. Anything that does not
 * clear this is simply not shown - never guessed at.
 *
 * ELIGIBILITY mirrors Grail of the Day exactly (`isLive`, imported from
 * there): a legend's name on a listing that is not actually live on kickio.com
 * (wrong seller, stale scrape, withdrawn, pending review) is not a shirt this
 * post can point anyone at.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { engine } from "../engine/client.ts";
import {
  isLive,
  imageUrls,
  kickioUrl,
  DEFAULT_GRAIL_CONFIG,
  type GrailConfig,
} from "./grail-of-the-day.ts";
import { recentlyFeatured } from "./cooldown.ts";
import { weekKey } from "./sold-this-week.ts";
import { buyerFeeSettings, buyerPriceCents, formatPrice } from "../kickio/pricing.ts";
import { cleanValue, cleanFacts } from "../kickio/values.ts";

export const LEGEND_SHELF_KEY = "legend_shelf";

/**
 * Who counts as a "legend" for this card, and how a raw `player_name` value
 * maps to one.
 *
 * `match` values are compared case-insensitively after `cleanValue` - both the
 * full name and the shirt-print short form Kickio's data actually carries
 * (verified against real rows: "Diego Maradona" and "Maradona" both occur for
 * the same player). `teamHints`, where present, is a hard requirement, not a
 * tiebreaker: a listing whose team is not in the list is skipped for that
 * legend entirely rather than assigned to the more likely one.
 */
export interface LegendDef {
  id: string;
  displayName: string;
  match: string[];
  /** Required only for a name shared with another well-known player. */
  teamHints?: string[];
}

export const LEGENDS: LegendDef[] = [
  { id: "maradona", displayName: "Diego Maradona", match: ["Maradona", "Diego Maradona", "S Maradona"] },
  { id: "pele", displayName: "Pelé", match: ["Pele", "Pelé"] },
  { id: "zidane", displayName: "Zinedine Zidane", match: ["Zidane", "Zinedine Zidane"] },
  { id: "ronaldinho", displayName: "Ronaldinho", match: ["Ronaldinho"] },
  { id: "beckham", displayName: "David Beckham", match: ["Beckham", "David Beckham"] },
  { id: "henry", displayName: "Thierry Henry", match: ["Henry", "Thierry Henry"] },
  {
    id: "shevchenko",
    displayName: "Andriy Shevchenko",
    match: ["Shevchenko", "Andriy Shevchenko", "S Shevchenko"],
  },
  { id: "cantona", displayName: "Eric Cantona", match: ["Cantona", "Eric Cantona"] },
  { id: "bergkamp", displayName: "Dennis Bergkamp", match: ["Bergkamp", "Dennis Bergkamp"] },
  { id: "kaka", displayName: "Kaká", match: ["Kaka", "Kaká"] },
  { id: "figo", displayName: "Luís Figo", match: ["Figo", "Luis Figo"] },
  { id: "totti", displayName: "Francesco Totti", match: ["Totti", "Francesco Totti"] },
  { id: "delpiero", displayName: "Alessandro Del Piero", match: ["Del Piero", "Alessandro Del Piero"] },
  { id: "raul", displayName: "Raúl", match: ["Raul", "Raúl"] },
  { id: "xavi", displayName: "Xavi", match: ["Xavi"] },
  { id: "iniesta", displayName: "Andrés Iniesta", match: ["Iniesta", "Andres Iniesta"] },
  { id: "drogba", displayName: "Didier Drogba", match: ["Drogba", "Didier Drogba"] },
  { id: "lampard", displayName: "Frank Lampard", match: ["Lampard", "Frank Lampard"] },
  { id: "gerrard", displayName: "Steven Gerrard", match: ["Gerrard", "Steven Gerrard"] },
  { id: "scholes", displayName: "Paul Scholes", match: ["Scholes", "Paul Scholes"] },
  {
    id: "best",
    displayName: "George Best",
    match: ["Best", "George Best"],
    // "Best" alone is an ordinary word as well as a surname - require the
    // listing to actually be one of his clubs before it counts.
    teamHints: ["Manchester United", "Northern Ireland"],
  },
  {
    id: "ronaldo_nazario",
    displayName: "Ronaldo Nazário",
    match: ["Ronaldo"],
    // Bare "Ronaldo" is ambiguous with Cristiano Ronaldo. Only counts on a club
    // or country Ronaldo Nazário actually played for.
    teamHints: ["Brazil", "Barcelona", "Inter Milan", "PSV Eindhoven", "AC Milan"],
  },
  {
    id: "cristiano_ronaldo",
    displayName: "Cristiano Ronaldo",
    match: ["Cristiano Ronaldo", "C Ronaldo", "CR7"],
  },
];

const MATCH_INDEX = new Map<string, LegendDef[]>();
for (const legend of LEGENDS) {
  for (const token of legend.match) {
    const key = token.trim().toLowerCase();
    const list = MATCH_INDEX.get(key) ?? [];
    list.push(legend);
    MATCH_INDEX.set(key, list);
  }
}

/**
 * The legend a listing's printed name and team identify, or null.
 *
 * Exported and pure so the allowlist logic - the part most worth getting
 * exactly right - is testable without a database behind it.
 */
export function matchLegend(playerName: unknown, team: unknown): LegendDef | null {
  const cleanedName = cleanValue(playerName);
  if (!cleanedName) return null;
  const candidates = MATCH_INDEX.get(cleanedName.toLowerCase());
  if (!candidates || candidates.length === 0) return null;

  const cleanedTeam = cleanValue(team);
  for (const legend of candidates) {
    if (!legend.teamHints) return legend;
    if (cleanedTeam && legend.teamHints.some((t) => t.toLowerCase() === cleanedTeam.toLowerCase())) {
      return legend;
    }
  }
  return null;
}

/**
 * Carries the same shape `isLive` (grail-of-the-day.ts) expects, including a
 * few columns this recipe never reads itself (issue, signed, special_edition,
 * boxed_edition, created_at) - selected anyway so the row is structurally the
 * `ListingRow` that function was written against, rather than a second,
 * drifting copy of its eligibility fields.
 */
interface ListingRow {
  id: string;
  title: string;
  price_cents: number;
  currency: string;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  condition: string | null;
  issue: string | null;
  signed: string | null;
  special_edition: string | null;
  boxed_edition: string | null;
  player_name: string | null;
  manufacturer: string | null;
  images: unknown;
  created_at: string;
  removed_at: string | null;
  removed_reason: string | null;
  consecutive_gone_count: number;
  reserved_until: string | null;
  last_stock_checked_at: string | null;
  is_partner_listing: boolean;
  seller_id: string;
  source_url: string | null;
  source: string | null;
  products: { status: string; deleted_at: string | null; slug: string | null } | null;
}

export interface LegendMatch {
  legend: LegendDef;
  listing: ListingRow;
}

/**
 * One listing per legend: the cheapest live, photographed listing for each
 * matched player. Same reasoning as Grail of the Day's "cheapest per
 * product" - kickio.com headlines the lowest asking price for a given item,
 * and here the "item" a reader compares against is the player, not a specific
 * product id (several products can carry the same legend's printing).
 */
export function cheapestPerLegend(matches: LegendMatch[]): LegendMatch[] {
  const byLegend = new Map<string, LegendMatch>();
  for (const entry of matches) {
    const held = byLegend.get(entry.legend.id);
    if (!held || entry.listing.price_cents < held.listing.price_cents) {
      byLegend.set(entry.legend.id, entry);
    }
  }
  return [...byLegend.values()];
}

/**
 * Recently-featured legends sort last, but are not excluded outright - a
 * small roster should still produce a post rather than none. Relative order
 * within each tier is preserved (stable on price, since callers sort by price
 * first).
 */
export function preferUnseen(matches: LegendMatch[], recentLegendIds: Set<string>): LegendMatch[] {
  return matches
    .map((m, index) => ({ m, index, seen: recentLegendIds.has(m.legend.id) }))
    .sort((a, b) => Number(a.seen) - Number(b.seen) || a.index - b.index)
    .map((e) => e.m);
}

export interface LegendShelfConfig {
  /** Kept low deliberately - the name is the draw here, not the price. */
  minPriceCents: number;
  /** Rows to consider, ordered by price descending. */
  poolSize: number;
  /** How many legends to show on the card. */
  gridSize: number;
  /** Below this the grid reads as thin rather than curated. */
  minCount: number;
  /** How long the same lineup (this exact set of legends) stays off the feed. */
  cooldownDays: number;
  /** How long a legend is soft-avoided after appearing, so the roster rotates. */
  legendCooldownDays: number;
  maxStockCheckAgeDays: number;
  allowedSellerIds: string[];
}

export const DEFAULT_LEGEND_SHELF_CONFIG: LegendShelfConfig = {
  minPriceCents: 2_000,
  poolSize: 3_000,
  gridSize: 6,
  minCount: 4,
  cooldownDays: 6,
  legendCooldownDays: 21,
  maxStockCheckAgeDays: DEFAULT_GRAIL_CONFIG.maxStockCheckAgeDays,
  allowedSellerIds: DEFAULT_GRAIL_CONFIG.allowedSellerIds,
};

/** Legend ids featured on this recipe's own drafts within the window. Soft signal only. */
async function recentLegendIds(days: number): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await engine()
    .from("post_drafts")
    .select("source_data")
    .eq("recipe_key", LEGEND_SHELF_KEY)
    .gte("created_at", since);

  if (error) throw new Error(`Legend cooldown lookup failed: ${error.message}`);

  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ source_data: Record<string, unknown> | null }>) {
    const legends = row.source_data?.legends;
    if (!Array.isArray(legends)) continue;
    for (const entry of legends) {
      if (entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string") {
        ids.add((entry as { id: string }).id);
      }
    }
  }
  return ids;
}

export async function runLegendShelf(
  config: LegendShelfConfig = DEFAULT_LEGEND_SHELF_CONFIG,
): Promise<RecipeResult> {
  const subjectRef = `${LEGEND_SHELF_KEY}:${weekKey(new Date())}`;
  const seen = await recentlyFeatured(LEGEND_SHELF_KEY, config.cooldownDays);
  if (seen.has(subjectRef)) {
    return { ok: false, reason: `Week ${subjectRef} already covered` };
  }

  const { data, error } = await kickio()
    .from("listings")
    .select(
      "id,title,price_cents,currency,team,season,shirt_type,condition,issue,signed," +
        "special_edition,boxed_edition,player_name,manufacturer,images,created_at," +
        "removed_at,removed_reason,consecutive_gone_count," +
        "reserved_until,last_stock_checked_at,is_partner_listing,seller_id,source_url,source," +
        "products!inner(status,deleted_at,slug)",
    )
    .eq("status", "active")
    .is("deleted_at", null)
    .gt("stock_quantity", 0)
    .is("removed_at", null)
    .eq("consecutive_gone_count", 0)
    .in("seller_id", config.allowedSellerIds)
    .not("player_name", "is", null)
    .eq("products.status", "active")
    .is("products.deleted_at", null)
    .gte("price_cents", config.minPriceCents)
    .order("price_cents", { ascending: false })
    .limit(config.poolSize);

  if (error) return { ok: false, reason: `Kickio query failed: ${error.message}` };

  const listings = (data ?? []) as unknown as ListingRow[];
  const live = listings.filter((l) =>
    isLive(l, { maxStockCheckAgeDays: config.maxStockCheckAgeDays, allowedSellerIds: config.allowedSellerIds }),
  );

  const matches: LegendMatch[] = [];
  for (const listing of live) {
    if (imageUrls(listing.images).length === 0) continue;
    const legend = matchLegend(listing.player_name, listing.team);
    if (legend) matches.push({ legend, listing });
  }

  if (matches.length === 0) {
    return {
      ok: false,
      reason: "No live, photographed listing matched a known legend's printing",
      diagnostics: { fetched: listings.length, live: live.length },
    };
  }

  const oneEach = cheapestPerLegend(matches);
  const recent = await recentLegendIds(config.legendCooldownDays);
  const ordered = preferUnseen(oneEach, recent);
  const featured = ordered.slice(0, config.gridSize);

  if (featured.length < config.minCount) {
    return {
      ok: false,
      reason: `Only ${featured.length} distinct legends live and photographed (need ${config.minCount})`,
      diagnostics: { distinctLegends: oneEach.length },
    };
  }

  const fee = await buyerFeeSettings();
  const currency = featured[0].listing.currency || "GBP";

  const legendsData = featured.map(({ legend, listing }) => {
    const buyerCents = buyerPriceCents(listing.price_cents, fee);
    return {
      id: legend.id,
      name: legend.displayName,
      listing_id: listing.id,
      title: listing.title,
      team: cleanValue(listing.team),
      season: cleanValue(listing.season),
      shirt_type: cleanValue(listing.shirt_type),
      condition: cleanValue(listing.condition),
      manufacturer: cleanValue(listing.manufacturer),
      price: formatPrice(buyerCents, currency),
      asking_price: formatPrice(listing.price_cents, currency),
      kickio_url: kickioUrl(listing.products?.slug ?? null),
    };
  });

  const claims: Claim[] = featured.map(({ legend, listing }) => {
    const buyerCents = buyerPriceCents(listing.price_cents, fee);
    const shirt = [cleanValue(listing.team), cleanValue(listing.season), cleanValue(listing.shirt_type)]
      .filter(Boolean)
      .join(" ");
    return {
      statement: `${legend.displayName}'s ${shirt} shirt is ${formatPrice(buyerCents, currency)} on Kickio`,
      value: buyerCents / 100,
      source: `listings.price_cents (id ${listing.id}) + buyer protection fee`,
      basis:
        `printed name matched against a fixed allowlist (legend-shelf.ts LEGENDS); ` +
        `asking ${formatPrice(listing.price_cents, currency)} plus ` +
        `${fee.percentBps / 100}% + ${formatPrice(fee.fixedCents, currency)}, rounded ${fee.rounding}`,
    };
  });

  const names = featured.map((f) => f.legend.displayName);

  return {
    ok: true,
    candidate: {
      subjectRef,
      headline: `On Kickio now: ${names.slice(0, 3).join(", ")}${names.length > 3 ? " and more" : ""}`,
      sourceData: cleanFacts({
        week: weekKey(new Date()),
        headline_text: names.length > 4 ? "Names you know" : names.join(" · "),
        legends: legendsData,
      }) as Record<string, unknown>,
      claims,
      images: featured.map(({ listing }) => imageUrls(listing.images)[0]),
    },
  };
}

export const LEGEND_SHELF_BRIEF = `**Legend Shelf** - several famous-player shirts on Kickio, all buyable right now.

The hook is name recognition: shirts genuinely printed for players a non-collector
would recognise, priced and photographed for sale today. Name each legend shown
in \`legends\` alongside their shirt (team, season) and price - the names alone
are the draw, so let them carry the post rather than adding superlatives the
facts don't support.

Four hard rules:
- Every shirt in \`legends\` is a LIVE, BUYABLE listing on Kickio right now. Never
  imply any of them are sold, reserved, or no longer available.
- Do not add biography, career facts, trophies, or anything about the player
  that is not in the facts. The facts describe the shirt, not the person.
- Do not rank or compare the players ("the greatest of the six"). Presenting
  them side by side is the format; picking a favourite is not this post's job.
- A printed name is a printed shirt, not confirmation the player wore this
  exact one - never write "match worn" or "worn by" unless the facts say so.

A "which one would you take home" or "tag someone who'd want the [name]" style
prompt fits this format well and is the one invitation this post should make -
a lineup of recognisable names is the natural reason to comment or share.`;
