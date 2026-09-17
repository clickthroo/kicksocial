"use server";

import { revalidatePath } from "next/cache";
import { createJustSoldDraft } from "@/lib/run-recipe.ts";
import { lookupProduct, type JustSoldInput } from "@/lib/recipes/just-sold.ts";
import type { RunOutcome } from "@/lib/run-recipe.ts";

export interface ProductPreview {
  slug: string;
  title: string;
  photo: string | null;
  unrenderableImages: number;
  facts: Array<{ label: string; value: string }>;
  kickioUrl: string;
}

/**
 * Step one: show the admin what the link resolved to.
 *
 * Separate from generating on purpose. Confirming the shirt before writing means
 * a wrong link costs a database read rather than a Claude call and a draft that
 * has to be rejected.
 */
export async function lookupForForm(
  url: string,
): Promise<{ ok: true; preview: ProductPreview } | { ok: false; reason: string }> {
  const result = await lookupProduct(url);
  if (!result.ok) return result;

  const { product, images, unrenderableImages } = result.value;
  const facts: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: string | null) => {
    if (value && value.trim()) facts.push({ label, value });
  };
  add("Club", product.team);
  add("Season", product.season);
  add("Type", product.shirt_type);
  add("Maker", product.manufacturer);
  add("Sleeves", product.sleeves);
  add("Condition", product.latest_condition);
  add("Size", product.latest_size);

  return {
    ok: true,
    preview: {
      slug: product.slug ?? "",
      title: product.name ?? product.slug ?? "Untitled",
      photo: images[0] ?? null,
      unrenderableImages,
      facts,
      kickioUrl: `https://kickio.com/marketplace/${product.slug ?? ""}`,
    },
  };
}

export async function generateJustSold(input: JustSoldInput): Promise<RunOutcome> {
  const outcome = await createJustSoldDraft(input);
  revalidatePath("/");
  revalidatePath("/runs");
  return outcome;
}
