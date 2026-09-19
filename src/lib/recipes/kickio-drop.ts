/**
 * Kickio Drops - one live listing, promoted.
 *
 * An admin pastes a listing URL and the engine builds the post. Closest
 * relative is Grail Sale, and the differences are the whole design:
 *
 *   Grail Sale   a shirt that has gone. Price typed by hand. No link to buy.
 *   Kickio Drop  a shirt you can buy now. Price read from the listing.
 *
 * LISTING IN, PRODUCT OUT
 *
 * The admin pastes `/listings/{uuid}` - one seller's copy of a shirt - and the
 * post links to `/marketplace/{slug}`, the shirt itself. That is deliberate:
 * a listing sells and 404s, while the product page survives and shows whoever
 * else is selling one. A post that outlives its link is worth the indirection.
 *
 * WHICH COSTS SOMETHING, AND IT IS CHECKED
 *
 * 225 products have more than one live listing, up to five. So the price on the
 * card can be a different number from the first price on the page it sends you
 * to. `cheaperElsewhere` finds that case and the draft carries it into review
 * as a warning rather than refusing - featuring a mint example over a cheaper
 * tatty one is a legitimate editorial choice, and only a person can make it.
 *
 * THE PHOTO IS THE PRODUCT'S
 *
 * Asked for explicitly, and right: the product shot is the catalogue image,
 * consistent across posts, while listing photos are whatever the seller took.
 * The listing's own photos are the last fallback, and when they are used the
 * draft says so, because a reviewer should know they are looking at the actual
 * item rather than the reference shot.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeResult } from "../engine/types.ts";
import { listingIdFromUrl } from "../kickio/listing-url.ts";
import { buyerFeeSettings, buyerPriceCents, formatPrice } from "../kickio/pricing.ts";
import { imageUrls, kickioUrl, readSignals } from "./grail-of-the-day.ts";
import { productImages, type ProductRow } from "./grail-sale.ts";

export const KICKIO_DROP_KEY = "kickio_drop";

export interface ListingRow {
  id: string;
  product_id: string | null;
  seller_id: string | null;
  title: string | null;
  description: string | null;
  size: string | null;
  condition: string | null;
  price_cents: number | null;
  currency: string | null;
  images: unknown;
  status: string | null;
  deleted_at: string | null;
  removed_at: string | null;
  removed_reason: string | null;
  stock_quantity: number | null;
  consecutive_gone_count: number | null;
  accepts_offers: boolean | null;
  issue: string | null;
  signed: string | null;
  special_edition: string | null;
  boxed_edition: string | null;
  sleeves: string | null;
  player_name: string | null;
  number: string | null;
  manufacturer: string | null;
}

const LISTING_COLUMNS =
  "id,product_id,seller_id,title,description,size,condition,price_cents,currency,images," +
  "status,deleted_at,removed_at,removed_reason,stock_quantity,consecutive_gone_count,accepts_offers," +
  "issue,signed,special_edition,boxed_edition,sleeves,player_name,number,manufacturer";

const PRODUCT_COLUMNS =
  "id,slug,name,team,season,shirt_type,manufacturer,player_name,number,issue,signed," +
  "special_edition,boxed_edition,sleeves,colour,latest_condition,latest_size,status," +
  "deleted_at,primary_image_url,images";

export interface KickioDropInput {
  /** A kickio.com `/listings/{uuid}` link, or a bare listing id. */
  url: string;
  /** Free text from the admin, passed to the copy as context, never as fact. */
  note?: string;
}

/**
 * Is this listing something a reader could actually buy in a minute's time?
 *
 * The same test Grail of the Day applies, stated here rather than imported,
 * because that one takes a scored candidate and this takes a row the admin
 * chose. Every clause is a way a listing can be live in the database and gone
 * in practice.
 */
export function liveVerdict(listing: ListingRow): { ok: boolean; reason?: string } {
  if (listing.deleted_at !== null) return { ok: false, reason: "that listing has been deleted" };
  if (listing.status !== "active") {
    return { ok: false, reason: `that listing is ${listing.status ?? "not active"}, not active` };
  }
  if (listing.removed_at !== null) {
    return { ok: false, reason: `that listing was withdrawn (${listing.removed_reason ?? "removed"})` };
  }
  if ((listing.stock_quantity ?? 0) <= 0) return { ok: false, reason: "that listing is out of stock" };
  if ((listing.consecutive_gone_count ?? 0) > 0) {
    return {
      ok: false,
      reason: "the stock checker has not been able to find that listing at its source",
    };
  }
  if (!listing.price_cents || listing.price_cents <= 0) {
    return { ok: false, reason: "that listing has no price" };
  }
  if (!listing.product_id) {
    return { ok: false, reason: "that listing is not attached to a product, so there is nowhere to link to" };
  }
  return { ok: true };
}

