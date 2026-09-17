"use server";

import { revalidatePath } from "next/cache";
import { runRecipe, type RunOutcome } from "@/lib/run-recipe.ts";

/**
 * Trigger a recipe by hand. Until now the only way in was an unauthenticated
 * POST to /api/run/<key>, which is not something a reviewer can do from a phone.
 */
export async function runNow(key: string): Promise<RunOutcome> {
  const outcome = await runRecipe(key, "manual");
  revalidatePath("/runs");
  revalidatePath("/");
  return outcome;
}
