/**
 * PhotoProd - any shirt on Kickio, under a photograph somebody supplies.
 *
 * Kickio Classics is this card with a shelf in front of it: pre-2000, match
 * shirt, in stock at £150 or more, chosen off a list the engine builds. That
 * shelf is what makes it a format, and it is also what makes it useless for
 * everything else. A shirt that arrived this morning, a modern kit worth
 * posting because of the picture rather than the price, a goalkeeper shirt, a
 * training top: all of them are refused by Classics by design, and all of them
 * are posts somebody might want to make.
 *
 * So this is the same card with no shelf. The admin names the shirt by pasting
 * its Kickio URL, supplies the photograph, and the overlay is read from
 * Kickio's own record of that product rather than typed. Same division of
 * labour as Classics: the engine is right about the shirt, the price and the
 * link; the person is responsible for the one judgement that carries legal
 * weight, which is whether Kickio may publish this image.
 *
 * EVERYTHING THE LICENSING COMMENT IN classics.ts SAYS APPLIES HERE. Archive
 * photography belongs to its agency, a named player beside a price is an
 * implied endorsement, and a credit is required for the same reason. Removing
 * the pre-2000 shelf removes an editorial constraint, not a legal one.
 *
 * WHAT IT DOES NOT ASSUME
 *
 * A product with nothing for sale is allowed through rather than refused: the
 * admin may be posting the picture rather than the listing. But the price is
 * then left off the card and the copy is told there is nothing to buy, because
 * a post that implies a shirt is purchasable when it is not is worse than a
 * post that does not mention money.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { formatPrice } from "../kickio/pricing.ts";
import { kickioUrl } from "./grail-of-the-day.ts";
import { kitLabel } from "./most-wanted.ts";
import { looksLikeImage } from "./classics.ts";
import { slugFromUrl } from "../kickio/product-url.ts";
import { listingIdFromUrl } from "../kickio/listing-url.ts";

export const PHOTO_PROD_KEY = "photo_prod";

interface ProductRow {
  id: string;
  name: string | null;
  slug: string | null;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  manufacturer: string | null;
  player_name: string | null;
  lowest_price_cents: number | null;
  listings_count: number | null;
  has_active_listing: boolean | null;
  primary_image_url: string | null;
}

const COLUMNS =
  "id,name,slug,team,season,shirt_type,manufacturer,player_name," +
  "lowest_price_cents,listings_count,has_active_listing,primary_image_url";

export interface PhotoProdShirt {
  productId: string;
  title: string;
  team: string | null;
  season: string | null;
  kit: string;
  manufacturer: string | null;
  playerName: string | null;
  /** Null when nothing is listed, which is a state the card has to handle. */
  price: string | null;
  priceCents: number | null;
  listingsCount: number;
  forSale: boolean;
  productUrl: string | null;
  /** Kickio's own catalogue shot, shown in the preview and never on the card. */
  thumbUrl: string | null;
}

function toShirt(row: ProductRow): PhotoProdShirt {
  const cents = row.lowest_price_cents;
  // `has_active_listing` rather than a count or a status: it is the column that
  // means somebody can buy it right now, and the one Most Wanted was briefly
  // wrong about. A product can carry listings_count from listings that have
  // all since gone.
  const forSale = row.has_active_listing === true && typeof cents === "number" && cents > 0;

  return {
    productId: row.id,
    title: row.name?.trim() || [row.season, row.team, row.shirt_type].filter(Boolean).join(" "),
    team: row.team,
    season: row.season,
    kit: kitLabel(row.shirt_type),
    manufacturer: row.manufacturer,
    playerName: row.player_name?.trim() || null,
    price: forSale ? formatPrice(cents, "GBP") : null,
    priceCents: forSale ? cents : null,
    listingsCount: row.listings_count ?? 0,
    forSale,
    productUrl: kickioUrl(row.slug),
    thumbUrl: row.primary_image_url,
  };
}