export interface PhotoChoice {
  urls: string[];
  /** Which tier the photos came from, so review knows what it is looking at. */
  source: "product" | "listing";
}

/**
 * The product's photography, falling back to the listing's own.
 *
 * Product first, as asked. The fallback matters: of 1,649 live listings, 52
 * have no usable product photo but do have seller photos, and refusing those
 * would lose a post over which table the picture sits in.
 */
export function choosePhotos(product: ProductRow, listing: ListingRow): PhotoChoice {
  const fromProduct = productImages(product).renderable;
  if (fromProduct.length > 0) return { urls: fromProduct, source: "product" };
  return { urls: imageUrls(listing.images), source: "listing" };
}

export interface Cheaper {
  /** Lowest live price on the same product, in pence, before the buyer fee. */
  lowestCents: number;
  /** How many other live listings that product has. */
  others: number;
}

/**
 * Is one of the other live listings on this product cheaper than the one being
 * featured? Null when this is the cheapest, or the only one.
 */
export function cheaperElsewhere(
  chosenCents: number,
  otherLivePrices: number[],
): Cheaper | null {
  const cheaper = otherLivePrices.filter((p) => p > 0 && p < chosenCents);
  if (cheaper.length === 0) return null;
  return { lowestCents: Math.min(...cheaper), others: otherLivePrices.length };
}

/** Stable identity: one listing, posted once. */
export function subjectRefFor(listingId: string): string {
  return `drop:${listingId.trim().toLowerCase()}`;
}

