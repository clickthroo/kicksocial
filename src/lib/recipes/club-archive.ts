/**
 * Club Archive - "50 years of Manchester United, on Kickio".
 *
 * The safest post this engine makes, and deliberately so. Every number in it is
 * a count of rows: how many shirts, the oldest season, the newest, how many kit
 * types. No index, no percentage, no comparable cohort - nothing that can be
 * arithmetically correct and still mislead, which is the failure the trend card
 * ran into.
 *
 * THE ONE CLAIM IT MUST NOT MAKE
 *
 * "50 years of Manchester United" is about KICKIO'S SHELF, not about football.
 * The 1975 shirt is the oldest Kickio has listed, not the oldest that exists,
 * and 164 shirts is not a complete archive of anything. Every fact is therefore
 * framed "on Kickio", and the brief forbids implying completeness. A collector
 * who owns a 1972 shirt should read this and see a marketplace's holdings, not
 * a claim they can disprove in one reply.
 *
 * WHY THE COUNTS ARE RECOUNTED HERE
 *
 * `teams.listings_count` looks like the number to use and is not: it reports 65
 * for England where 140 active products exist, and 54 for Arsenal against 86.
 * It counts something else, or counts it staler. It is good enough to shortlist
 * candidates cheaply and never good enough to print.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { recentlyFeatured } from "./cooldown.ts";
import { imageUrls } from "./grail-of-the-day.ts";
import { cleanValue } from "../kickio/values.ts";

interface TeamRow {
  name: string | null;
  listings_count: number | null;
}

interface ProductRow {
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  name: string | null;
  slug: string | null;
  primary_image_url: string | null;
}

export interface ClubArchiveConfig {
  /** Fewest shirts a club can have and still be worth a retrospective. */
  minShirts: number;
  /** A club whose shirts are all from three seasons is a shelf, not an archive. */
  minSpanYears: number;
  /** Fewest renderable photos for the grid. */
  minPhotos: number;
  /** How many photos the card shows. */
  gridSize: number;
  /** How many teams to pull from the cheap shortlist before counting properly. */
  shortlistSize: number;
  /** A club should not come round again for a long while. */
  cooldownDays: number;
  /**
   * Pin the post to one club. Empty means "whichever has the most depth".
   *
   * A pinned club bypasses the cooldown - an admin asking for Arsenal is asking
   * for Arsenal, not for a reminder that Arsenal ran in June - but it does NOT
   * bypass the quality gates. A club without the depth is refused by name, so
   * the answer is a clear no rather than a thin post.
   */
  team?: string | null;
}

export const DEFAULT_CLUB_ARCHIVE_CONFIG: ClubArchiveConfig = {
  minShirts: 20,
  minSpanYears: 15,
  minPhotos: 6,
  gridSize: 9,
  shortlistSize: 14,
  cooldownDays: 120,
  team: null,
};

/** Seasons are text ("1990-91"); `season_end_year` is null on every row. */
export function seasonYear(season: string | null): number | null {
  const match = /^(\d{4})/.exec(season?.trim() ?? "");
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  // A shirt from 1850 or 2400 is a data error, not a find.
  return year >= 1900 && year <= 2100 ? year : null;
}

export interface ClubSummary {
  team: string;
  shirts: number;
  earliest: number;
  latest: number;
  spanYears: number;
  kitTypes: number;
  photos: string[];
  /** The shirts whose photos are on the card, oldest first. */
  featured: Array<{ name: string | null; season: string | null; shirt_type: string | null }>;
}

/**
 * Turn one club's products into the numbers the card prints.
 *
 * Exported and pure: every figure here ends up in a claim, so each one should
 * be checkable without a database.
 */
export function summarise(
  team: string,
  products: ProductRow[],
  config: ClubArchiveConfig,
): ClubSummary | null {
  const years = products
    .map((p) => seasonYear(p.season))
    .filter((y): y is number => y !== null);
  if (years.length === 0) return null;

  const earliest = Math.min(...years);
  const latest = Math.max(...years);
  const kitTypes = new Set(
    products.map((p) => cleanValue(p.shirt_type)).filter((t): t is string => !!t),
  ).size;

  // Oldest first, so the grid reads as a timeline rather than a shelf.
  const withPhotos = products
    .filter((p) => imageUrls([p.primary_image_url]).length > 0)
    .sort((a, b) => (seasonYear(a.season) ?? 9999) - (seasonYear(b.season) ?? 9999));

  const seen = new Set<string>();
  const featured: ClubSummary["featured"] = [];
  const photos: string[] = [];
  for (const product of withPhotos) {
    const url = imageUrls([product.primary_image_url])[0];
    if (seen.has(url)) continue;
    seen.add(url);
    photos.push(url);
    featured.push({ name: product.name, season: product.season, shirt_type: product.shirt_type });
    if (photos.length >= config.gridSize) break;
  }

  return {
    team,
    shirts: products.length,
    earliest,
    latest,
    spanYears: latest - earliest,
    kitTypes,
    photos,
    featured,
  };
}

export interface ClubVerdict {
  ok: boolean;
  reason?: string;
}