export type ResolveResult =
  | { ok: true; shirt: PhotoProdShirt }
  | { ok: false; reason: string };

/**
 * Turn whatever the admin pasted into one product.
 *
 * Both kinds of Kickio link are accepted. `/marketplace/{slug}` is the shirt
 * and is what this post is about; `/listings/{id}` is one seller's copy of it,
 * and is the link somebody lands on when they are looking at the thing they
 * want to photograph. Refusing the second on a technicality, when resolving it
 * is one extra read, would be a tool being pedantic at somebody's expense.
 */
export async function resolveShirt(url: string): Promise<ResolveResult> {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, reason: "Paste a Kickio link to the shirt." };

  const bySlug = slugFromUrl(trimmed);
  if (bySlug.ok) return loadBySlug(bySlug.slug);

  const byListing = listingIdFromUrl(trimmed);
  if (byListing.ok) return loadByListing(byListing.id);

  // Neither parser recognised it. The product parser's refusal is the more
  // useful of the two here, because a product link is what this asks for.
  return { ok: false, reason: bySlug.reason };
}

async function loadBySlug(slug: string): Promise<ResolveResult> {
  const { data, error } = await kickio()
    .from("products")
    .select(COLUMNS)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { ok: false, reason: `Kickio lookup failed: ${error.message}` };
  if (!data) return { ok: false, reason: `Kickio has no shirt at "${slug}".` };
  return { ok: true, shirt: toShirt(data as unknown as ProductRow) };
}

async function loadByListing(listingId: string): Promise<ResolveResult> {
  const { data, error } = await kickio()
    .from("listings")
    .select("id,product_id")
    .eq("id", listingId)
    .maybeSingle();

  if (error) return { ok: false, reason: `Kickio lookup failed: ${error.message}` };
  if (!data) return { ok: false, reason: "No listing on Kickio with that id." };

  const productId = (data as { product_id: string | null }).product_id;
  if (!productId) {
    return { ok: false, reason: "That listing is not attached to a product, so there is no page to link to." };
  }
  return loadById(productId);
}

