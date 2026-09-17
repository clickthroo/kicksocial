/**
 * Grail Sale - one notable sale, entered by an admin.
 *
 * WHY THIS EXISTS ALONGSIDE sold_this_week
 *
 * `sold_this_week` reads Kickio's `sales_history` and is blocked: the table has
 * no SELECT policy, so the engine sees zero rows (docs/unblocking-sold-this-week.md).
 * This recipe needs no new database access at all. The admin pastes the Kickio
 * link of something that sold and types what it went for.
 *
 * WHERE EACH FACT COMES FROM, AND WHY THAT DISTINCTION IS KEPT VISIBLE
 *
 * Everything describing the shirt - name, club, season, manufacturer, the rarity
 * attributes, the photography - is read from Kickio's own `products` row. None
 * of it is parsed out of a web page or inferred from the URL.
 *
 * The PRICE is different: it is typed by a person. Every other recipe can point
 * a reviewer at the column a number came from; this one cannot. So the claim
 * says so in as many words rather than dressing an entered figure up as a
 * verified one. A reviewer checking this post is checking the admin, not the
 * database, and should be able to see that.
 *
 * No buyer protection fee is applied. Elsewhere the engine adds it because
 * `listings.price_cents` is an asking price and the site shows more. Here the
 * admin enters what the shirt actually sold for, so adding a fee would invent
 * money that never changed hands.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { readSignals, imageUrls, kickioUrl } from "./grail-of-the-day.ts";
import { cleanValue, cleanFacts } from "../kickio/values.ts";
import { formatPrice } from "../kickio/pricing.ts";
import { slugFromUrl } from "../kickio/product-url.ts";
import { shirtColour } from "../render/dominant-colour.ts";

export interface ProductRow {
  id: string;
  slug: string | null;
  name: string | null;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  manufacturer: string | null;
  player_name: string | null;
  number: string | null;
  issue: string | null;
  signed: string | null;
  special_edition: string | null;
  boxed_edition: string | null;
  sleeves: string | null;
  colour: string | null;
  latest_condition: string | null;
  latest_size: string | null;
  status: string | null;
  deleted_at: string | null;
  primary_image_url: string | null;
  images: unknown;
}

const PRODUCT_COLUMNS =
  "id,slug,name,team,season,shirt_type,manufacturer,player_name,number,issue,signed," +
  "special_edition,boxed_edition,sleeves,colour,latest_condition,latest_size,status," +
  "deleted_at,primary_image_url,images";

export interface GrailSaleInput {
  /** A kickio.com product link, or a bare slug. */
  url: string;
  /** What it actually sold for, in pence. Entered by the admin. */
  priceCents: number;
  /** ISO date. Defaults to today. */
  soldAt?: string;
  /** Overrides the product's `latest_condition` when the admin knows better. */
  condition?: string;
  size?: string;
  /** Free text from the admin, passed to the copy as context, never as fact. */
  note?: string;
}

export interface LookupResult {
  product: ProductRow;
  images: string[];
  /** Photos on the record that the card cannot render (WebP), for diagnostics. */
  unrenderableImages: number;
}

/**
 * Photos on a product: the gallery first, then the primary image.
 *
 * `products.images` is frequently an empty array while `primary_image_url` is
 * populated - the England third shirt is one - so reading only the gallery
 * would report "no photo" for products that plainly have one.
 */
export function productImages(product: ProductRow): { renderable: string[]; rejected: number } {
  const gallery = Array.isArray(product.images) ? (product.images as unknown[]) : [];
  const all = [
    ...gallery
      .map((e) =>
        typeof e === "string"
          ? e
          : e && typeof e === "object" && "url" in e
            ? String((e as { url: unknown }).url)
            : null,
      )
      .filter((u): u is string => !!u && u.startsWith("http")),
    ...(product.primary_image_url ? [product.primary_image_url] : []),
  ];
  const unique = [...new Set(all)];
  const renderable = imageUrls(unique);
  return { renderable, rejected: unique.length - renderable.length };
}

