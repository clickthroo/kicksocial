"use server";

import { revalidatePath } from "next/cache";
import { createWhoAmIDraft, type RunOutcome } from "@/lib/run-recipe.ts";

export async function postWhoAmI(playerKey: string): Promise<RunOutcome> {
  const outcome = await createWhoAmIDraft(playerKey);
  revalidatePath("/who-am-i");
  revalidatePath("/");
  return outcome;
}
