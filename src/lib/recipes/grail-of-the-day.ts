/**
 * Grail of the Day - the standout active listing.
 *
 * Honesty rules baked in:
 *  - Only genuinely live listings are eligible. `listings.status = 'active'` is
 *    NOT sufficient on its own: a listing can be active while `removed_at` is
 *    set (including `removed_reason = 'sold_detected'`, i.e. already sold
 *    elsewhere), while its linked product is still in Kickio's review queue
 *    (`products.status` is pending/rejected/archived), or while it is reserved
 *    for a buyer mid-checkout. It must also have been positively confirmed in
 *    stock recently: `consecutive_gone_count = 0` is the value for a listing
 *    that has never been checked at all, so it is not evidence of anything on
 *    its own. In practice this also excludes scraped partner listings, none of
 *    which carry a stock check. Each of those is excluded below, so we never
 *    point followers at something they cannot buy or that Kickio has not
 *    itself approved.
 *  - Rarity is scored from attributes that are actually recorded on the listing
 *    (match issue, signed, special edition, condition, age). We never assert
 *    "rarest shirt on the site" - that is not something the data supports. The
 *    claims we emit are the specific attributes, which are checkable.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import {
  selectionHistory,
  applyHistory,
  DEFAULT_HISTORY_WINDOWS,
  type HistoryWindows,
} from "./history.ts";
import { buyerFeeSettings, buyerPriceCents, formatPrice } from "../kickio/pricing.ts";
import { cleanValue, cleanFacts } from "../kickio/values.ts";

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
  // Lifecycle state - a listing can be `active` and still not be sellable.
  removed_at: string | null;
  removed_reason: string | null;
  consecutive_gone_count: number;
  reserved_until: string | null;
  last_stock_checked_at: string | null;
  is_partner_listing: boolean;
  seller_id: string;
  /** Where Kickio scraped this from (eBay, CFS...) - NOT its page on Kickio. */
  source_url: string | null;
  source: string | null;
  // Kickio's own review queue lives on the product, not the listing.
  products: { status: string; deleted_at: string | null; slug: string | null } | null;
}

export interface GrailConfig {
  /** Ignore anything below this, to keep the feed feeling premium. */
  minPriceCents: number;
  /** How many top listings to score before picking. */
  poolSize: number;
  /**
   * How long a shirt, a club and a given season's kit stay out of rotation.
   * Keyed on the PRODUCT, not the listing: 52 products carry more than one
   * listing, so a listing-level key lets the same shirt return under a new id.
   */
  cooldownDays: number;
  comboCooldownDays: number;
  teamCooldownDays: number;
  /**
   * Scraped listings must have been confirmed in stock within this many days.
   * Only applies to `source = 'scrape'`: Kickio Direct stock has no external
   * source to check, so the column is null for it by design. Requiring it
   * unconditionally excluded every Kickio Direct listing.
   */
  maxStockCheckAgeDays: number;
  /**
   * Sellers whose listings actually appear on kickio.com. This is the real
   * signal for "live on Kickio" - no column in the listing or product says so.
   * Editable in the admin screen.
   */
  allowedSellerIds: string[];
}

/** Kickio Direct, and the approved partner seller - both appear on the site. */
export const KICKIO_DIRECT_SELLER = "ee2ce3bb-30d8-4f94-8cfd-a575866af57e";
export const APPROVED_PARTNER_SELLER = "00000000-0000-0000-0000-0000000000b0";

export const DEFAULT_GRAIL_CONFIG: GrailConfig = {
  // Kickio Direct stock tops out at £199, so a £150 floor admitted almost only
  // partner listings. £100 keeps the feed premium while including both.
  minPriceCents: 10_000,
  poolSize: 60,
  cooldownDays: DEFAULT_HISTORY_WINDOWS.subjectDays,
  comboCooldownDays: DEFAULT_HISTORY_WINDOWS.comboDays,
  teamCooldownDays: DEFAULT_HISTORY_WINDOWS.teamDays,
  maxStockCheckAgeDays: 7,
  allowedSellerIds: [KICKIO_DIRECT_SELLER, APPROVED_PARTNER_SELLER],
};

/**
 * Attribute values that genuinely signal scarcity.
 *
 * THESE ARE ALLOWLISTS, DELIBERATELY. An earlier version tested by negation -
 * "treat it as special unless it reads no/none/standard" - which failed open:
 * Kickio writes "Not A Special Edition" and "Not A Boxed Edition", neither of
 * which matched, so 1,335 and 1,310 listings respectively were flagged as rare
 * and a draft went out claiming a shirt was "still boxed" when the listing said
 * it was not.
 *
 * So a value counts ONLY if it is recognised here. An unrecognised value claims
 * nothing and is reported in `unknown_attribute_values` on the draft, so new
 * vocabulary surfaces instead of silently becoming a false claim.
 *
 * Verified against every distinct value in `listings` on 2026-09-17.
 */
