/**
 * Yesterday's Sales Highlights - the six dearest shirts to change hands, daily.
 *
 * WHAT THE DATA ACTUALLY IS, WHICH DECIDES EVERY WORD OF THE COPY
 *
 * The obvious reading of this post is "here is what sold on Kickio yesterday,
 * come and list yours". The first half of that sentence is not something this
 * engine can say, and the reason is worth writing down because it is not
 * obvious from the table name.
 *
 * `sales_history` is market-wide. Measured on 2026-10-05 over 30 days:
 * cfs 1,738 rows, kickio 319, shopify 162, ebay 125, scrape 5. The `kickio`
 * rows look like the exception until you check them: 2 of those 319 carry a
 * `listing_id` and NONE carry an `external_url`, where every other source
 * carries both on 100% of its rows. Kickio's own `orders` table holds 19 rows
 * in its entire history, 4 in the last 30 days and 0 in the last 7. So a
 * `kickio` row in this table is a price record attributed to Kickio's
 * catalogue, not a completed transaction through the site.
 *
 * Therefore: this post describes THE MARKET. It must never claim these sold on
 * Kickio. That is not pedantry - the audience is collectors who watch these
 * same sales, the claim would be checkable in a minute, and a marketplace
 * caught inflating its own volume has spent something it cannot buy back.
 *
 * The call to action survives this intact, and is arguably stronger for it:
 * the post shows what shirts are fetching right now and invites people to list
 * theirs on Kickio. "This is the going rate, put yours up" needs no claim about
 * where these particular six went.
 *
 * SIX, AND WHY SOME DAYS GET NONE
 *
 * The card is a 3x2 grid, so it needs six shirts WITH PHOTOGRAPHS. Only the
 * sales attached to a product in Kickio's catalogue have one: market records
 * scraped from elsewhere have no product behind them. Measured over the 15 days
 * to 2026-10-05, the distinct photo-backed products per day ran
 * 83, 5, 6, 41, 47, 43, 34, 31, 16, 13, 26, 15, 9, 6, 3 - so 13 of 15 days
 * could fill the grid and two could not.
 *
 * A ragged last row reads as a broken card rather than a quiet day, so a thin
 * day skips with its count in the reason instead. That is the right trade for a
 * post whose whole form is six tiles.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { salesReadable } from "./sales-access.ts";
import { showableSales } from "./sold-this-week.ts";
import { formatPrice } from "../kickio/pricing.ts";
import { cleanValue } from "../kickio/values.ts";
import { pageIn } from "../kickio/page.ts";
import { imageUrls } from "./grail-of-the-day.ts";
import { kitLabel } from "./most-wanted.ts";

export const YESTERDAY_SALES_KEY = "yesterday_sales";

export interface YesterdaySalesConfig {
  /** The grid is 3x2. This is the form of the post, not a threshold to tune. */
  featureCount: number;
  /** Below the price floor a "highlight" is not a highlight. */
  minPriceCents: number;
}

export const DEFAULT_YESTERDAY_SALES_CONFIG: YesterdaySalesConfig = {
  featureCount: 6,
  // Low enough that a quiet day still fills the grid, high enough that nothing
  // on the card looks like a bargain bin. The dearest photo-backed sale of a
  // day ran between £84 and £553 across the fortnight measured.
  minPriceCents: 2_000,
};

interface SaleRow {
  id: string;
  product_id: string | null;
  sold_at: string;
  price_cents: number;
  currency: string | null;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  condition: string | null;
  size: string | null;
  player_name: string | null;
  source: string;
}

const COLUMNS =
  "id,product_id,sold_at,price_cents,currency,team,season,shirt_type," +
  "condition,size,player_name,source";

export interface DayWindow {
  /** Inclusive start of the previous UTC day. */
  start: string;
  /** Exclusive end: midnight at the start of today. */
  end: string;
  /** "2026-10-04". The subject, so a day can only be posted once. */
  key: string;
  /** "Saturday 4 October", for the card and the copy. */
  label: string;
}

/**
 * Yesterday, in UTC, as a whole day.
 *
 * UTC rather than local time because every other date in this engine is UTC and
 * a post whose window depends on where the server happens to be is a post that
 * silently covers 23 or 25 hours twice a year. The label is British English
 * because the audience is.
 */
