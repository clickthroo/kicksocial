"use server";

import { revalidatePath } from "next/cache";
import { setDraftPhoto, setDraftStatus, setDraftStyle } from "@/lib/run-recipe.ts";
import type { CardStyle } from "@/lib/render/styles.ts";

export async function approveDraft(id: string): Promise<void> {
  await setDraftStatus(id, "approved");
  revalidatePath("/");
}

export async function rejectDraft(id: string, notes?: string): Promise<void> {
  await setDraftStatus(id, "rejected", notes);
  revalidatePath("/");
}

/**
 * Change a draft's card style after the fact. The whole point is that a look is
 * a decision made looking at the thing, not one committed at generation time.
 */
export async function chooseStyle(id: string, style: CardStyle): Promise<void> {
  await setDraftStyle(id, style);
  revalidatePath("/");
  revalidatePath("/publish");
}

/**
 * Put a different picture on a draft, in place.
 *
 * Returns the new list rather than nothing, so the card can redraw from what
 * was actually saved instead of from what it hoped had been.
 */
export async function replacePhoto(
  id: string,
  url: string,
  index: number | "append",
): Promise<string[]> {
  const images = await setDraftPhoto(id, url, index);
  revalidatePath("/");
  revalidatePath("/publish");
  return images;
}
