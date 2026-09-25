"use server";

import { revalidatePath } from "next/cache";
import { createPriceHistoryDraft, type RunOutcome } from "@/lib/run-recipe.ts";

export async function postPriceHistory(productId: string): Promise<RunOutcome> {
  const outcome = await createPriceHistoryDraft(productId);
  revalidatePath("/price-history");
  revalidatePath("/");
  return outcome;
}
