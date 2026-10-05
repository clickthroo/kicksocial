"use server";

import { revalidatePath } from "next/cache";
import { createPhotoProdDraft, type RunOutcome } from "@/lib/run-recipe.ts";
import { resolveShirt, type PhotoProdShirt } from "@/lib/recipes/photo-prod.ts";
import type { PhotoProdInput } from "@/lib/recipes/photo-prod.ts";

/**
 * Step one: show what the link resolved to, before a copy generation is spent
 * on it.
 *
 * The same two-step shape as Drops and Grail Sale. A preview that could also
 * create a draft would make the button after it ambiguous, so this only ever
 * reads.
 */
export async function lookupShirt(
  url: string,
): Promise<{ ok: true; shirt: PhotoProdShirt } | { ok: false; reason: string }> {
  return resolveShirt(url);
}

export async function postPhotoProd(input: PhotoProdInput): Promise<RunOutcome> {
  const outcome = await createPhotoProdDraft(input);
  revalidatePath("/photoprod");
  revalidatePath("/runs");
  revalidatePath("/");
  return outcome;
}