async function loadById(productId: string): Promise<ResolveResult> {
  const { data, error } = await kickio()
    .from("products")
    .select(COLUMNS)
    .eq("id", productId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { ok: false, reason: `Kickio lookup failed: ${error.message}` };
  if (!data) return { ok: false, reason: "Kickio no longer has that shirt." };
  return { ok: true, shirt: toShirt(data as unknown as ProductRow) };
}

export interface PhotoProdInput {
  /** A kickio.com product or listing URL, or a bare product slug. */
  productUrl: string;
  /** An image Kickio has the right to publish. */
  photoUrl: string;
  /** Who it belongs to. Required, for the same reason as Classics. */
  photoCredit: string;
  /** Who is in the photograph, if the admin wants them named on the card. */
  photoPlayer?: string;
}

/** What the card prints under the mark. Empty, so the lockup carries no label. */
export const CARD_LABEL = "";

export async function runPhotoProd(input: PhotoProdInput): Promise<RecipeResult> {
  const photoUrl = input.photoUrl.trim();
  const credit = input.photoCredit.trim();

  if (!photoUrl) return { ok: false, reason: "A photograph is needed for this post." };
  if (!looksLikeImage(photoUrl)) {
    return {
      ok: false,
      reason:
        "That does not look like an image file. Upload the picture, or give an https " +
        "link ending in .jpg, .png or .webp rather than a link to a page it sits on.",
    };
  }
  if (!credit) {
    return {
      ok: false,
      reason:
        "A credit is required. The image is published by this post, and almost every " +
        "image worth using carries an attribution the licence insists on.",
    };
  }

  const resolved = await resolveShirt(input.productUrl);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  const shirt = resolved.shirt;

  const player = input.photoPlayer?.trim() || shirt.playerName;

  const listingLine = !shirt.forSale
    ? "Nothing is listed on Kickio for this shirt right now"
    : shirt.listingsCount > 1
      ? `${shirt.listingsCount} listed on Kickio, from ${shirt.price}`
      : `One listed on Kickio, at ${shirt.price}`;

  const claims: Claim[] = [
    {
      statement: listingLine,
      value: shirt.listingsCount,
      source: `products.has_active_listing, products.listings_count (id ${shirt.productId})`,
      basis: shirt.forSale
        ? "Read off the live listings for this exact shirt."
        : "The product exists in the catalogue but has no listing on sale.",
    },
  ];

  if (shirt.forSale && shirt.priceCents !== null) {
    claims.push({
      statement: `${shirt.title} is listed on Kickio from ${shirt.price}`,
      value: shirt.priceCents / 100,
      source: `products.lowest_price_cents (id ${shirt.productId})`,
      basis: "The cheapest of the live listings for this exact shirt.",
    });
  }

  const candidate: RecipeCandidate = {
    subjectRef: shirt.productId,
    headline: `PhotoProd: ${shirt.title}`,
    sourceData: {
      title: shirt.title,
      team: shirt.team,
      season: shirt.season,
      kit: shirt.kit,
      manufacturer: shirt.manufacturer,
      player,
      // Absent rather than empty when nothing is for sale, so the card leaves
      // the line out instead of drawing "From " with a blank after it.
      ...(shirt.price ? { price: shirt.price } : {}),
      for_sale: shirt.forSale,
      listings_count: shirt.listingsCount,
      listing_line: listingLine,
      kickio_url: shirt.productUrl,
      photo_credit: credit,
      card_label: CARD_LABEL,
      history_warning:
        "Nothing in this engine verifies anything the copy says about this shirt beyond " +
        "the figures above. Anything about the era, the kit or the players is the " +
        "model's own knowledge and has to be read as a claim, not as a fact Kickio " +
        "checked.",
    },
    claims,
    // The supplied photograph IS the card, exactly as in Classics. Kickio's
    // catalogue shot is deliberately absent: two images would make the
    // template choose, and the picture is the whole point of the post.
    images: [photoUrl],
  };

  return { ok: true, candidate };
}

export const PHOTO_PROD_BRIEF = `**PhotoProd** - one shirt from Kickio, under a photograph.

The picture carries this post. Your job is the few lines beside it: what the
shirt is, why it is worth looking at, and where to get one.

STRUCTURE

1. The shirt. Two or three sentences: the club, the season, the kit, what is
   interesting about it. Lead with whatever is actually true and specific
   rather than with adjectives.
2. What Kickio has. Use \`listing_line\` as given, in one sentence.
3. Send them to the shirt. \`kickio_url\` is the product page and it is where
   the post must point.

WHEN THERE IS NOTHING FOR SALE

\`for_sale\` is false on some of these. When it is, do not imply the shirt can
be bought, do not write a call to action about buying, and do not invent a
price. Write about the shirt and point at the page, which is where it will
appear if one is listed. A post that sends somebody to buy something that is
not there costs more than a quieter post.

ON ANYTHING HISTORICAL, WHICH IS THE RISK IN THIS POST

The figures are verified. Nothing else is.

- Write only what you are confident is true of this shirt and this season. A
  collector reading a Kickio post knows this ground better than almost anyone,
  and one wrong detail costs more than a dull post.
- Never invent a match, a goal, a score, a transfer or a date. Where you have
  nothing specific, write about the design: the colourway, the sponsor, the
  maker, what the kit looked like against what came before it.
- \`player\` is who is in the photograph, where the admin named them. You may
  say they wore the shirt. Do not build a story around them the facts do not
  carry.

PRICES

\`price\` is the cheapest live listing and the only price you may use. Write it
as a starting price ("from £189"), never as a valuation or as what the shirt is
worth. Do not mention size or condition: this post is about the shirt, not
about one seller's copy of it.

VOICE

Warm rather than transactional. No exclamation marks, no urgency, and no claim
that it is rare or that it will not last unless the data says so.

Close on the link and kickio.com.`;