export function qualifies(summary: ClubSummary, config: ClubArchiveConfig): ClubVerdict {
  if (summary.shirts < config.minShirts) {
    return { ok: false, reason: `${summary.shirts} shirts (need ${config.minShirts})` };
  }
  if (summary.spanYears < config.minSpanYears) {
    return {
      ok: false,
      reason:
        `only spans ${summary.spanYears} years, ${summary.earliest}-${summary.latest} ` +
        `(need ${config.minSpanYears})`,
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

export async function runClubArchive(
  config: ClubArchiveConfig = DEFAULT_CLUB_ARCHIVE_CONFIG,
): Promise<RecipeResult> {
  const pinned = config.team?.trim() || null;
  let names: string[];

  if (pinned) {
    names = [pinned];
  } else {
    // Cheap shortlist. teams.listings_count disagrees with the real product
    // count, so it is used only to decide who is worth counting properly.
    const { data: teamData, error: teamError } = await kickio()
      .from("teams")
      .select("name,listings_count")
      .is("deleted_at", null)
      .gt("listings_count", 0)
      .order("listings_count", { ascending: false })
      .limit(config.shortlistSize);

    if (teamError) return { ok: false, reason: `Kickio query failed: ${teamError.message}` };

    names = ((teamData ?? []) as unknown as TeamRow[])
      .map((t) => t.name)
      .filter((n): n is string => !!n);
    if (names.length === 0) {
      return { ok: false, reason: "No teams with any listings", diagnostics: { shortlist: 0 } };
    }
  }

  const { data: productData, error: productError } = await kickio()
    .from("products")
    .select("team,season,shirt_type,name,slug,primary_image_url")
    .is("deleted_at", null)
    .eq("status", "active")
    .in("team", names)
    .limit(2000);

  if (productError) return { ok: false, reason: `Kickio query failed: ${productError.message}` };

  const byTeam = new Map<string, ProductRow[]>();
  for (const row of (productData ?? []) as unknown as ProductRow[]) {
    if (!row.team) continue;
    const list = byTeam.get(row.team) ?? [];
    list.push(row);
    byTeam.set(row.team, list);
  }

  const seen = await recentlyFeatured("club_archive", config.cooldownDays);
  const rejected: Array<{ key: string; reason: string }> = [];
  const eligible: ClubSummary[] = [];

  if (pinned && byTeam.size === 0) {
    return {
      ok: false,
      reason: `No active products on Kickio for "${pinned}". Check the club's name matches Kickio's.`,
      diagnostics: { pinned },
    };
  }

  for (const [team, products] of byTeam) {
    // A pinned club was asked for by name; the cooldown is for the rotation.
    if (!pinned && seen.has(subjectRefFor(team))) {
      rejected.push({ key: team, reason: `covered within the last ${config.cooldownDays} days` });
      continue;
    }
    const summary = summarise(team, products, config);
    if (!summary) {
      rejected.push({ key: team, reason: "no parseable seasons" });
      continue;
    }
    const verdict = qualifies(summary, config);
    if (verdict.ok) eligible.push(summary);
    else rejected.push({ key: team, reason: verdict.reason! });
  }

  if (eligible.length === 0) {
    return {
      ok: false,
      reason: pinned
        ? `${pinned} does not have the depth for a retrospective: ${rejected[0]?.reason ?? "no qualifying products"}`
        : "No club has enough depth on Kickio for a retrospective right now",
      diagnostics: { pinned, shortlisted: names.length, rejected },
    };
  }

  // Deepest first. The cooldown does the rotating, so this does not need to.
  const winner = eligible.sort((a, b) => b.shirts - a.shirts)[0];

  const claims: Claim[] = [
    {
      statement: `${winner.shirts} ${winner.team} shirts listed on Kickio`,
      value: winner.shirts,
      source: "products (active, not deleted), counted by team",
      basis: "What Kickio has listed, not what exists",
    },
    {
      statement: `Spanning ${winner.earliest} to ${winner.latest}`,
      value: `${winner.earliest}-${winner.latest}`,
      source: "products.season, earliest and latest on Kickio",
      basis: "The oldest and newest Kickio holds - not the club's first or latest kit",
    },
    {
      statement: `${winner.kitTypes} different kit types`,
      value: winner.kitTypes,
      source: "products.shirt_type, distinct values for this club",
    },
  ];

  return {
    ok: true,
    candidate: {
      subjectRef: subjectRefFor(winner.team),
      headline: `${winner.shirts} ${winner.team} shirts on Kickio, ${winner.earliest}–${winner.latest}`,
      sourceData: {
        subject: `${winner.team} on Kickio`,
        team: winner.team,
        shirts: winner.shirts,
        earliest: winner.earliest,
        latest: winner.latest,
        span_years: winner.spanYears,
        kit_types: winner.kitTypes,
        featured: winner.featured,
        scope_note: "Counts describe Kickio's listings, not the club's full kit history",
      },
      claims,
      images: winner.photos,
    },
  };
}

/** Case-insensitive, so "Arsenal" and "arsenal" cannot both be featured. */
export function subjectRefFor(team: string): string {
  return `club:${team.trim().toLowerCase()}`;
}

export const CLUB_ARCHIVE_BRIEF = `**Club Archive** - what Kickio holds for one club, across the decades.

The hook is the sweep: shirts from the 70s or 80s sitting alongside last season's,
all for the same badge. A collector scrolling past their own club should stop.

Pick out one or two specific shirts from the facts and say why that era's kit is
worth a second look - the sponsor, the manufacturer, what was happening at the
club. The list is the subject; the detail is what makes it readable.

Two hard rules:
- Every number describes WHAT KICKIO HAS LISTED, not what exists. Never call it
  complete, never call it every shirt, and never imply the oldest one listed is
  the club's oldest kit. Say "on Kickio" and mean it.
- Do not rank the club against others, or call the collection big, best or
  definitive. You have counts, not a comparison.`;
