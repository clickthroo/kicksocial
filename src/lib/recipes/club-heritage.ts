/**
 * Club Heritage Shirts - six of one club's older shirts, all buyable now.
 *
 * WHAT IT NEVER SAYS. The six are chosen by season, oldest first, and the post
 * is forbidden from saying so. "The six oldest Liverpool shirts we have" is a
 * claim about the whole catalogue, and it is wrong the moment an older one is
 * listed, sells, or turns out to have been there all along under a season
 * string nothing can parse. It is also a worse sentence. The post says these
 * are part of the club's heritage collection and available now, which is true
 * whatever else arrives.
 *
 * The seasons are printed on the card, so a reader can see perfectly well that
 * these are old shirts. Showing is fine; claiming a superlative is not.
 *
 * HOW THE SIX ARE CHOSEN. Oldest first by the season's start year, one per
 * product, every one with a photograph and a live listing behind it. The
 * season is read off the text because `products.season_end_year` is null on
 * every active row, the same discovery that shaped Price Trends and Classics.
 *
 * PRICE, SIZE AND CONDITION COME FROM ONE LISTING. `products.latest_size` and
 * `latest_condition` are whatever was most recently attached to the product,
 * which is not necessarily the listing whose price is being quoted. A card
 * showing £109 beside a size and condition from a different seller's copy is
 * three facts that were never true together. So the cheapest live listing is
 * read per product and all three come off that one row.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { recentlyFeatured } from "./cooldown.ts";
import { buyerFeeSettings, buyerPriceCents, formatPrice } from "../kickio/pricing.ts";
import { cleanValue } from "../kickio/values.ts";
import { pageAll, pageIn } from "../kickio/page.ts";
import { imageUrls, kickioUrl } from "./grail-of-the-day.ts";
import { kitLabel } from "./most-wanted.ts";
import { isMatchShirt } from "./who-am-i.ts";
import { detailLine } from "./yesterday-sales.ts";
import { shirtColour } from "../render/dominant-colour.ts";

export const HERITAGE_KEY = "club_heritage";

export interface HeritageConfig {
  /** The grid is 3x2. The form of the post. */
  featureCount: number;
  /** How long a club stays out after it has had one. */
  cooldownDays: number;
}

export const DEFAULT_HERITAGE_CONFIG: HeritageConfig = {
  featureCount: 6,
  // A season. The six shown would barely move inside a shorter window, so the
  // same club coming round again would be very nearly the same post.
  cooldownDays: 120,
};

interface ProductRow {
  id: string;
  slug: string | null;
  name: string | null;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  primary_image_url: string | null;
}

interface ListingRow {
  product_id: string | null;
  price_cents: number | null;
  currency: string | null;
  size: string | null;
  condition: string | null;
  status: string | null;
  deleted_at: string | null;
  removed_at: string | null;
  stock_quantity: number | null;
  consecutive_gone_count: number | null;
}

const PRODUCT_COLUMNS = "id,slug,name,team,season,shirt_type,primary_image_url";
const LISTING_COLUMNS =
  "product_id,price_cents,currency,size,condition,status,deleted_at,removed_at," +
  "stock_quantity,consecutive_gone_count";