/** Look a product up by pasted URL. Read-only, as everything Kickio is. */
export async function lookupProduct(
  url: string,
): Promise<{ ok: true; value: LookupResult } | { ok: false; reason: string }> {
  const parsed = slugFromUrl(url);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const { data, error } = await kickio()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("slug", parsed.slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { ok: false, reason: `Kickio lookup failed: ${error.message}` };
  if (!data) {
    return {
      ok: false,
      reason: `No product on Kickio with the slug "${parsed.slug}". Check the link opens on the site.`,
    };
  }

  const product = data as unknown as ProductRow;
  const { renderable, rejected } = productImages(product);
  return { ok: true, value: { product, images: renderable, unrenderableImages: rejected } };
}

/** A printed name is a printed name, not a player-issue shirt. */
function printingLabel(product: ProductRow): string | null {
  const name = cleanValue(product.player_name);
  const number = cleanValue(product.number);
  if (name && number) return `${name} ${number}`;
  return name ?? (number ? `#${number}` : null);
}

export function buildCandidate(
  lookup: LookupResult,
  input: GrailSaleInput,
  /** Sampled from the photo, for the Sweep style. Absent is fine. */
  colour?: { hex: string; deep: string } | null,
): RecipeResult {
  const { product, images } = lookup;

  if (images.length === 0) {
    // Satori renders WebP as an empty frame with no error, so a post with no
    // usable photo must be refused here rather than reviewed as a black hole.
    return {
      ok: false,
      reason:
        `"${product.name ?? product.slug}" has no photo the card can render ` +
        `(JPEG or PNG). ${lookup.unrenderableImages} photo(s) on the record are ` +
        `in a format the renderer cannot decode.`,
      diagnostics: { slug: product.slug, unrenderableImages: lookup.unrenderableImages },
    };
  }

  if (!Number.isFinite(input.priceCents) || input.priceCents <= 0) {
    return { ok: false, reason: "Enter the price it sold for." };
  }

  const condition = cleanValue(input.condition ?? product.latest_condition);
  const signals = readSignals({
    issue: product.issue,
    signed: product.signed,
    special_edition: product.special_edition,
    boxed_edition: product.boxed_edition,
    condition,
  });

  const price = formatPrice(input.priceCents, "GBP");
  const title = cleanValue(product.name) ?? [product.season, product.team, product.shirt_type]
    .filter(Boolean)
    .join(" ");
  const soldAt = input.soldAt || new Date().toISOString().slice(0, 10);

  const claims: Claim[] = [
    {
      statement: `Sold for ${price}`,
      value: input.priceCents / 100,
      // Said plainly. Every other recipe names a column here; this one cannot,
      // and a reviewer needs to know which kind of number they are checking.
      source: "entered by an admin, not read from Kickio",
      basis: "The sale price as recorded by whoever added this post",
    },
    {
      statement: `${title} sold on ${soldAt}`,
      value: soldAt,
      source: input.soldAt ? "entered by an admin" : "today's date",
    },
  ];

  const printing = printingLabel(product);
  if (printing) {
    claims.push({
      statement: `Printed ${printing}`,
      value: printing,
      source: `products.player_name / products.number (${product.slug})`,
      basis: "A printed name, not a player-issue shirt",
    });
  }

  return {
    ok: true,
    candidate: {
      // One post per sale: the same shirt can genuinely sell twice, so the date
      // is part of the identity. Keying on the slug alone would make a second
      // sale look like a duplicate.
      subjectRef: `${product.slug}@${soldAt}`,
      headline: `Sold: ${title} — ${price}`,
      sourceData: cleanFacts({
        title,
        price,
        sold_at: soldAt,
        team: product.team,
        season: product.season,
        shirt_type: product.shirt_type,
        manufacturer: product.manufacturer,
        sleeves: product.sleeves,
        colour: product.colour,
        condition,
        size: cleanValue(input.size ?? product.latest_size),
        printing,
        rarity_signals: signals.labels,
        kickio_url: kickioUrl(product.slug),
        // Only used to colour a backdrop. It describes the photograph, never
        // the shirt, and is never written into copy.
        shirt_colour: colour ?? undefined,
        admin_note: cleanValue(input.note),
        // New attribute vocabulary surfaces in review rather than becoming a
        // confident false claim in copy.
        unknown_attribute_values: signals.unknown,
        price_provenance: "entered by an admin; not read from Kickio's database",
      }),
      claims,
      images,
    },
  };
}

/** Look up, verify and build in one call. */
export async function runGrailSale(input: GrailSaleInput): Promise<RecipeResult> {
  const lookup = await lookupProduct(input.url);
  if (!lookup.ok) return { ok: false, reason: lookup.reason };

  // Allowed to fail: a neutral backdrop is a fine post, a post that did not
  // happen because a colour sample threw is not.
  const colour = lookup.value.images[0] ? await shirtColour(lookup.value.images[0]) : null;
  return buildCandidate(lookup.value, input, colour);
}

export const GRAIL_SALE_BRIEF = `**Grail Sale** - one shirt that has just sold, on Kickio.

The hook is the sale itself: this shirt is gone, and here is what it went for.
That is a fact about the market a collector can use, and a quiet signal that
things sell here.

Lead with whatever makes this shirt worth a collector's attention - the era, the
club, the issue type, the printing, or the price itself. The rarity signals in
the facts tell you which is strongest.

Three hard rules:
- It is SOLD. Never invite anyone to buy it, never imply it is still available,
  and never write anything that reads as a listing.
- The price is the price in the claims, unchanged. Do not round it, re-express
  it, or describe it as a record, a bargain or a high - you have no data on how
  it compares to anything.
- Do not speculate about who bought it or why.`;
