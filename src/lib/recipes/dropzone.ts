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
 * TWENTY-FOUR HOURS, AND IT IS A SNAPSHOT RATHER THAN A CHART.
 *
 * This reached for more days when a day was thin, which kept the grid full and
 * bought that with honesty: a post headed "just landed" could be showing a
 * shirt listed a week and a half ago. The window is one day again, and the
 * card and the copy both say what the post actually is - some of what came in
 * yesterday, not a ranking, not a complete list, not the dearest six on the
 * site.
 *
 * THAT COSTS FREQUENCY, AND THE FIGURE IS KNOWN. Measured over the 14 days to
 * 2026-10-05, new listings still live, photographed and distinct ran 4, 2, 2,
 * 70, 9, 0, 1, 1 across the eight days that had any at all; six days had none.
 * So this posts on the days Kickio actually gains stock and says nothing on
 * the rest, which is the right way round for a post whose whole claim is that
 * the shirts are new.
 *
 * The grid takes three to six rather than six exactly, for the same reason: a
 * snapshot of four is still a snapshot, and insisting on six is how a 24-hour
 * window ends up posting twice a fortnight. Below three it stops reading as a
 * set and starts reading as a card that failed to load.
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
  /** The most the grid will show. Two rows of three. */
  featureCount: number;
  /**
   * The fewest that still reads as a snapshot.
   *
   * Below three it reads as a card that failed to load rather than as a quiet
   * day, and a quiet day is better said by not posting.
   */
  minFeatured: number;
  /** One. The post says "just landed" and has to mean it. */
  windowDays: number;
  /** Below this a "drop" is not worth promoting. */
  minPriceCents: number;
  /** How long a shirt stays out of Dropzone after it has been in one. */
  cooldownDays: number;
}

export const DEFAULT_DROPZONE_CONFIG: DropzoneConfig = {
  featureCount: 6,
  minFeatured: 3,
  windowDays: 1,
  // Deliberately low. The post is "the dearest six that arrived", and on a quiet
  // day the sixth will not be dear. A floor that empties the grid defeats the
  // post; one that admits a £15 shirt only costs it the bottom-right tile.
  minPriceCents: 1_500,
  // Consecutive 24-hour windows do not overlap, so nothing can come round
  // again on its own. This guards the other two routes: a second run on the
  // same morning, and anybody later widening the window back out.
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

export async function runDropzone(
  config: DropzoneConfig = DEFAULT_DROPZONE_CONFIG,
  now: Date = new Date(),
): Promise<RecipeResult> {
  const day: DayWindow = previousDay(now);

  // Paged rather than limited: one bulk import put 623 listings on a single
  // day, and a `limit` ordered by price would silently drop the cheap end,
  // which is the half that decides whether there is a snapshot to show at all.
  const all = await pageAll<ListingRow>("Loading Dropzone listings", (from, to) =>
    kickio()
      .from("listings")
      .select(LISTING_COLUMNS)
      .gte("created_at", day.start)
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
        `Nothing was listed on ${day.label} at ${formatPrice(config.minPriceCents)} ` +
        `or more that is still live this morning`,
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

  if (candidates.length < config.minFeatured) {
    return {
      ok: false,
      reason:
        `Only ${candidates.length} shirt${candidates.length === 1 ? "" : "s"} listed on ` +
        `${day.label} are live, photographed and not already promoted ` +
        `(need ${config.minFeatured}). Too quiet a day to be worth a snapshot.`,
      diagnostics: {
        day: day.key,
        rowsReturned: all.length,
        stillLive: live.length,
        alreadyShown: shown.size,
        postable: candidates.length,
      },
    };
  }

  const chosen = candidates.slice(0, config.featureCount);

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

  const claims: Claim[] = [
    {
      statement:
        `${candidates.length} shirt${candidates.length === 1 ? " was" : "s were"} listed ` +
        `on Kickio on ${day.label} and ${candidates.length === 1 ? "is" : "are"} still on sale`,
      value: candidates.length,
      source: `listings.created_at within the 24 hours of ${day.key}`,
      basis:
        "Kickio's own listings table, not market data. Active, not deleted or withdrawn, " +
        "in stock, and found at source by the stock checker. Of these, " +
        `${featured.length} are on the card.`,
    },
    {
      statement: `The dearest of the ${featured.length} shown is ${dearest.price}`,
      value: dearest.priceCents / 100,
      source: `listings.price_cents (listing ${dearest.listingId}) plus the buyer fee`,
      basis:
        "The price a buyer pays, not the seller's figure. The dearest of the day's " +
        "arrivals THAT HAS A PHOTOGRAPH and has not been promoted before.",
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
      headline: `Dropzone: ${featured.length} new in on ${day.label}, from ${dearest.price}`,
      sourceData: {
        day: day.key,
        window_hours: 24,
        // What the card prints under the title.
        day_label: `Added in the 24 hours of ${day.label}`,
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
        // Says what the card is rather than letting the grid imply a ranking.
        // Six tiles in order of price read as a chart unless something says
        // otherwise, and this post is not a chart: it is some of what arrived.
        card_footer: "A snapshot of what came in. See them all at kickio.com",
      },
      claims,
      images: featured.map((shirt) => shirt.imageUrl),
    },
  };
}

export const DROPZONE_BRIEF = `**Dropzone** - a snapshot of what was listed on Kickio in the last day.

New in, still available, and the post exists to shift them. This is the most
openly promotional post in the set and it is allowed to be. What it is not is
a chart: see the snapshot rule below, which is the one thing to get right.

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

IT IS A SNAPSHOT, AND THE POST HAS TO SAY SO

This is some of what was listed in the last twenty-four hours. It is not a
ranking, not the dearest shirts on Kickio, and not everything that came in.
Three things follow and none of them is optional.

- Never write "the six most expensive", "the day's top arrivals", "the best of
  what came in" or anything else that makes the card a chart. A grid in price
  order reads as a ranking unless the words say otherwise, which is why the
  card itself carries the line "a snapshot of what came in".
- Never imply it is the complete list. A listing with no photograph cannot go
  on the card and a shirt promoted in a recent Dropzone is held back, so there
  is nearly always more than this. "A few of yesterday's arrivals", "some of
  what landed" and "a snapshot of the last day" are the register.
- The number shown varies between three and six. Write about the shirts, not
  about how many there are, and the copy then works whichever it is.

TWENTY-FOUR HOURS, AND YOU MAY SAY SO

Every shirt here was listed yesterday and is on sale now. "Just landed",
"listed yesterday", "new in the last day" and "available now" are all true and
all correct, which is the whole point of the post. Say it plainly.

Never count anything beyond the shirts on the card. No "47 listed yesterday",
no totals, no comparison with the day before.

PRICES, CONDITION AND SIZE

\`price\` is what a buyer pays, fee included, and it is the only price you may
use. Condition and size are on the card where the listing gave them; mention
them where they make a point - a mint shirt, a hard-to-find size - rather than
reading the grid back.

VOICE

Warm and direct. It is a shop window, not an auction house. No exclamation
marks, no manufactured scarcity, and no adjectives the shirt has not earned.

Close on the link and kickio.com.`;
