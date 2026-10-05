/**
 * Dropzone - the six dearest shirts listed on Kickio yesterday.
 *
 * The companion to Yesterday's Sales Highlights, and its opposite in the one
 * way that matters: that post is about the market and must never claim the
 * shirts sold on Kickio, because `sales_history` is aggregated from across the
 * hobby. This one reads `listings`, which IS Kickio's own table. These shirts
 * genuinely went up on Kickio yesterday and genuinely can be bought now, so the
 * copy may say so plainly and the whole post is a promotion.
 *
 * LISTED YESTERDAY, LIVE TODAY. Both halves are required and they are different
 * questions. `created_at` inside yesterday is what makes it new; everything in
 * `isLive` is what stops the post sending somebody to a shirt that has already
 * gone. A listing can be created on Monday and sold, withdrawn, deleted or run
 * out of stock by Tuesday morning, and a promotion pointing at it is worse than
 * no post: it is an advert for a dead page. The rules are the same ones Kickio
 * Drops applies to a listing an admin picked by hand.
 *
 * THE PRICE IS THE BUYER'S PRICE. `listings.price_cents` is what the seller
 * gets. A card promoting a shirt at a number nobody can actually buy it for is
 * a complaint waiting to happen, so the buyer fee is applied exactly as the
 * Drops recipe applies it.
 *
 * WHAT I COULD NOT MEASURE. The sales post was built against a measured count
 * of photo-backed sales per day, which is how its six-shirt floor was known to
 * be reachable on 13 days in 15. The database was not reachable when this was
 * written, so there is no equivalent figure for how many listings Kickio gains
 * in a day. If Dropzone turns out to skip most mornings, the fix is one of two
 * one-line changes - widen `windowDays` to 2, or drop `featureCount` to 4 and
 * take the grid with it - and the skip reason on /runs carries the count needed
 * to decide which.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { buyerFeeSettings, buyerPriceCents, formatPrice } from "../kickio/pricing.ts";
import { cleanValue } from "../kickio/values.ts";
import { pageIn } from "../kickio/page.ts";
import { imageUrls, kickioUrl } from "./grail-of-the-day.ts";
import { kitLabel } from "./most-wanted.ts";
import { previousDay, detailLine, type DayWindow } from "./yesterday-sales.ts";

export const DROPZONE_KEY = "dropzone";

export interface DropzoneConfig {
  /** The grid is 3x2. The form of the post, not a threshold to tune. */
  featureCount: number;
  /** How many days back the window reaches. One, as asked: yesterday. */
  windowDays: number;
  /** Below this a "drop" is not worth promoting. */
  minPriceCents: number;
}

export const DEFAULT_DROPZONE_CONFIG: DropzoneConfig = {
  featureCount: 6,
  windowDays: 1,
  // Deliberately low. The post is "the dearest six that arrived", and on a quiet
  // day the sixth will not be dear. A floor that empties the grid defeats the
  // post; one that admits a £15 shirt only costs it the bottom-right tile.
  minPriceCents: 1_500,
};

interface ListingRow {
  id: string;
  product_id: string | null;
  created_at: string;
  title: string | null;
  size: string | null;
  condition: string | null;
  price_cents: number | null;
  currency: string | null;
  images: unknown;
  status: string | null;
  deleted_at: string | null;
  removed_at: string | null;
  stock_quantity: number | null;
  consecutive_gone_count: number | null;
}

const LISTING_COLUMNS =
  "id,product_id,created_at,title,size,condition,price_cents,currency,images," +
  "status,deleted_at,removed_at,stock_quantity,consecutive_gone_count";

/**
 * Could a reader buy this in a minute's time?
 *
 * Every clause is a way a listing can look live in the database and be gone in
 * practice. An allowlist on `status` rather than a blocklist, for the reason
 * every other allowlist in this engine exists: the next odd value somebody adds
 * to that column should be refused by default, not promoted by default.
 */
export function isLive(listing: ListingRow): boolean {
  if (listing.deleted_at !== null) return false;
  if ((listing.status ?? "").trim().toLowerCase() !== "active") return false;
  if (listing.removed_at !== null) return false;
  if ((listing.stock_quantity ?? 0) <= 0) return false;
  // The stock checker could not find it at its source last time it looked.
  if ((listing.consecutive_gone_count ?? 0) > 0) return false;
  if (!listing.price_cents || listing.price_cents <= 0) return false;
  // No product means no page to send anyone to, and the post is a link.
  if (!listing.product_id) return false;
  return true;
}