const SIGNAL_VALUES = {
  issue: {
    positive: new Map([
      ["match issue", { points: 40, label: "Match issue" }],
      ["authentic/player version", { points: 25, label: "Player-issue spec" }],
    ]),
    negative: new Set(["standard retail version"]),
  },
  signed: {
    positive: new Map([["signed", { points: 30, label: "Signed" }]]),
    negative: new Set(["not signed"]),
  },
  special_edition: {
    positive: new Map([
      ["special edition", { points: 20, label: "Special edition" }],
      ["cup final", { points: 22, label: "Cup final edition" }],
      ["world cup", { points: 22, label: "World Cup edition" }],
      ["centenary", { points: 22, label: "Centenary edition" }],
      ["champions league", { points: 20, label: "Champions League edition" }],
      ["champions", { points: 20, label: "Champions edition" }],
    ]),
    negative: new Set(["not a special edition"]),
  },
  boxed_edition: {
    positive: new Map([["boxed edition - in box", { points: 18, label: "Boxed, in box" }]]),
    negative: new Set(["not a boxed edition"]),
  },
  condition: {
    positive: new Map([
      ["brand new (with tags)", { points: 20, label: "Brand new with tags" }],
      ["mint", { points: 15, label: "Mint condition" }],
    ]),
    negative: new Set([
      "very good",
      "good",
      "fair",
      "needs attention",
      "excellent condition",
    ]),
  },
} as const;

type SignalColumn = keyof typeof SIGNAL_VALUES;

/**
 * Anything carrying the attribute columns. A listing is one; so is a product
 * row plus an admin-entered condition (Grail Sale). Deliberately structural, so
 * there is exactly one copy of the allowlist - a second one would drift, which
 * is precisely how the "still boxed" claim got out.
 */
export type SignalSource = { [K in SignalColumn]?: string | null };

export interface SignalResult {
  points: number;
  labels: string[];
  /** Values we did not recognise, so new vocabulary is visible rather than guessed at. */
  unknown: Array<{ column: string; value: string }>;
}

export function readSignals(listing: SignalSource): SignalResult {
  const labels: string[] = [];
  const unknown: Array<{ column: string; value: string }> = [];
  let points = 0;

  for (const column of Object.keys(SIGNAL_VALUES) as SignalColumn[]) {
    const raw = listing[column];
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const value = raw.trim().toLowerCase();

    const spec = SIGNAL_VALUES[column];
    const hit = spec.positive.get(value);
    if (hit) {
      points += hit.points;
      labels.push(hit.label);
    } else if (!(spec.negative as ReadonlySet<string>).has(value)) {
      // Neither a known signal nor a known non-signal - claim nothing, flag it.
      unknown.push({ column, value: raw });
    }
  }

  return { points, labels, unknown };
}

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

/**
 * Belt-and-braces eligibility check, mirroring the query filters. Applied to
 * every fetched row so that if the query is ever edited and loses a condition,
 * ineligible listings still cannot reach a post.
 */
/**
 * Identity for cooldown purposes: the PRODUCT, not the listing. A product can
 * carry several listings of the same shirt, so keying on the listing id would
 * let it return under a different id a day later.
 */
export function subjectRefFor(listing: ListingRow): string {
  return listing.products?.slug ?? `listing:${listing.id}`;
}

export function isLive(
  listing: ListingRow,
  config: Pick<GrailConfig, "maxStockCheckAgeDays" | "allowedSellerIds"> = DEFAULT_GRAIL_CONFIG,
  now = new Date(),
): boolean {
  if (listing.removed_at !== null) return false;
  if (listing.consecutive_gone_count > 0) return false;

  // Whether it appears on kickio.com is a property of the seller, not of any
  // status column. Only these sellers' listings are shown on the site.
  if (!config.allowedSellerIds.includes(listing.seller_id)) return false;

  // A scraped listing lives on someone else's site and can vanish, so it must
  // have been confirmed recently. Kickio Direct stock has no external source -
  // last_stock_checked_at is null for all of it - so the check does not apply.
  if (listing.source === "scrape") {
    if (listing.last_stock_checked_at === null) return false;
    const ageMs = now.getTime() - new Date(listing.last_stock_checked_at).getTime();
    if (ageMs > config.maxStockCheckAgeDays * 86_400_000) return false;
  }
  if (listing.reserved_until !== null && new Date(listing.reserved_until) > now) return false;
  const product = listing.products;
  if (!product) return false;
  if (product.status !== "active") return false;
  if (product.deleted_at !== null) return false;
  return true;
}

