"use server";

import { revalidatePath } from "next/cache";
import { createKickioDropDraft, type RunOutcome } from "@/lib/run-recipe.ts";
import { kickio } from "@/lib/kickio/client.ts";
import { listingIdFromUrl } from "@/lib/kickio/listing-url.ts";
import { buyerFeeSettings, buyerPriceCents, formatPrice } from "@/lib/kickio/pricing.ts";
import { imageUrls, kickioUrl } from "@/lib/recipes/grail-of-the-day.ts";
import { productImages, type ProductRow } from "@/lib/recipes/grail-sale.ts";
import {
  liveVerdict,
  cheaperElsewhere,
  type KickioDropInput,
  type ListingRow,
} from "@/lib/recipes/kickio-drop.ts";

export interface DropPreview {
  listingId: string;
  title: string;
  photo: string | null;
  photoSource: "product" | "listing";
  price: string;
  facts: Array<{ label: string; value: string }>;
  kickioUrl: string;
  /** Set when a cheaper live listing exists on the same product. */
  warning: string | null;
}

/**
 * Step one: show the admin what the link resolved to, before spending a Claude
 * call on it.
 *
 * Deliberately duplicates the recipe's checks rather than calling it: this runs
 * on every keystroke-ish paste and must be cheap, and a preview that could
 * create a draft would make the Generate button ambiguous.
 */
export async function lookupListing(
  url: string,
): Promise<{ ok: true; preview: DropPreview } | { ok: false; reason: string }> {
  const parsed = listingIdFromUrl(url);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const { data, error } = await kickio()
    .from("listings")
    .select(
      "id,product_id,title,description,size,condition,price_cents,currency,images,status," +
        "deleted_at,removed_at,removed_reason,stock_quantity,consecutive_gone_count,accepts_offers",
    )
    .eq("id", parsed.id)
    .maybeSingle();

  if (error) return { ok: false, reason: `Kickio lookup failed: ${error.message}` };
  if (!data) return { ok: false, reason: "No listing on Kickio with that id." };

  const listing = data as unknown as ListingRow;
  const live = liveVerdict(listing);
  if (!live.ok) return { ok: false, reason: `Cannot promote it: ${live.reason}.` };

  const { data: productData, error: productError } = await kickio()
    .from("products")
    .select(
      "id,slug,name,team,season,shirt_type,manufacturer,player_name,number,issue,signed," +
        "special_edition,boxed_edition,sleeves,colour,latest_condition,latest_size,status," +
        "deleted_at,primary_image_url,images",
    )
    .eq("id", listing.product_id!)
    .maybeSingle();

  if (productError) return { ok: false, reason: `Kickio lookup failed: ${productError.message}` };
  if (!productData) return { ok: false, reason: "That listing points at a product Kickio no longer has." };

  const product = productData as unknown as ProductRow;
  const fromProduct = productImages(product).renderable;
  const photos = fromProduct.length > 0 ? fromProduct : imageUrls(listing.images);
  const photoSource: "product" | "listing" = fromProduct.length > 0 ? "product" : "listing";

  const { data: siblings } = await kickio()
    .from("listings")
    .select("id,price_cents")
    .eq("product_id", product.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .is("removed_at", null)
    .gt("stock_quantity", 0)
    .eq("consecutive_gone_count", 0)
    .limit(50);

  const others = ((siblings ?? []) as Array<{ id: string; price_cents: number | null }>)
    .filter((row) => row.id !== listing.id)
    .map((row) => row.price_cents ?? 0);
  const cheaper = cheaperElsewhere(listing.price_cents ?? 0, others);

  const fee = await buyerFeeSettings();
  const currency = listing.currency ?? "GBP";
  const price = formatPrice(buyerPriceCents(listing.price_cents ?? 0, fee), currency);

  const facts: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value && String(value).trim()) facts.push({ label, value: String(value) });
  };
  add("Club", product.team);
  add("Season", product.season);
  add("Type", product.shirt_type);
  add("Maker", product.manufacturer ?? null);
  add("Condition", listing.condition ?? product.latest_condition);
  add("Size", listing.size ?? product.latest_size);
  if (listing.accepts_offers) facts.push({ label: "Offers", value: "Accepted" });

  return {
    ok: true,
    preview: {
      listingId: listing.id,
      title: product.name ?? listing.title ?? "Untitled",
      photo: photos[0] ?? null,
      photoSource,
      price,
      facts,
      kickioUrl: kickioUrl(product.slug) ?? "",
      warning: cheaper
        ? `A cheaper listing for this shirt is live at ` +
          `${formatPrice(buyerPriceCents(cheaper.lowestCents, fee), currency)}. ` +
          `The post links to the product page, which leads with the cheapest one, ` +
          `so a reader may see that price first. Post it anyway if you are ` +
          `featuring this particular listing on purpose.`
        : null,
    },
  };
}

export async function generateKickioDrop(input: KickioDropInput): Promise<RunOutcome> {
  const outcome = await createKickioDropDraft(input);
  revalidatePath("/");
  revalidatePath("/runs");
  return outcome;
}