export interface DropShirt {
  listingId: string;
  productId: string;
  title: string;
  team: string | null;
  season: string | null;
  kit: string;
  price: string;
  priceCents: number;
  condition: string | null;
  size: string | null;
  productUrl: string | null;
  imageUrl: string;
}

/**
 * One tile per PRODUCT, dearest first.
 *
 * A seller listing three of the same shirt in one evening is normal and would
 * otherwise take three tiles at three prices, which reads as a rendering fault
 * rather than as stock. Expects the listings ordered by price descending, so
 * the first one kept for a product is its dearest.
 */
export function onePerProduct<T extends { product_id: string | null }>(listings: T[]): T[] {
  const seen = new Set<string>();
  return listings.filter((l) => {
    if (!l.product_id || seen.has(l.product_id)) return false;
    seen.add(l.product_id);
    return true;
  });
}

export async function runDropzone(
  config: DropzoneConfig = DEFAULT_DROPZONE_CONFIG,
  now: Date = new Date(),
): Promise<RecipeResult> {
  const day: DayWindow = previousDay(now);
  const start =
    config.windowDays > 1
      ? new Date(Date.parse(day.start) - (config.windowDays - 1) * 86_400_000).toISOString()
      : day.start;

  const { data, error } = await kickio()
    .from("listings")
    .select(LISTING_COLUMNS)
    .gte("created_at", start)
    .lt("created_at", day.end)
    .is("deleted_at", null)
    .is("removed_at", null)
    .eq("status", "active")
    .gte("price_cents", config.minPriceCents)
    .order("price_cents", { ascending: false })
    .limit(200);

  if (error) return { ok: false, reason: `Kickio query failed: ${error.message}` };

  const all = (data ?? []) as unknown as ListingRow[];
  // Filtered in code as well as in the query: the query narrows what crosses
  // the wire, and this is what makes it a rule. Stock and the gone-counter
  // cannot be expressed as cleanly in PostgREST, and they are the two that
  // change between a listing being created and this post going out.
  const live = all.filter(isLive);

  if (live.length === 0) {
    return {
      ok: false,
      reason:
        `Nothing was listed on ${day.label} at ${formatPrice(config.minPriceCents)} or more ` +
        `that is still live this morning`,
      diagnostics: { day: day.key, rowsReturned: all.length, stillLive: 0 },
    };
  }

  const deduped = onePerProduct(live);
  const productIds = [...new Set(deduped.map((l) => l.product_id!))];

  const products = await pageIn<
    {
      id: string;
      slug: string | null;
      name: string | null;
      team: string | null;
      season: string | null;
      shirt_type: string | null;
      primary_image_url: string | null;
    },
    string
  >("Loading Dropzone products", productIds, (batch, from, to) =>
    kickio()
      .from("products")
      .select("id,slug,name,team,season,shirt_type,primary_image_url")
      .in("id", batch)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const productFor = new Map(products.map((p) => [p.id, p]));

  const fee = await buyerFeeSettings();

  // Only listings whose product has a photograph, because the grid reads
  // `images` by index: a gap would slide every picture onto the next shirt and
  // print a real price under the wrong one.
  const featured: DropShirt[] = [];
  for (const listing of deduped) {
    if (featured.length >= config.featureCount) break;
    const product = productFor.get(listing.product_id!);
    if (!product) continue;
    const photo = imageUrls([product.primary_image_url])[0];
    if (!photo) continue;

    featured.push({
      listingId: listing.id,
      productId: product.id,
      title:
        product.name?.trim() ||
        listing.title?.trim() ||
        [product.season, product.team, product.shirt_type].filter(Boolean).join(" "),
      team: product.team,
      season: product.season,
      kit: kitLabel(product.shirt_type),
      price: formatPrice(
        buyerPriceCents(listing.price_cents!, fee),
        listing.currency ?? "GBP",
      ),
      priceCents: buyerPriceCents(listing.price_cents!, fee),
      condition: cleanValue(listing.condition),
      size: cleanValue(listing.size),
      productUrl: kickioUrl(product.slug),
      imageUrl: photo,
    });
  }

  if (featured.length < config.featureCount) {
    return {
      ok: false,
      reason:
        `Only ${featured.length} of ${live.length} shirts listed on ${day.label} have a ` +
        `photograph and are still live (need ${config.featureCount} to fill the grid). ` +
        `A short row reads as a broken card.`,
      diagnostics: {
        day: day.key,
        rowsReturned: all.length,
        stillLive: live.length,
        distinctProducts: deduped.length,
        withPhoto: featured.length,
      },
    };
  }

  const dearest = featured[0]!;

  const claims: Claim[] = [
    {
      statement: `${live.length} shirts listed on Kickio on ${day.label} are still on sale`,
      value: live.length,
      source: "listings.created_at within the day, filtered to live",
      basis:
        "Kickio's own listings table, not market data. Active, not deleted or withdrawn, " +
        "in stock, and found at source by the stock checker.",
    },
    {
      statement: `The dearest of the six shown is ${dearest.price}`,
      value: dearest.priceCents / 100,
      source: `listings.price_cents (listing ${dearest.listingId}) plus the buyer fee`,
      basis:
        "The price a buyer pays, not the seller's figure. The dearest of yesterday's " +
        "arrivals THAT HAS A PHOTOGRAPH, so not necessarily the dearest overall.",
    },
  ];

  return {
    ok: true,
    candidate: {
      subjectRef: day.key,
      headline: `Dropzone: ${day.label}, ${featured.length} new in from ${dearest.price}`,
      sourceData: {
        day: day.key,
        day_label: day.label,
        featured: featured.map((shirt) => ({
          title: shirt.title,
          team: shirt.team,
          season: shirt.season,
          kit: shirt.kit,
          price: shirt.price,
          condition: shirt.condition,
          size: shirt.size,
          detail: detailLine(shirt.condition, shirt.size),
          kickio_url: shirt.productUrl,
        })),
        listed_that_day: live.length,
        shown: featured.length,
        // The one line the copy should build its call to action around, and the
        // one claim this post may make that the sales post may not.
        on_kickio: true,
        top_url: dearest.productUrl,
        // The three strings that make `sales_grid_card` this post rather than
        // the sales one. Same grid, opposite direction: that card asks you to
        // list a shirt, this one asks you to buy one.
        card_label: "DROPZONE",
        card_title: "Just landed on Kickio",
        card_footer: "Shop all six at kickio.com",
      },
      claims,
      images: featured.map((shirt) => shirt.imageUrl),
    },
  };
}

export const DROPZONE_BRIEF = `**Dropzone** - the six dearest shirts listed on Kickio yesterday.

New in, still available, and the post exists to shift them. This is the most
openly promotional post in the set and it is allowed to be.

STRUCTURE

1. Lead with the best of them. Name the shirt, the price, and what makes it
   worth stopping for: the club, the season, the kit, the condition.
2. A line on the rest. A pattern beats a list - a run of nineties away shirts,
   three Italian clubs, two in the same size.
3. Send them to Kickio. \`top_url\` is the page for the shirt you led with and
   each entry in \`featured\` carries its own \`kickio_url\`. On a platform that
   allows one link, use \`top_url\`.

THIS ONE IS OURS, AND YOU MAY SAY SO

Unlike the sales posts, these are Kickio's own listings. "New on Kickio",
"listed yesterday", "available now" and "on Kickio today" are all true and all
correct. Say it plainly.

What you still may not do is claim they will go. No "won't last", no "going
fast", no "before someone else does". Nothing in the data says how quickly a
shirt sells, and urgency nobody can stand behind is the fastest way to stop
being believed.

THE SIX ARE THE SIX WE CAN SHOW

A listing with no photograph cannot go on the card, so never write "the six
most expensive shirts listed yesterday" or "the day's top arrivals". "Six of
yesterday's arrivals" and "among what came in yesterday" are right.

Never count anything beyond the six on the card. No "47 listed yesterday", no
totals, no comparison with the day before.

PRICES, CONDITION AND SIZE

\`price\` is what a buyer pays, fee included, and it is the only price you may
use. Condition and size are on the card where the listing gave them; mention
them where they make a point - a mint shirt, a hard-to-find size - rather than
reading the grid back.

VOICE

Warm and direct. It is a shop window, not an auction house. No exclamation
marks, no manufactured scarcity, and no adjectives the shirt has not earned.

Close on the link and kickio.com.`;