/**
 * The listing's page on Kickio itself, built from the product slug.
 *
 * `listings.source_url` is NOT this - it points at wherever the listing was
 * scraped from (eBay, Classic Football Shirts). Both are surfaced to the
 * reviewer, but they mean different things and are labelled accordingly.
 *
 * Defaults to the live pattern, e.g.
 * https://kickio.com/marketplace/1990-92-england-third-shirt
 * KICKIO_SITE_URL / KICKIO_PRODUCT_PATH override it if the site moves.
 */
export const KICKIO_SITE_DEFAULT = "https://kickio.com";
export const KICKIO_PRODUCT_PATH_DEFAULT = "/marketplace/{slug}";

export function kickioUrl(slug: string | null): string | null {
  if (!slug) return null;
  const base = (process.env.KICKIO_SITE_URL || KICKIO_SITE_DEFAULT).replace(/\/$/, "");
  const path = process.env.KICKIO_PRODUCT_PATH || KICKIO_PRODUCT_PATH_DEFAULT;
  return base + path.replace("{slug}", slug);
}

/**
 * Formats Satori can actually decode when rendering the card.
 *
 * WebP used to be excluded here, because Satori draws it as an empty frame
 * with no error - a draft that looks fine in the queue with no shirt in it.
 * That was safe and expensive: it removed 474 of 1,649 live listings from
 * every photo-led recipe, nearly a third of the shelf, for a reason that had
 * nothing to do with the shirt.
 *
 * The render route now transcodes with sharp (src/lib/render/photos.ts), so
 * the question here is no longer "can Satori read this?" but "can we get it
 * into something Satori reads?" - which is a longer list.
 */
const RENDERABLE_IMAGE = /\.(jpe?g|png|webp|avif|tiff?|gif)(\?|$)/i;