export function previousDay(now: Date = new Date()): DayWindow {
  const midnightToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = new Date(midnightToday - 86_400_000);
  const end = new Date(midnightToday);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    key: start.toISOString().slice(0, 10),
    label: start.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }),
  };
}

export interface FeaturedSale {
  productId: string;
  title: string;
  team: string | null;
  season: string | null;
  kit: string;
  price: string;
  priceCents: number;
  /** Null where the record does not say, rather than "Unknown" on the card. */
  condition: string | null;
  size: string | null;
  source: string;
  imageUrl: string;
}

/**
 * The line under a tile: condition and size, whichever of them is known.
 *
 * Both are free text on a market record and both are often a placeholder, so
 * `cleanValue` runs first. A tile reading "Unknown · N/A" says nothing and
 * takes the space of something that would.
 */
export function detailLine(condition: string | null, size: string | null): string {
  return [cleanValue(condition), cleanValue(size) ? `Size ${cleanValue(size)}` : null]
    .filter(Boolean)
    .join(" · ");
}

export async function runYesterdaySales(
  config: YesterdaySalesConfig = DEFAULT_YESTERDAY_SALES_CONFIG,
  now: Date = new Date(),
): Promise<RecipeResult> {
  const day = previousDay(now);

  const { data, error } = await kickio()
    .from("sales_history")
    .select(COLUMNS)
    .gte("sold_at", day.start)
    .lt("sold_at", day.end)
    .is("excluded_at", null)
    .is("dismissed_at", null)
    .eq("review_state", "approved")
    .gte("price_cents", config.minPriceCents)
    .order("price_cents", { ascending: false })
    .limit(200);

  if (error) return { ok: false, reason: `Kickio query failed: ${error.message}` };

  const sales = (data ?? []) as unknown as SaleRow[];

  if (sales.length === 0) {
    // Ask the table rather than assume, for the reason sales-access.ts sets
    // out at length: an unreadable table and a quiet day are the same shape
    // from here, and guessing produces a confident false statement in one
    // direction or the other.
    const readable = await salesReadable();
    return {
      ok: false,
      reason: readable
        ? `Nothing recorded on ${day.label} at ${formatPrice(config.minPriceCents)} or more`
        : "The engine cannot see Kickio's recorded sales: sales_history read as empty " +
          "even unfiltered. See docs/unblocking-sold-this-week.md.",
      diagnostics: { day: day.key, rowsReturned: 0, salesTableReadable: readable },
    };
  }

  const productIds = [...new Set(sales.map((s) => s.product_id).filter((id): id is string => !!id))];

  const products = await pageIn<{ id: string; name: string | null; primary_image_url: string | null }, string>(
    "Loading sale photos",
    productIds,
    (batch, from, to) =>
      kickio()
        .from("products")
        .select("id,name,primary_image_url")
        .in("id", batch)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
  );

  const photoFor = new Map<string, string>();
  const nameFor = new Map<string, string>();
  for (const product of products) {
    const url = imageUrls([product.primary_image_url])[0];
    if (url) photoFor.set(product.id, url);
    if (product.name?.trim()) nameFor.set(product.id, product.name.trim());
  }

  // One tile per product, dearest first: `sales_history` is one row per sale,
  // so a popular shirt that sold twice in a day would otherwise take two tiles
  // at two prices and read as a rendering fault.
  const showable = showableSales(sales, photoFor);

  if (showable.length < config.featureCount) {
    return {
      ok: false,
      reason:
        `Only ${showable.length} of ${sales.length} sales on ${day.label} have a photograph ` +
        `(need ${config.featureCount} to fill the grid). A short row reads as a broken card.`,
      diagnostics: {
        day: day.key,
        rowsReturned: sales.length,
        withPhoto: showable.length,
      },
    };
  }

  const featured: FeaturedSale[] = showable.slice(0, config.featureCount).map((sale) => ({
    productId: sale.product_id!,
    title:
      nameFor.get(sale.product_id!) ??
      [sale.season, sale.team, sale.shirt_type].filter(Boolean).join(" "),
    team: sale.team,
    season: sale.season,
    kit: kitLabel(sale.shirt_type),
    price: formatPrice(sale.price_cents, sale.currency ?? "GBP"),
    priceCents: sale.price_cents,
    condition: cleanValue(sale.condition),
    size: cleanValue(sale.size),
    source: sale.source,
    imageUrl: photoFor.get(sale.product_id!)!,
  }));

  // Who the day's records came from, carried into the draft so a reviewer can
  // see at a glance that this is not Kickio's own order book. The brief says
  // so in words; this is the evidence behind it.
  const sourceMix: Record<string, number> = {};
  for (const sale of sales) sourceMix[sale.source] = (sourceMix[sale.source] ?? 0) + 1;

  const dearest = featured[0]!;

  const claims: Claim[] = [
    {
      statement: `${sales.length} shirt sales were recorded across the market on ${day.label}`,
      value: sales.length,
      source: "sales_history (approved, not excluded or dismissed)",
      basis:
        "Market-wide records Kickio aggregates from across the hobby, not Kickio's own " +
        "orders. Sources on the day: " +
        Object.entries(sourceMix)
          .map(([name, count]) => `${name} ${count}`)
          .join(", "),
    },
    {
      statement: `The dearest of the six shown went for ${dearest.price}`,
      value: dearest.priceCents / 100,
      source: `sales_history.price_cents (product ${dearest.productId})`,
      basis:
        "The dearest sale of the day THAT HAS A PHOTOGRAPH. Records without a product " +
        "behind them cannot be shown, so this is not necessarily the day's top price.",
    },
  ];

  return {
    ok: true,
    candidate: {
      subjectRef: day.key,
      headline: `Yesterday's sales: ${day.label}, from ${dearest.price} down`,
      sourceData: {
        day: day.key,
        day_label: day.label,
        featured: featured.map((sale) => ({
          title: sale.title,
          team: sale.team,
          season: sale.season,
          kit: sale.kit,
          price: sale.price,
          condition: sale.condition,
          size: sale.size,
          detail: detailLine(sale.condition, sale.size),
        })),
        recorded_that_day: sales.length,
        shown: featured.length,
        source_mix: sourceMix,
        // Spelled out in the data as well as the brief, because it is the one
        // thing about this post that would be expensive to get wrong.
        framing_warning:
          "These are market-wide sales Kickio tracks from across the hobby. They did NOT " +
          "necessarily happen on Kickio, and the copy must never say or imply they did.",
      },
      claims,
      // Index-aligned with `featured`, which is why only photo-backed sales are
      // featured at all: a gap here would slide every photo onto the wrong
      // shirt, putting a real price under the wrong picture.
      images: featured.map((sale) => sale.imageUrl),
    },
  };
}

