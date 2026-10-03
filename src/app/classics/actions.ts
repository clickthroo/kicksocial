"use server";

import { revalidatePath } from "next/cache";
import { createClassicDraft, type RunOutcome } from "@/lib/run-recipe.ts";
import type { ClassicInput } from "@/lib/recipes/classics.ts";

export async function postClassic(input: ClassicInput): Promise<RunOutcome> {
  const outcome = await createClassicDraft(input);
  revalidatePath("/classics");
  revalidatePath("/");
  return outcome;
}
