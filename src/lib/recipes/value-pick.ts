/**
 * Value Pick - a listing priced well below what that exact shirt sells for.
 *
 * The strongest claim any recipe here makes, so it carries the most guards.
 * Three came straight out of auditing the candidates before writing a line.
 *
 * 1. THE LAST SALE IS NOT THE PRICE
 *
 * A 1990-91 England XL looked 41% below its last sale of £325.99. The only
 * other recorded sale of that exact shirt was £190.99 - against which the
 * listing is barely a discount at all. Anchoring on the most recent sale picks
 * whichever number flatters the post. So the comparison is the MEDIAN of
 * matching sales, and a spread wider than the discount being claimed refuses
 * the post outright: if the shirt trades anywhere between £191 and £326, "38%
 * below" is not a fact about this listing, it is a fact about which sale you
 * chose to stand next to.
 *
 * 2. "A ONE-OFF" IS USUALLY FALSE
 *
 * The 1988-90 Netherlands L in Very Good has two live listings at the same
 * price, and that product has five across variants. Scarcity is counted from
 * the live listings and graded, and where nothing can be claimed the post says
 * nothing rather than reaching.
 *
 * 3. COMPARE WHAT A BUYER PAYS
 *
 * The listing price excludes buyer protection. Comparing it to a sale price
 * overstates every discount by about 4% - small, systematic, and in the
 * direction that flatters us, which is the worst kind.
 *
 * WHAT IT CANNOT SAY
 *
 * Why the seller priced it there. The data supports "this is well below what
 * the same shirt has sold for, here is the working"; it does not support "they
 * want a quick sale" or "it is underpriced by mistake". A shirt can also be
 * cheap because something is wrong with it that no column records - which is
 * what the human approval step is for.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeResult } from "../engine/types.ts";
import { recentlyFeatured } from "./cooldown.ts";
import { buyerFeeSettings, buyerPriceCents, formatPrice } from "../kickio/pricing.ts";
import { imageUrls, kickioUrl, readSignals, KICKIO_DIRECT_SELLER, APPROVED_PARTNER_SELLER } from "./grail-of-the-day.ts";
import { median } from "./collection-index.ts";
import { pageAll, pageIn } from "../kickio/page.ts";
import { salesAccess } from "./sales-access.ts";

export const VALUE_PICK_KEY = "value_pick";

export interface ListingRow {
  id: string;
  product_id: string | null;
  seller_id: string | null;
  price_cents: number | null;
  currency: string | null;
  size: string | null;
  condition: string | null;
  images: unknown;
  issue: string | null;
  signed: string | null;
  special_edition: string | null;
  boxed_edition: string | null;
  sleeves: string | null;
}

export interface SaleRow {
  product_id: string | null;
  listing_id: string | null;
  price_cents: number | null;
  size: string | null;
  condition: string | null;
  sold_at: string;
}

export interface ProductRow {
  id: string;
  slug: string | null;
  name: string | null;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  manufacturer: string | null;
  player_name: string | null;
  status: string | null;
  deleted_at: string | null;
  primary_image_url: string | null;
  images: unknown;
}

export interface ValuePickConfig {
  /** How far below the median matching sale a listing must be. */
  minDiscountPct: number;
  /** Fewest matching sales. One sale is an anecdote, not a price. */
  minSales: number;
  /** Ignore sales older than this - the market moves. */
  maxSaleAgeDays: number;
  /**
   * Refuse when the spread between matching sales, as a share of the median,
   * exceeds the discount being claimed. See the England example above.
   */
  maxSpreadRatio: number;
  /** Sellers whose listings may be featured. */
  allowedSellerIds: string[];
  cooldownDays: number;
}

export const DEFAULT_VALUE_PICK_CONFIG: ValuePickConfig = {
  minDiscountPct: 20,
  minSales: 2,
  maxSaleAgeDays: 180,
  maxSpreadRatio: 1,
  allowedSellerIds: [KICKIO_DIRECT_SELLER, APPROVED_PARTNER_SELLER],
  cooldownDays: 90,
};

/**
 * Sizes the match is allowed to use.
 *
 * An allowlist because `listings.size` also holds "Default Title", "M, L",
 * "Not specified" and "N/A". Matching a sale to "M, L" would compare a shirt
 * to a different shirt, and the whole post rests on the two being identical.
 */
const SIZES = new Set(["XS", "S", "M", "L", "XL", "XXL", "3XL"]);

export function normaliseSize(value: string | null): string | null {
  const size = (value ?? "").trim().toUpperCase();
  return SIZES.has(size) ? size : null;
}

