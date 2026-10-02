"use server";

import { revalidatePath } from "next/cache";
import { createBattleDraft, type RunOutcome } from "@/lib/run-recipe.ts";
import { searchShirts, type Fighter } from "@/lib/recipes/battle.ts";

/**
 * Search runs as a server action rather than a route handler because it reads
 * Kickio, and the Kickio credential must never be in a browser bundle.
 */
export async function findShirts(query: string): Promise<Fighter[]> {
  return searchShirts(query);
}

export async function postBattle(leftId: string, rightId: string): Promise<RunOutcome> {
  const outcome = await createBattleDraft(leftId, rightId);
  revalidatePath("/battle");
  revalidatePath("/");
  return outcome;
}