export async function runKickioDrop(input: KickioDropInput): Promise<RecipeResult> {
  const parsed = listingIdFromUrl(input.url);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const { data: listingData, error: listingError } = await kickio()
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("id", parsed.id)
    .maybeSingle();

  if (listingError) return { ok: false, reason: `Kickio lookup failed: ${listingError.message}` };
  if (!listingData) {
    return {
      ok: false,
      reason: "No listing on Kickio with that id. Check the link is a current listing.",
      diagnostics: { listingId: parsed.id },
    };
  }

  const listing = listingData as unknown as ListingRow;
  const live = liveVerdict(listing);
  if (!live.ok) {
    return {
      ok: false,
      reason: `Cannot promote it: ${live.reason}.`,
      diagnostics: { listingId: listing.id, status: listing.status },
    };
  }

  const { data: productData, error: productError } = await kickio()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("id", listing.product_id!)
    .maybeSingle();

  if (productError) return { ok: false, reason: `Kickio lookup failed: ${productError.message}` };
  if (!productData) {
    return { ok: false, reason: "That listing points at a product Kickio no longer has." };
  }

  const product = productData as unknown as ProductRow;
  if (product.deleted_at !== null || product.status !== "active") {
    return {
      ok: false,
      reason: "The product behind that listing is not live on Kickio, so the post would link to nothing.",
      diagnostics: { productStatus: product.status },
    };
  }
  if (!product.slug) {
    return { ok: false, reason: "That product has no slug, so there is no page to link to." };
  }

  const photos = choosePhotos(product, listing);
  if (photos.urls.length === 0) {
    return {
      ok: false,
      reason: "Neither the product nor the listing has a photo the card can use.",
      diagnostics: { productId: product.id },
    };
  }

  // Every other live listing on the same product, to check the price the post
  // quotes against the page it sends people to.
  const { data: siblingData, error: siblingError } = await kickio()
    .from("listings")
    .select("id,price_cents")
    .eq("product_id", product.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .is("removed_at", null)
    .gt("stock_quantity", 0)
    .eq("consecutive_gone_count", 0)
    .limit(50);

  if (siblingError) return { ok: false, reason: `Kickio lookup failed: ${siblingError.message}` };
  const others = ((siblingData ?? []) as Array<{ id: string; price_cents: number | null }>)
    .filter((row) => row.id !== listing.id)
    .map((row) => row.price_cents ?? 0);
  const cheaper = cheaperElsewhere(listing.price_cents!, others);

  // The same fee the site adds, so the number on the card is the number at
  // checkout. buyerFeeSettings falls back to defaults on error rather than
  // failing the run - which is why the claim records which was used.
  const fee = await buyerFeeSettings();
  const priceCents = buyerPriceCents(listing.price_cents!, fee);
  const currency = listing.currency ?? "GBP";
  const price = formatPrice(priceCents, currency);

  // Rarity vocabulary, read from the listing first and the product second: a
  // seller describing their own copy as signed outranks the catalogue.
  const signals = readSignals({
    issue: listing.issue ?? product.issue,
    signed: listing.signed ?? product.signed,
    special_edition: listing.special_edition ?? product.special_edition,
    boxed_edition: listing.boxed_edition ?? product.boxed_edition,
    sleeves: listing.sleeves ?? product.sleeves,
  } as Parameters<typeof readSignals>[0]);

  const link = kickioUrl(product.slug);
  const condition = listing.condition ?? product.latest_condition ?? null;
  const size = listing.size ?? product.latest_size ?? null;

  const claims: Claim[] = [
    {
      statement: `${price} on Kickio`,
      value: priceCents / 100,
      source: "listings.price_cents plus the buyer protection fee from marketplace_settings",
      basis:
        `Seller's price ${formatPrice(listing.price_cents!, currency)} with buyer ` +
        `protection applied (${fee.percentBps / 100}% + ` +
        `${formatPrice(fee.fixedCents, currency)}), so it matches checkout`,
    },
    {
      statement: `Available to buy now`,
      value: true,
      source: "listings row: active, in stock, not withdrawn, stock check clean",
      basis: "Checked at the moment the draft was made, not when it is posted",
    },
  ];
  if (condition) {
    claims.push({
      statement: `Condition: ${condition}`,
      value: condition,
      source: listing.condition ? "listings.condition" : "products.latest_condition",
    });
  }
  if (size) {
    claims.push({
      statement: `Size ${size}`,
      value: size,
      source: listing.size ? "listings.size" : "products.latest_size",
    });
  }
  if (signals.labels.length > 0) {
    claims.push({
      statement: signals.labels.join(", "),
      value: signals.labels.join(", "),
      source: "issue / signed / special_edition / boxed_edition / sleeves, matched to an allowlist",
      basis: "Recorded attributes, not a judgement about rarity",
    });
  }
  if (cheaper) {
    // A claim rather than a note, so it sits with the numbers a reviewer
    // checks before approving rather than in prose they might skim.
    claims.push({
      statement:
        `WARNING: a cheaper listing for this shirt is live at ` +
        `${formatPrice(buyerPriceCents(cheaper.lowestCents, fee), currency)}`,
      value: cheaper.lowestCents / 100,
      source: "other active listings on the same product",
      basis:
        "The post links to the product page, which leads with the cheapest listing. " +
        "Post it anyway if you are featuring this particular one on purpose.",
    });
  }

  return {
    ok: true,
    candidate: {
      subjectRef: subjectRefFor(listing.id),
      headline: `${product.name ?? listing.title ?? "Kickio Drop"} — ${price}`,
      sourceData: {
        subject: product.name ?? listing.title,
        title: product.name ?? listing.title,
        price,
        price_cents: priceCents,
        currency,
        condition,
        size,
        team: product.team,
        season: product.season,
        shirt_type: product.shirt_type,
        manufacturer: listing.manufacturer ?? product.manufacturer,
        player_name: listing.player_name ?? product.player_name,
        number: listing.number ?? product.number,
        colour: product.colour,
        rarity_signals: signals.labels,
        accepts_offers: listing.accepts_offers === true,
        // The seller's own words. Flagged as theirs so the brief can use it as
        // colour without the copy passing it off as Kickio's description.
        seller_blurb: listing.description?.trim() || null,
        // Product page, not the listing: a listing sells and 404s.
        kickio_url: link,
        photo_source: photos.source,
        admin_note: input.note?.trim() || null,
        cheaper_listing: cheaper
          ? { lowest: formatPrice(buyerPriceCents(cheaper.lowestCents, fee), currency), others: cheaper.others }
          : null,
        scope_note:
          "Live listing, promoted. The link goes to the product page rather than the " +
          "listing, so it survives this one selling.",
      },
      claims,
      images: photos.urls,
    },
  };
}

export const KICKIO_DROP_BRIEF = `**Kickio Drops** - one shirt, live on Kickio, that someone should buy.

This is a sell. Make a collector want to open the link. Lead with whatever makes
this shirt worth stopping for - the era, the kit, the player, the sponsor, a
rarity signal from the facts - then the price, then the ask.

\`seller_blurb\` is the seller's own description. Use it for a detail you could
not otherwise know, and never present it as Kickio's own words or as verified.

Four hard rules:
- The shirt is AVAILABLE NOW. Never write "sold", "gone" or "was".
- Quote \`price\` exactly as given. It already includes buyer protection, so do
  not adjust it, round it, or describe it as a starting price.
- Include the link from \`kickio_url\` in the post text.
- Do not invent condition, size, provenance or scarcity. If it is not in the
  facts, it does not go in the post. One shirt being listed is not evidence it
  is rare.`;