/** The first year of a season string, or null. Read off the text: see the header. */
export function seasonYear(season: string | null | undefined): number | null {
  const match = /^(\d{4})/.exec((season ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1900 && year <= 2100 ? year : null;
}

/** Could a reader buy this listing in a minute's time? */
export function isLive(listing: ListingRow): boolean {
  if (listing.deleted_at !== null || listing.removed_at !== null) return false;
  if ((listing.status ?? "").trim().toLowerCase() !== "active") return false;
  if ((listing.stock_quantity ?? 0) <= 0) return false;
  if ((listing.consecutive_gone_count ?? 0) > 0) return false;
  return Boolean(listing.price_cents && listing.price_cents > 0);
}

export interface HeritageShirt {
  productId: string;
  title: string;
  season: string;
  year: number;
  kit: string;
  price: string;
  priceCents: number;
  size: string | null;
  condition: string | null;
  productUrl: string | null;
  imageUrl: string;
}

/**
 * Everything one club has that could go on the card, oldest first.
 *
 * Exported so the picker and the recipe cannot disagree about what qualifies:
 * a club offered in the list that then fails to post is the worst kind of
 * picker.
 */
export async function heritageShirts(team: string): Promise<HeritageShirt[]> {
  const products = await pageAll<ProductRow>("Loading club shirts", (from, to) =>
    kickio()
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("team", team)
      .is("deleted_at", null)
      .eq("status", "active")
      .eq("has_active_listing", true)
      .not("primary_image_url", "is", null)
      .not("season", "is", null)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const usable = products.filter(
    (p) => isMatchShirt(p.shirt_type) && seasonYear(p.season) !== null,
  );
  if (usable.length === 0) return [];

  const listings = await pageIn<ListingRow, string>(
    "Loading club listings",
    usable.map((p) => p.id),
    (batch, from, to) =>
      kickio()
        .from("listings")
        .select(LISTING_COLUMNS)
        .in("product_id", batch)
        .order("product_id", { ascending: true })
        .range(from, to),
  );

  // The cheapest LIVE listing per product. All three printed facts come off
  // this one row, so they are true together.
  const cheapest = new Map<string, ListingRow>();
  for (const listing of listings) {
    if (!listing.product_id || !isLive(listing)) continue;
    const held = cheapest.get(listing.product_id);
    if (!held || (listing.price_cents ?? 0) < (held.price_cents ?? 0)) {
      cheapest.set(listing.product_id, listing);
    }
  }

  const fee = await buyerFeeSettings();

  return usable
    .flatMap((product) => {
      const listing = cheapest.get(product.id);
      const photo = imageUrls([product.primary_image_url])[0];
      const year = seasonYear(product.season);
      if (!listing || !photo || year === null) return [];
      const cents = buyerPriceCents(listing.price_cents!, fee);
      return [
        {
          productId: product.id,
          title:
            product.name?.trim() ||
            [product.season, product.team, product.shirt_type].filter(Boolean).join(" "),
          season: product.season!,
          year,
          kit: kitLabel(product.shirt_type),
          price: formatPrice(cents, listing.currency ?? "GBP"),
          priceCents: cents,
          size: cleanValue(listing.size),
          condition: cleanValue(listing.condition),
          productUrl: kickioUrl(product.slug),
          imageUrl: photo,
        } satisfies HeritageShirt,
      ];
    })
    .sort((a, b) => a.year - b.year || a.season.localeCompare(b.season));
}

export interface HeritageClub {
  team: string;
  /** How many of this club's shirts could go on a card. */
  shirts: number;
  span: string;
  postedRecently: boolean;
}

/**
 * Clubs the post could be made about, most to choose from first.
 *
 * One scan of the catalogue rather than a per-club query, because the picker
 * shows every club at once. Paged: PostgREST caps a response at 1,000 rows and
 * a plain limit returns a prefix with no error, which is how a club with 40
 * shirts once looked like a club with none.
 *
 * IT TESTS `has_active_listing` WHERE THE CARD TESTS A LISTING ROW, which is a
 * looser question, so in principle a club could be offered here and come up
 * short when its shirts are actually read. Measured on 2026-10-12 the two
 * agree exactly: 62 clubs by either test and none offered that could not
 * field a card. The cost of the looser test is one scan instead of sixty-odd
 * joins, and /heritage reads the real shirts before any copy is paid for, so
 * a divergence costs a message on screen rather than a failed run.
 */
export async function heritageClubs(
  config: HeritageConfig = DEFAULT_HERITAGE_CONFIG,
): Promise<HeritageClub[]> {
  const products = await pageAll<{ team: string | null; season: string | null; shirt_type: string | null }>(
    "Loading heritage clubs",
    (from, to) =>
      kickio()
        .from("products")
        .select("team,season,shirt_type")
        .is("deleted_at", null)
        .eq("status", "active")
        .eq("has_active_listing", true)
        .not("primary_image_url", "is", null)
        .not("team", "is", null)
        .not("season", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
  );

  const byTeam = new Map<string, number[]>();
  for (const row of products) {
    if (!row.team || !isMatchShirt(row.shirt_type)) continue;
    const year = seasonYear(row.season);
    if (year === null) continue;
    const held = byTeam.get(row.team);
    if (held) held.push(year);
    else byTeam.set(row.team, [year]);
  }

  const seen = await recentlyFeatured(HERITAGE_KEY, config.cooldownDays);

  return [...byTeam.entries()]
    .filter(([, years]) => years.length >= config.featureCount)
    .map(([team, years]) => {
      const sorted = [...years].sort((a, b) => a - b).slice(0, config.featureCount);
      return {
        team,
        shirts: years.length,
        span: `${sorted[0]}-${sorted[sorted.length - 1]}`,
        postedRecently: seen.has(team),
      };
    })
    .sort((a, b) => b.shirts - a.shirts || a.team.localeCompare(b.team));
}

export interface HeritageInput {
  team: string;
}

export async function runClubHeritage(
  input: HeritageInput,
  config: HeritageConfig = DEFAULT_HERITAGE_CONFIG,
): Promise<RecipeResult> {
  const team = input.team.trim();
  if (!team) return { ok: false, reason: "No club chosen." };

  const all = await heritageShirts(team);
  if (all.length < config.featureCount) {
    return {
      ok: false,
      reason:
        `${team} has ${all.length} shirt${all.length === 1 ? "" : "s"} that could go on the ` +
        `card (need ${config.featureCount}): each one needs a photograph, a readable ` +
        "season and a live listing behind it.",
      diagnostics: { team, usable: all.length },
    };
  }

  const featured = all.slice(0, config.featureCount);

  // The field behind the shirts, taken from the first of them. Allowed to
  // fail: a card on the house dark field is fine, a post that did not happen
  // because a colour lookup threw is not.
  let colour: Awaited<ReturnType<typeof shirtColour>> = null;
  try {
    colour = await shirtColour(featured[0]!.imageUrl);
  } catch {
    colour = null;
  }

  const claims: Claim[] = [
    {
      statement: `All ${featured.length} shirts shown are listed on Kickio now`,
      value: featured.length,
      source: "products.has_active_listing, with a live listing read per product",
      basis:
        "Active, not deleted or withdrawn, in stock, and found at source by the stock " +
        "checker. Price, size and condition all come off the same listing, so the three " +
        "are true together rather than assembled from different sellers' copies.",
    },
    {
      statement:
        `They run ${featured[0]!.season} to ${featured[featured.length - 1]!.season}`,
      value: `${featured[0]!.season}-${featured[featured.length - 1]!.season}`,
      source: "products.season, read off the text",
      basis:
        "Chosen oldest first. THE POST MUST NOT SAY SO: it is a claim about the whole " +
        "catalogue and it stops being true the moment an older shirt is listed.",
    },
  ];

  return {
    ok: true,
    candidate: {
      subjectRef: team,
      headline: `${team} heritage: ${featured.length} shirts, ${featured[0]!.season} onwards`,
      sourceData: {
        team,
        shirts: featured.map((shirt) => ({
          title: shirt.title,
          season: shirt.season,
          kit: shirt.kit,
          price: shirt.price,
          size: shirt.size,
          condition: shirt.condition,
          // The third caption line, composed here rather than in the template
          // so every card that prints a condition and a size prints it the
          // same way round. `size` and `condition` stay separately because the
          // copy is told about them and "Size M" is not a sentence.
          detail: detailLine(shirt.condition, shirt.size),
          kickio_url: shirt.productUrl,
        })),
        span: `${featured[0]!.season} to ${featured[featured.length - 1]!.season}`,
        top_url: featured[0]!.productUrl,
        card_label: `${team.toUpperCase()} HERITAGE`,
        card_title: team,
        card_subtitle: "Heritage collection",
        card_footer: "All available now at kickio.com",
        // The field the card sits on, under the key every other template
        // already reads it from (`GrailSaleCard`, `PriceHistoryCard`). A new
        // name for the same thing would have been a second convention for one
        // card. Only the Sweep style spends it, and Sweep is what a heritage
        // draft is created in.
        shirt_colour: colour ?? undefined,
        // Spelled out in the data as well as the brief, because it is the one
        // thing about this post that is easy to get wrong and expensive when
        // it happens.
        never_say:
          "These are the oldest shirts Kickio has for this club, and the post must never " +
          "say so. It is a claim about the whole catalogue and it is wrong as soon as an " +
          "older one is listed. Call it the club's heritage collection instead.",
      },
      claims,
      images: featured.map((shirt) => shirt.imageUrl),
    },
  };
}

export const HERITAGE_BRIEF = `**Club Heritage Shirts** - six of one club's older shirts, all on sale now.

The card shows six shirts with the season, the price, the size and the
condition. Your job is a few lines that make somebody want to look.

THE ONE THING YOU MUST NOT WRITE

These are the oldest shirts Kickio currently has for this club, and saying so
is forbidden. Not "the six oldest", not "the earliest we have", not "the oldest
in stock", not "our most vintage". It is a claim about the whole catalogue, it
is wrong the moment an older shirt is listed or one of these sells, and nobody
reading the post gains anything from it.

What to write instead: these are part of the club's heritage collection and
they are available now. \`team\` is the club. "Part of the Liverpool heritage
collection on Kickio, all available today" is the shape.

The seasons are printed on the card, so a reader can see for themselves that
these are old shirts. Showing is fine. Claiming a superlative is not, and that
goes for every other one too: no "the rarest", no "the best of the era", no
"the pick of the collection".

STRUCTURE

1. Open on the club and the era. What the badge meant in those years, what the
   kits looked like, why a collector would want one. Two or three sentences.
2. Pick out one shirt and say something specific about it: the season, the kit,
   what makes it worth a second look. Name it rather than ranking it.
3. Say they are available now and send them to Kickio. \`top_url\` is one of the
   shirts and each entry in \`shirts\` carries its own \`kickio_url\`.

ON THE HISTORY

Write only what you are confident is true of this club in these years. A
collector reading a Kickio post knows this ground better than almost anyone,
and one wrong detail costs more than a dull post. Never invent a match, a
score, a transfer or a date. Where you have nothing specific, write about the
kits: the colourways, the sponsors, the makers, how they changed.

PRICES, SIZES AND CONDITIONS

Each shirt's price is what a buyer pays, and the size and condition belong to
that same listing. Mention them where they make a point - a mint shirt, a hard
size to find - rather than reading the grid back. The card already shows it.

VOICE

Warm and unhurried. This is the one post besides Classics that is allowed to be
fond of a club. No exclamation marks, no urgency, no claim that any of it is
rare unless the data says so, and it does not.

Close on the link and kickio.com.`;
