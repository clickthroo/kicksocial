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
 * THE WINDOW WIDENS, AND THE MEASUREMENT IS WHY.
 *
 * This was built as "yesterday" and measured afterwards. Over the 14 days to
 * 2026-10-05, listings created per day that are still live, photo-backed and
 * distinct ran: 4, 2, 2, 70, 9, 0, 1, 1 - and the other six days had no new
 * listings at all. One of those figures (the 70) is a bulk import of 623 rows
 * rather than a day's trading. So a strictly-yesterday Dropzone could fill a
 * six-tile grid on two mornings out of fourteen and would skip the other
 * twelve.
 *
 * So the window starts at yesterday and reaches further back, a day at a time,
 * until it finds six. On a day when six arrived it is exactly the post that was
 * asked for; on the other six mornings in seven it is a post rather than
 * silence. The card says which it was: "New in yesterday" or "New in over the
 * last five days".
 *
 * A WIDENING WINDOW REPEATS ITSELF UNLESS SOMETHING STOPS IT. With a five-day
 * reach, Monday and Tuesday see almost the same five days and would show almost
 * the same six shirts. So the recipe reads its own back catalogue and refuses a
 * shirt it has already featured. That makes the skip meaningful too: no post
 * means nothing new has arrived since the last one, which is the truth and is
 * better said by silence than by yesterday's shirts again.
 */
import { kickio } from "../kickio/client.ts";
import { engine } from "../engine/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { buyerFeeSettings, buyerPriceCents, formatPrice } from "../kickio/pricing.ts";
import { cleanValue } from "../kickio/values.ts";
import { pageAll, pageIn } from "../kickio/page.ts";
import { imageUrls, kickioUrl } from "./grail-of-the-day.ts";
import { kitLabel } from "./most-wanted.ts";
import { previousDay, detailLine, type DayWindow } from "./yesterday-sales.ts";

export const DROPZONE_KEY = "dropzone";

export interface DropzoneConfig {
  /** The grid is 3x2. The form of the post, not a threshold to tune. */
  featureCount: number;
  /** Where the window starts: yesterday, as asked. */
  windowDays: number;
  /**
   * How far back it may reach when a day is thin.
   *
   * Two weeks. Past that "just landed" stops being true, and a post promoting a
   * shirt as new that has been sitting there a month is the kind of small lie
   * that costs more than the post is worth.
   */
  maxWindowDays: number;
  /** Below this a "drop" is not worth promoting. */
  minPriceCents: number;
  /** How long a shirt stays out of Dropzone after it has been in one. */
  cooldownDays: number;
}

export const DEFAULT_DROPZONE_CONFIG: DropzoneConfig = {
  featureCount: 6,
  windowDays: 1,
  maxWindowDays: 14,
  // Deliberately low. The post is "the dearest six that arrived", and on a quiet
  // day the sixth will not be dear. A floor that empties the grid defeats the
  // post; one that admits a £15 shirt only costs it the bottom-right tile.
  minPriceCents: 1_500,
  // Comfortably longer than the widest window, so a shirt cannot come back
  // round while it is still inside the reach of the next post.
  cooldownDays: 30,
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

/**
 * How the card describes the stretch it covered.
 *
 * Said in the post rather than left implied, because "just landed" over five
 * days and "just landed" over one are different claims and a reader who checks
 * will find out which. Exported for its own test: it is the one place the post
 * tells the truth about its own window.
 */
export function windowLabel(days: number): string {
  if (days <= 1) return "New in yesterday";
  if (days === 2) return "New in over the last two days";
  return `New in over the last ${days} days`;
}

/**
 * Shirts Dropzone has already promoted, read off its own back catalogue.
 *
 * Without this the widening window repeats itself: a five-day reach means
 * Monday and Tuesday see almost the same five days of listings and would show
 * almost the same six shirts. Reading the drafts rather than keeping a separate
 * table means the memory cannot drift from what actually went out.
 *
 * `subject_ref` is the set rather than one product, so the ids are read out of
 * `source_data.featured` where the recipe put them.
 */
export async function recentlyShown(days: number): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await engine()
    .from("post_drafts")
    .select("source_data")
    .eq("recipe_key", DROPZONE_KEY)
    .gte("created_at", since);

  if (error) throw new Error(`Dropzone history lookup failed: ${error.message}`);

  const seen = new Set<string>();
  for (const row of (data ?? []) as Array<{ source_data: Record<string, unknown> | null }>) {
    const featured = row.source_data?.featured;
    if (!Array.isArray(featured)) continue;
    for (const entry of featured) {
      const id = (entry as { product_id?: unknown })?.product_id;
      if (typeof id === "string") seen.add(id);
    }
  }
  return seen;
}

