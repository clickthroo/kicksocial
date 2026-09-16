/**
 * Grail of the Day - the standout active listing.
 *
 * Honesty rules baked in:
 *  - Only `active`, in-stock, non-deleted listings with photography are eligible,
 *    so we never point followers at something they cannot buy.
 *  - Rarity is scored from attributes that are actually recorded on the listing
 *    (match issue, signed, special edition, condition, age). We never assert
 *    "rarest shirt on the site" - that is not something the data supports. The
 *    claims we emit are the specific attributes, which are checkable.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { recentlyFeatured } from "./cooldown.ts";

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
}

export interface GrailConfig {
  /** Ignore anything below this, to keep the feed feeling premium. */
  minPriceCents: number;
  /** How many top listings to score before picking. */
  poolSize: number;
  /** Don't re-feature the same listing within this many days. */
  cooldownDays: number;
}

export const DEFAULT_GRAIL_CONFIG: GrailConfig = {
  minPriceCents: 15_000,
  poolSize: 40,
  cooldownDays: 45,
};

/** Attribute values that genuinely signal scarcity, with why they count. */
const RARITY_SIGNALS: Array<{
  test: (l: ListingRow) => boolean;
  points: number;
  label: string;
}> = [
  {
    test: (l) => /match (issue|worn)/i.test(l.issue ?? ""),
    points: 40,
    label: "Match issue",
  },
  {
    test: (l) => !!l.signed && !/^not signed$/i.test(l.signed),
    points: 30,
    label: "Signed",
  },
  {
    test: (l) => !!l.special_edition && !/^(no|none|standard)$/i.test(l.special_edition),
    points: 20,
    label: "Special edition",
  },
  {
    test: (l) => !!l.boxed_edition && !/^(no|none)$/i.test(l.boxed_edition),
    points: 10,
    label: "Boxed edition",
  },
  { test: (l) => /^mint$/i.test(l.condition ?? ""), points: 15, label: "Mint condition" },
  { test: (l) => !!l.player_name, points: 10, label: "Player issue" },
];

/** Shirts from the 80s/90s carry a scarcity premium; derive it from the season. */
function vintagePoints(season: string | null): { points: number; decade: number | null } {
  const year = Number.parseInt(season?.slice(0, 4) ?? "", 10);
  if (!Number.isFinite(year)) return { points: 0, decade: null };
  const decade = Math.floor(year / 10) * 10;
  if (year < 1990) return { points: 30, decade };
  if (year < 2000) return { points: 25, decade };
  if (year < 2010) return { points: 12, decade };
  return { points: 0, decade };
}

function imageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((entry) =>
      typeof entry === "string"
        ? entry
        : entry && typeof entry === "object" && "url" in entry
          ? String((entry as { url: unknown }).url)
          : null,
    )
    .filter((u): u is string => !!u && u.startsWith("http"));
}

export function scoreListing(listing: ListingRow): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  for (const signal of RARITY_SIGNALS) {
    if (signal.test(listing)) {
      score += signal.points;
      signals.push(signal.label);
    }
  }

  const vintage = vintagePoints(listing.season);
  if (vintage.points > 0 && vintage.decade !== null) {
    score += vintage.points;
    signals.push(`${vintage.decade}s`);
  }

  // Price contributes, but is capped so an expensive-but-plain shirt doesn't
  // always beat a genuinely rare one.
  score += Math.min(30, listing.price_cents / 5_000);

  return { score, signals };
}

export async function runGrailOfTheDay(
  config: GrailConfig = DEFAULT_GRAIL_CONFIG,
): Promise<RecipeResult> {
  const { data, error } = await kickio()
    .from("listings")
    .select(
      "id,title,price_cents,currency,team,season,shirt_type,condition,issue,signed," +
        "special_edition,boxed_edition,player_name,manufacturer,images,created_at",
    )
    .eq("status", "active")
    .is("deleted_at", null)
    .gt("stock_quantity", 0)
    .gte("price_cents", config.minPriceCents)
    .order("price_cents", { ascending: false })
    .limit(config.poolSize);

  if (error) return { ok: false, reason: `Kickio query failed: ${error.message}` };

  const listings = (data ?? []) as unknown as ListingRow[];
  const withPhotos = listings.filter((l) => imageUrls(l.images).length > 0);
  if (withPhotos.length === 0) {
    return {
      ok: false,
      reason: "No eligible active listings with photography",
      diagnostics: { fetched: listings.length },
    };
  }

  const seen = await recentlyFeatured("grail_of_the_day", config.cooldownDays);
  const eligible = withPhotos.filter((l) => !seen.has(l.id));
  if (eligible.length === 0) {
    return {
      ok: false,
      reason: `All ${withPhotos.length} candidates featured within ${config.cooldownDays} days`,
      diagnostics: { cooldownDays: config.cooldownDays, poolSize: withPhotos.length },
    };
  }

  const ranked = eligible
    .map((listing) => ({ listing, ...scoreListing(listing) }))
    .sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  const { listing, signals } = winner;

  const price = (listing.price_cents / 100).toLocaleString("en-GB", {
    style: "currency",
    currency: listing.currency || "GBP",
    maximumFractionDigits: 0,
  });

  const claims: Claim[] = [
    {
      statement: `Listed at ${price}`,
      value: listing.price_cents / 100,
      source: `listings.price_cents (id ${listing.id})`,
    },
  ];
  if (listing.condition) {
    claims.push({
      statement: `Condition: ${listing.condition}`,
      value: listing.condition,
      source: "listings.condition",
    });
  }
  for (const signal of signals) {
    claims.push({
      statement: signal,
      value: true,
      source: "listings attributes",
      basis: "Derived from the listing's recorded attributes",
    });
  }

  const candidate: RecipeCandidate = {
    subjectRef: listing.id,
    headline: listing.title,
    sourceData: {
      listing_id: listing.id,
      title: listing.title,
      price: price,
      team: listing.team,
      season: listing.season,
      shirt_type: listing.shirt_type,
      condition: listing.condition,
      issue: listing.issue,
      signed: listing.signed,
      special_edition: listing.special_edition,
      player_name: listing.player_name,
      manufacturer: listing.manufacturer,
      rarity_signals: signals,
      rarity_score: Math.round(winner.score),
      runners_up: ranked.slice(1, 4).map((r) => ({
        title: r.listing.title,
        score: Math.round(r.score),
      })),
    },
    claims,
    images: imageUrls(listing.images),
  };

  return { ok: true, candidate };
}