function allImageUrls(images: unknown): string[] {
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

/** Only images the card renderer can display, in the listing's own order. */
export function imageUrls(images: unknown): string[] {
  return allImageUrls(images).filter((u) => RENDERABLE_IMAGE.test(u));
}

export function scoreListing(listing: ListingRow): {
  score: number;
  signals: string[];
  unknown: SignalResult["unknown"];
} {
  const read = readSignals(listing);
  const signals = [...read.labels];
  let score = read.points;

  // A printed name is notable, but it is NOT the same thing as a player-issue
  // shirt (that is `issue`), so it is labelled for what it is. "Unknown" is a
  // placeholder rather than a player, and produced a badge reading "Unknown
  // printing" before it was scrubbed.
  const printedName = cleanValue(listing.player_name);
  if (printedName) {
    score += 10;
    signals.push(`${printedName} printing`);
  }

  const vintage = vintagePoints(listing.season);
  if (vintage.points > 0 && vintage.decade !== null) {
    score += vintage.points;
    signals.push(`${vintage.decade}s`);
  }

  // Price contributes, but is capped so an expensive-but-plain shirt doesn't
  // always beat a genuinely rare one.
  score += Math.min(30, listing.price_cents / 5_000);

  return { score, signals, unknown: read.unknown };
}

export async function runGrailOfTheDay(
  config: GrailConfig = DEFAULT_GRAIL_CONFIG,
): Promise<RecipeResult> {
  const { data, error } = await kickio()
    .from("listings")
    .select(
      "id,title,price_cents,currency,team,season,shirt_type,condition,issue,signed," +
        "special_edition,boxed_edition,player_name,manufacturer,images,created_at," +
        "removed_at,removed_reason,consecutive_gone_count,reserved_until," +
        "last_stock_checked_at,is_partner_listing,seller_id,source_url,source," +
        "products!inner(status,deleted_at,slug)",
    )
    .eq("status", "active")
    .is("deleted_at", null)
    .gt("stock_quantity", 0)
    // Not withdrawn, and not already sold somewhere else.
    .is("removed_at", null)
    // The stock checker has not seen it disappear from its source.
    .eq("consecutive_gone_count", 0)
    // Only sellers whose listings appear on kickio.com.
    .in("seller_id", config.allowedSellerIds)
    // Scraped listings must be recently verified; Kickio Direct is exempt
    // because it has no external source to verify against.
    .or(
      `source.neq.scrape,last_stock_checked_at.gte.${new Date(
        Date.now() - config.maxStockCheckAgeDays * 86_400_000,
      ).toISOString()}`,
    )
    // Through Kickio's own product review, and not archived or rejected.
    .eq("products.status", "active")
    .is("products.deleted_at", null)
    .gte("price_cents", config.minPriceCents)
    .order("price_cents", { ascending: false })
    .limit(config.poolSize);

  if (error) return { ok: false, reason: `Kickio query failed: ${error.message}` };

  const listings = (data ?? []) as unknown as ListingRow[];
  const live = listings.filter((l) => isLive(l, config));
  // A listing whose only photography is WebP cannot be rendered onto a card, so
  // it is not a candidate - better no post than a post with an empty frame.
  const withPhotos = live.filter((l) => imageUrls(l.images).length > 0);
  if (withPhotos.length === 0) {
    const hadUnrenderableOnly = live.filter(
      (l) => allImageUrls(l.images).length > 0 && imageUrls(l.images).length === 0,
    ).length;
    return {
      ok: false,
      reason: "No eligible live listings with renderable photography",
      diagnostics: {
        fetched: listings.length,
        rejectedAsNotLive: listings.length - live.length,
        rejectedForUnrenderableImagesOnly: hadUnrenderableOnly,
      },
    };
  }

  // A product can carry several listings and kickio.com headlines the cheapest
  // ("lowest asking price"). Quoting a dearer one contradicts the page a reader
  // lands on, so keep only the cheapest listing per product.
  const cheapestPerProduct = new Map<string, ListingRow>();
  for (const listing of withPhotos) {
    const productKey = subjectRefFor(listing);
    const held = cheapestPerProduct.get(productKey);
    if (!held || listing.price_cents < held.price_cents) {
      cheapestPerProduct.set(productKey, listing);
    }
  }

  const scored = [...cheapestPerProduct.values()]
    .map((listing) => ({ listing, ...scoreListing(listing) }))
    .sort((a, b) => b.score - a.score);

  // Keyed on the product so the same shirt cannot return under another listing.
  const windows: HistoryWindows = {
    subjectDays: config.cooldownDays,
    comboDays: config.comboCooldownDays,
    teamDays: config.teamCooldownDays,
  };
  const history = await selectionHistory("grail_of_the_day", windows);
  const { eligible: ranked, blockedAsRepeat } = applyHistory(
    scored.map((entry) => ({
      ...entry,
      subjectRef: subjectRefFor(entry.listing),
      team: entry.listing.team,
      season: entry.listing.season,
      shirtType: entry.listing.shirt_type,
    })),
    history,
  );

  if (ranked.length === 0) {
    return {
      ok: false,
      reason:
        `All ${scored.length} candidates have been featured before or were ` +
        `rejected (rejections never return)`,
      diagnostics: {
        candidates: scored.length,
        blockedAsRepeat,
        subjectCooldownDays: config.cooldownDays,
      },
    };
  }

  const winner = ranked[0];
  const { listing, signals } = winner;

  // What a reader sees on kickio.com, not the seller's asking price.
  const fee = await buyerFeeSettings();
  const buyerCents = buyerPriceCents(listing.price_cents, fee);
  const currency = listing.currency || "GBP";
  const price = formatPrice(buyerCents, currency);

  const claims: Claim[] = [
    {
      statement: `Priced at ${price}`,
      value: buyerCents / 100,
      source: `listings.price_cents (id ${listing.id}) + buyer protection fee`,
      basis:
        `asking ${formatPrice(listing.price_cents, currency)} plus ` +
        `${fee.percentBps / 100}% + ${formatPrice(fee.fixedCents, currency)}, ` +
        `rounded ${fee.rounding} - this is the figure shown on kickio.com`,
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
    subjectRef: subjectRefFor(listing),
    headline: listing.title,
    sourceData: cleanFacts({
      listing_id: listing.id,
      title: listing.title,
      price,
      asking_price: formatPrice(listing.price_cents, currency),
      buyer_protection_fee_applied: fee.enabled,
      team: listing.team,
      season: listing.season,
      shirt_type: listing.shirt_type,
      condition: listing.condition,
      issue: listing.issue,
      signed: listing.signed,
      special_edition: listing.special_edition,
      player_name: listing.player_name,
      manufacturer: listing.manufacturer,
      // Two different things, deliberately named apart: where it lives on
      // Kickio, and where Kickio scraped it from.
      kickio_url: kickioUrl(listing.products?.slug ?? null),
      origin_url: listing.source_url,
      origin_source: listing.source,
      product_slug: listing.products?.slug ?? null,
      is_partner_listing: listing.is_partner_listing,
      seller_id: listing.seller_id,
      last_stock_checked_at: listing.last_stock_checked_at,
      rarity_signals: signals,
      rarity_score: Math.round(winner.score),
      // Attribute values the scorer did not recognise. Nothing was claimed
      // about them; they are listed so new vocabulary is noticed.
      unknown_attribute_values: winner.unknown,
      runners_up: ranked.slice(1, 4).map((r) => ({
        title: r.listing.title,
        score: Math.round(r.score),
      })),
    }) as Record<string, unknown>,
    claims,
    images: imageUrls(listing.images),
  };

  return { ok: true, candidate };
}