export const YESTERDAY_SALES_BRIEF = `**Yesterday's Sales Highlights** - six shirts that changed hands, and an invitation to list.

The card shows six shirts with the price, condition and size each went for. Your
job is a short read on the day and a reason to put a shirt up for sale.

STRUCTURE

1. Open on the day's standout. Name the shirt and what it went for. One or two
   sentences on why that one is interesting: the club, the era, the kit.
2. A line on the rest. A pattern beats a list - a run of nineties shirts, three
   from the same league, condition mattering more than age.
3. The ask. This is the point of the post: people reading it own shirts worth
   the same money and have never thought about selling them. Invite them to list
   on Kickio. Make it about them, not about us.

THE ONE HARD RULE

This is MARKET-WIDE sales data that Kickio tracks from across the hobby. It is
NOT Kickio's own sales. Never write "sold on Kickio", "we sold", "our sales
yesterday", or anything a reader would take that way. "Changed hands", "went
for", "across the market" are all correct. The audience watches these same sales
and would catch it inside a minute.

That takes nothing away from the ask. "This is what these shirts are fetching
right now, and yours is sitting in a drawer" is a better argument than "look how
much we sell", and it is one you can actually make.

THE SET IS NOT COMPLETE, SO DO NOT SAY IT IS

These are the six dearest sales WE CAN SHOW. A sale with no photograph behind it
cannot go on the card, so never write "the top six", "the highest price of the
day" or "the biggest sale yesterday". "Among yesterday's results" and "six of
the day's results" are the right register.

Never count anything beyond the six on the card. No "47 sales tracked", no
totals, no averages, no comparison with the day before. How many rows a query
returned is a fact about a database.

CONDITION AND SIZE

Both are on the card where the record had them. You may mention them where they
make a point - a mint shirt pulling a premium, a hard-to-find size going high -
but do not simply read the grid back. The card already shows it.

VOICE

Brisk and matter of fact. No exclamation marks, no urgency, no "don't miss out".
The numbers are the hook, so let them be it.

Close on the invitation to list, and kickio.com.`;