export function normaliseCondition(value: string | null): string | null {
  const condition = (value ?? "").trim();
  return condition ? condition.toLowerCase() : null;
}

/** Identical shirt: same product, same size, same condition. */
export function variantKey(productId: string, size: string, condition: string): string {
  return `${productId}|${size}|${condition}`;
}

export interface Comparison {
  /** The price this variant actually trades at. */
  medianCents: number;
  sales: number;
  lowestCents: number;
  highestCents: number;
  lastSoldAt: string;
  /** (highest - lowest) / median, as a percentage. */
  spreadPct: number;
}

export function compare(sales: SaleRow[], config: ValuePickConfig, now = new Date()): Comparison | null {
  const cutoff = now.getTime() - config.maxSaleAgeDays * 86_400_000;
  const fresh = sales
    .filter((s) => Number.isFinite(s.price_cents) && (s.price_cents ?? 0) > 0)
    .filter((s) => new Date(s.sold_at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime());

  if (fresh.length === 0) return null;
  const prices = fresh.map((s) => s.price_cents as number);
  const mid = median(prices);
  if (mid === null || mid <= 0) return null;

  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  return {
    medianCents: mid,
    sales: fresh.length,
    lowestCents: lowest,
    highestCents: highest,
    lastSoldAt: fresh[0].sold_at,
    spreadPct: Math.round(((highest - lowest) / mid) * 1000) / 10,
  };
}

/** How far below the median a buyer's price sits, as a whole percent. */
export function discountPct(buyerCents: number, medianCents: number): number {
  if (medianCents <= 0) return 0;
  return Math.round((1 - buyerCents / medianCents) * 100);
}

export type Scarcity = "only-on-kickio" | "only-this-variant" | "several";

/**
 * Grade the one-off claim instead of asserting it.
 *
 * `sameVariant` and `sameProduct` are counts of LIVE listings including this
 * one, so the honest floor is 1.
 */
export function scarcityOf(sameVariant: number, sameProduct: number): Scarcity {
  if (sameProduct <= 1) return "only-on-kickio";
  if (sameVariant <= 1) return "only-this-variant";
  return "several";
}

export function scarcityLine(scarcity: Scarcity, size: string, condition: string): string | null {
  if (scarcity === "only-on-kickio") return "The only one on Kickio.";
  if (scarcity === "only-this-variant") {
    return `The only one on Kickio in ${size}, ${condition}.`;
  }
  // Several are listed. Say nothing rather than reach for a claim.
  return null;
}

export interface PickVerdict {
  ok: boolean;
  reason?: string;
}

export function qualifies(
  comparison: Comparison,
  discount: number,
  config: ValuePickConfig,
): PickVerdict {
  if (comparison.sales < config.minSales) {
    return {
      ok: false,
      reason: `only ${comparison.sales} recorded sale of that exact shirt (need ${config.minSales})`,
    };
  }
  if (discount < config.minDiscountPct) {
    return { ok: false, reason: `${discount}% below the median, under the ${config.minDiscountPct}% bar` };
  }
  // The England guard: a shirt trading between £191 and £326 is not "38% below"
  // anything - that is a fact about which sale you stood next to.
  if (comparison.spreadPct > discount * config.maxSpreadRatio) {
    return {
      ok: false,
      reason:
        `recorded sales range ${formatPrice(comparison.lowestCents)}-${formatPrice(comparison.highestCents)}, ` +
        `a ${comparison.spreadPct}% spread against a ${discount}% discount - too wide to call it a price`,
    };
  }
  return { ok: true };
}

export function subjectRefFor(productId: string, size: string, condition: string): string {
  return `value:${variantKey(productId, size, condition)}`;
}

export async function runValuePick(
  config: ValuePickConfig = DEFAULT_VALUE_PICK_CONFIG,
): Promise<RecipeResult> {
  // Paged, not `.limit(5000)`. PostgREST caps a response at 1,000 rows and
  // says nothing about it, so the unpaged version saw 1,000 of 1,649 live
  // listings - and the scarcity counts below are only true if every live
  // listing is in front of us. See lib/kickio/page.ts.
  const live = await pageAll<ListingRow>("Loading live listings", (from, to) =>
    kickio()
      .from("listings")
      .select(
        "id,product_id,seller_id,price_cents,currency,size,condition,images," +
          "issue,signed,special_edition,boxed_edition,sleeves",
      )
      .eq("status", "active")
      .is("deleted_at", null)
      .is("removed_at", null)
      .gt("stock_quantity", 0)
      .eq("consecutive_gone_count", 0)
      .gt("price_cents", 0)
      .order("id", { ascending: true })
      .range(from, to),
  );

  // Scarcity is counted across EVERY live listing, before the seller filter -
  // another seller's copy still means this one is not the only one.
  const perVariant = new Map<string, number>();
  const perProduct = new Map<string, number>();
  for (const l of live) {
    if (!l.product_id) continue;
    perProduct.set(l.product_id, (perProduct.get(l.product_id) ?? 0) + 1);
    const size = normaliseSize(l.size);
    const condition = normaliseCondition(l.condition);
    if (!size || !condition) continue;
    const key = variantKey(l.product_id, size, condition);
    perVariant.set(key, (perVariant.get(key) ?? 0) + 1);
  }

  const candidates = live.filter(
    (l) =>
      l.product_id &&
      normaliseSize(l.size) &&
      normaliseCondition(l.condition) &&
      (config.allowedSellerIds.length === 0 ||
        (l.seller_id && config.allowedSellerIds.includes(l.seller_id))),
  );

  if (candidates.length === 0) {
    return { ok: false, reason: "No live listing has a usable size and condition", diagnostics: { live: live.length } };
  }

  const productIds = [...new Set(candidates.map((l) => l.product_id as string))];

  // Chunked, not one `.in()`. 1,171 product ids is 29KB of query string and
  // the gateway answers 400 - which is what "nothing to post" turned out to
  // mean the first time this ran. Each chunk is paged for the same reason the
  // listings read is.
  //
  // The scoped role's policy already limits this to approved, non-excluded,
  // non-dismissed rows, so there is no second filter here to forget.
  const saleRows = await pageIn<SaleRow, string>(
    "Loading matching sales",
    productIds,
    (batch, from, to) =>
      kickio()
        .from("sales_history")
        .select("product_id,listing_id,price_cents,size,condition,sold_at")
        .in("product_id", batch)
        .order("id", { ascending: true })
        .range(from, to),
  );

  // Zero sales across 1,426 live listings is not a quiet market - it is an
  // unreadable table. Checked before any comparison, so the run can never
  // report "nothing is far enough below" when it never saw a price at all.
  const access = salesAccess(candidates.length, saleRows.length);
  if (access.blind) {
    return {
      ok: false,
      reason: access.reason,
      diagnostics: { considered: candidates.length, sale_rows: 0 },
    };
  }

  const salesByVariant = new Map<string, SaleRow[]>();
  for (const row of saleRows) {
    const size = normaliseSize(row.size);
    const condition = normaliseCondition(row.condition);
    if (!row.product_id || !size || !condition) continue;
    const key = variantKey(row.product_id, size, condition);
    const list = salesByVariant.get(key) ?? [];
    list.push(row);
    salesByVariant.set(key, list);
  }

  const fee = await buyerFeeSettings();
  const seen = await recentlyFeatured(VALUE_PICK_KEY, config.cooldownDays);
  const rejected: Array<{ key: string; reason: string }> = [];

  interface Pick {
    listing: ListingRow;
    key: string;
    size: string;
    condition: string;
    comparison: Comparison;
    discount: number;
    buyerCents: number;
    scarcity: Scarcity;
  }
  let winner: Pick | null = null;

  for (const listing of candidates) {
    const size = normaliseSize(listing.size)!;
    const condition = normaliseCondition(listing.condition)!;
    const key = variantKey(listing.product_id!, size, condition);
    if (seen.has(subjectRefFor(listing.product_id!, size, condition))) continue;

    const comparison = compare(salesByVariant.get(key) ?? [], config);
    if (!comparison) continue;

    const buyerCents = buyerPriceCents(listing.price_cents!, fee);
    const discount = discountPct(buyerCents, comparison.medianCents);
    const verdict = qualifies(comparison, discount, config);
    if (!verdict.ok) {
      if (discount >= config.minDiscountPct) rejected.push({ key, reason: verdict.reason! });
      continue;
    }

    if (!winner || discount > winner.discount) {
      winner = {
        listing,
        key,
        size,
        condition,
        comparison,
        discount,
        buyerCents,
        scarcity: scarcityOf(perVariant.get(key) ?? 1, perProduct.get(listing.product_id!) ?? 1),
      };
    }
  }

  if (!winner) {
    return {
      ok: false,
      reason: "No live listing is far enough below what that exact shirt sells for",
      diagnostics: { considered: candidates.length, rejected: rejected.slice(0, 10) },
    };
  }

  const { data: productData, error: productError } = await kickio()
    .from("products")
    .select("id,slug,name,team,season,shirt_type,manufacturer,player_name,status,deleted_at,primary_image_url,images")
    .eq("id", winner.listing.product_id!)
    .maybeSingle();

  if (productError) return { ok: false, reason: `Kickio query failed: ${productError.message}` };
  const product = productData as unknown as ProductRow | null;
  if (!product || product.deleted_at !== null || product.status !== "active" || !product.slug) {
    return { ok: false, reason: "The product behind that listing is not live on Kickio" };
  }

  const photos = [
    ...imageUrls([product.primary_image_url]),
    ...imageUrls(product.images),
    ...imageUrls(winner.listing.images),
  ];
  if (photos.length === 0) {
    return { ok: false, reason: "No photo the card can use for that shirt" };
  }

  const currency = winner.listing.currency ?? "GBP";
  const price = formatPrice(winner.buyerCents, currency);
  const typical = formatPrice(winner.comparison.medianCents, currency);
  const signals = readSignals({
    issue: winner.listing.issue,
    signed: winner.listing.signed,
    special_edition: winner.listing.special_edition,
    boxed_edition: winner.listing.boxed_edition,
    sleeves: winner.listing.sleeves,
  } as Parameters<typeof readSignals>[0]);

  const claims: Claim[] = [
    {
      statement: `${price} against ${typical}, ${winner.discount}% below`,
      value: winner.discount,
      source: "listing price with buyer protection, against the median of matching recorded sales",
      basis:
        `${winner.comparison.sales} sales of the same product in the same size and condition ` +
        `(${winner.condition}, ${winner.size}) within ${config.maxSaleAgeDays} days, ranging ` +
        `${formatPrice(winner.comparison.lowestCents, currency)} to ` +
        `${formatPrice(winner.comparison.highestCents, currency)}. The median is used, not the ` +
        "most recent sale, so the comparison cannot be anchored on whichever price flatters it.",
    },
    {
      statement: `Last sold ${winner.comparison.lastSoldAt.slice(0, 10)}`,
      value: winner.comparison.lastSoldAt.slice(0, 10),
      source: "most recent matching sale",
    },
  ];
  const scarcity = scarcityLine(winner.scarcity, winner.size, winner.condition);
  if (scarcity) {
    claims.push({
      statement: scarcity,
      value: winner.scarcity,
      source: "count of live listings for this product, and for this size and condition",
      basis: "Counted across every seller, not only the one being featured",
    });
  }

  return {
    ok: true,
    candidate: {
      subjectRef: subjectRefFor(winner.listing.product_id!, winner.size, winner.condition),
      headline: `${product.name ?? "Value Pick"} — ${price}, ${winner.discount}% below`,
      sourceData: {
        subject: product.name,
        title: product.name,
        price,
        typical_price: typical,
        discount_pct: winner.discount,
        size: winner.size,
        condition: winner.listing.condition,
        sales_count: winner.comparison.sales,
        sales_low: formatPrice(winner.comparison.lowestCents, currency),
        sales_high: formatPrice(winner.comparison.highestCents, currency),
        last_sold: winner.comparison.lastSoldAt.slice(0, 10),
        scarcity: winner.scarcity,
        scarcity_line: scarcity,
        team: product.team,
        season: product.season,
        shirt_type: product.shirt_type,
        manufacturer: product.manufacturer,
        player_name: product.player_name,
        rarity_signals: signals.labels,
        kickio_url: kickioUrl(product.slug),
        scope_note:
          "Priced against recorded sales of the same shirt in the same size and condition. " +
          "Why the seller chose that price is not in the data and must not be guessed at.",
      },
      claims,
      images: photos,
    },
  };
}

export const VALUE_PICK_BRIEF = `**Value Pick** - a shirt listed well below what that exact shirt sells for.

Lead with the gap: what a buyer pays, what the same shirt in the same size and
condition has been selling for, and how many sales that is based on. The
working IS the post - a collector who can see the comparison will believe it,
and one who is only told "bargain" will not.

Use \`scarcity_line\` exactly as given, or not at all. It is already checked
against every live listing; do not upgrade "the only one this size" into "the
only one", and do not add a scarcity claim where the field is empty.

Four hard rules:
- Never guess WHY it is priced there. Not "the seller wants a quick sale", not
  "underpriced", not "they may not know what they have". The data says what it
  is priced at and what the shirt sells for. Nothing about motive is knowable.
- \`price\` includes buyer protection - it is what someone actually pays. Quote
  it as given. Do not present \`typical_price\` as a former price of THIS shirt;
  it is the median of other sales.
- No urgency you cannot evidence. "Won't last" and "going fast" are inventions
  unless a claim says so.
- Include \`kickio_url\` in the post text.`;