/**
 * The narrowest window back from yesterday that holds enough shirts.
 *
 * Narrowest rather than widest, because the post is about what is new: given a
 * day that produced six on its own, reaching back a fortnight would bury them
 * under a backlog. Returns the day count, or null when even the widest reach
 * cannot fill the grid - which is the honest "nothing new" case.
 *
 * Pure, and separated from the query, because this is the rule the whole
 * redesign turns on and it deserves a test rather than a network call.
 */
export function narrowestWindow<T extends { created_at: string }>(
  candidates: readonly T[],
  endMs: number,
  want: number,
  minDays: number,
  maxDays: number,
): number | null {
  for (let days = Math.max(1, minDays); days <= maxDays; days++) {
    const from = endMs - days * 86_400_000;
    const inside = candidates.filter((c) => Date.parse(c.created_at) >= from).length;
    if (inside >= want) return days;
  }
  return null;
}

export async function runDropzone(
  config: DropzoneConfig = DEFAULT_DROPZONE_CONFIG,
  now: Date = new Date(),
): Promise<RecipeResult> {
  const day: DayWindow = previousDay(now);
  const endMs = Date.parse(day.end);
  const widest = new Date(endMs - config.maxWindowDays * 86_400_000).toISOString();

  // The widest reach is read once and narrowed in code. Paged rather than
  // limited: one bulk import put 623 listings on a single day, and a `limit`
  // over a fortnight would silently drop the cheap end of it, which is exactly
  // the part that decides whether a narrow window is full enough.
  const all = await pageAll<ListingRow>("Loading Dropzone listings", (from, to) =>
    kickio()
      .from("listings")
      .select(LISTING_COLUMNS)
      .gte("created_at", widest)
      .lt("created_at", day.end)
      .is("deleted_at", null)
      .is("removed_at", null)
      .eq("status", "active")
      .gte("price_cents", config.minPriceCents)
      .order("id", { ascending: true })
      .range(from, to),
  );

  // Filtered in code as well as in the query: the query narrows what crosses
  // the wire, and this is what makes it a rule. Stock and the gone-counter are
  // the two that change between a listing being created and this post going
  // out, and they are the two that cannot be expressed as cleanly in PostgREST.
  const live = all.filter(isLive);

  if (live.length === 0) {
    return {
      ok: false,
      reason:
        `Nothing listed in the ${config.maxWindowDays} days to ${day.label} at ` +
        `${formatPrice(config.minPriceCents)} or more is still live`,
      diagnostics: { day: day.key, rowsReturned: all.length, stillLive: 0 },
    };
  }

  const productIds = [...new Set(live.map((l) => l.product_id!))];

  const [products, shown] = await Promise.all([
    pageIn<
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
    ),
    recentlyShown(config.cooldownDays),
  ]);

  const productFor = new Map(products.map((p) => [p.id, p]));

  // Everything that could go on a card: live, photo-backed, one per product,
  // and not already promoted. Dearest first, so the window search below counts
  // the ones that would actually be shown.
  const seenProduct = new Set<string>();
  const candidates = live
    .slice()
    .sort((a, b) => (b.price_cents ?? 0) - (a.price_cents ?? 0))
    .filter((listing) => {
      const id = listing.product_id!;
      if (seenProduct.has(id) || shown.has(id)) return false;
      const product = productFor.get(id);
      if (!product || imageUrls([product.primary_image_url]).length === 0) return false;
      seenProduct.add(id);
      return true;
    });

  const days = narrowestWindow(
    candidates,
    endMs,
    config.featureCount,
    config.windowDays,
    config.maxWindowDays,
  );

  if (days === null) {
    return {
      ok: false,
      reason:
        `Only ${candidates.length} new shirts in the ${config.maxWindowDays} days to ` +
        `${day.label} are live, photographed and not already promoted ` +
        `(need ${config.featureCount}). Nothing new enough to post.`,
      diagnostics: {
        day: day.key,
        rowsReturned: all.length,
        stillLive: live.length,
        alreadyShown: shown.size,
        postable: candidates.length,
      },
    };
  }

  const from = endMs - days * 86_400_000;
  const chosen = candidates
    .filter((c) => Date.parse(c.created_at) >= from)
    .slice(0, config.featureCount);

  const fee = await buyerFeeSettings();

  const featured: DropShirt[] = chosen.map((listing) => {
    const product = productFor.get(listing.product_id!)!;
    return {
      listingId: listing.id,
      productId: product.id,
      title:
        product.name?.trim() ||
        listing.title?.trim() ||
        [product.season, product.team, product.shirt_type].filter(Boolean).join(" "),
      team: product.team,
      season: product.season,
      kit: kitLabel(product.shirt_type),
      price: formatPrice(buyerPriceCents(listing.price_cents!, fee), listing.currency ?? "GBP"),
      priceCents: buyerPriceCents(listing.price_cents!, fee),
      condition: cleanValue(listing.condition),
      size: cleanValue(listing.size),
      productUrl: kickioUrl(product.slug),
      imageUrl: imageUrls([product.primary_image_url])[0]!,
    };
  });

  const dearest = featured[0]!;
  const label = windowLabel(days);

  const claims: Claim[] = [
    {
      statement: `${featured.length} shirts listed on Kickio in this window are on sale now`,
      value: featured.length,
      source: `listings.created_at within ${days} day${days === 1 ? "" : "s"} to ${day.key}`,
      basis:
        "Kickio's own listings table, not market data. Active, not deleted or withdrawn, " +
        "in stock, and found at source by the stock checker.",
    },
    {
      statement: `The dearest of the six shown is ${dearest.price}`,
      value: dearest.priceCents / 100,
      source: `listings.price_cents (listing ${dearest.listingId}) plus the buyer fee`,
      basis:
        "The price a buyer pays, not the seller's figure. The dearest arrival in this " +
        "window THAT HAS A PHOTOGRAPH and has not been promoted before.",
    },
  ];

  return {
    ok: true,
    candidate: {
      // The SET, not the day. With a window that widens, two consecutive
      // mornings can cover overlapping stretches, and a date would let the same
      // six shirts post twice under two different subjects. The ids sorted and
      // joined mean an identical set can only ever be posted once.
      subjectRef: featured
        .map((s) => s.productId)
        .sort()
        .join("|"),
      headline: `Dropzone: ${featured.length} new in from ${dearest.price} (${label.toLowerCase()})`,
      sourceData: {
        day: day.key,
        window_days: days,
        // What the card prints under the title. It says how wide the window
        // actually was rather than implying one day every time.
        day_label: label,
        featured: featured.map((shirt) => ({
          // Kept so the next run can refuse a shirt this one promoted.
          product_id: shirt.productId,
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
        postable: candidates.length,
        shown: featured.length,
        // The one claim this post may make that the sales post may not.
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

HOW FAR BACK THE POST REACHES, WHICH IS NOT ALWAYS A DAY

\`day_label\` is the window the engine actually used: "New in yesterday" on a
busy day, "New in over the last five days" when yesterday was quiet. Follow it.
If it says five days, do not write "listed yesterday" - the card beside your
words says otherwise, and a reader who clicks through will see the dates.
"Just in", "new to the site" and "recent arrivals" are safe in every case.

THE SIX ARE THE SIX WE CAN SHOW

A listing with no photograph cannot go on the card, and a shirt already
promoted in a recent Dropzone is held back so the post does not repeat itself.
So never write "the six most expensive shirts listed yesterday" or "the day's
top arrivals". "Six of the latest arrivals" and "among what has just come in"
are right.

Never count anything beyond the six on the card. No "47 listed this week", no
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
