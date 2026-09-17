"use server";

import { revalidatePath } from "next/cache";
import { engine } from "@/lib/engine/client.ts";

export interface RecipeUpdate {
  key: string;
  enabled: boolean;
  selection: Record<string, unknown>;
  prompt_template: string;
}

/**
 * Persist a recipe's configuration. Selection thresholds and the copy brief are
 * data, not code, so they can be tuned here without a redeploy.
 */
export async function saveRecipe(update: RecipeUpdate): Promise<void> {
  const { error } = await engine()
    .from("recipes")
    .update({
      enabled: update.enabled,
      selection: update.selection,
      prompt_template: update.prompt_template,
      updated_at: new Date().toISOString(),
    })
    .eq("key", update.key);

  if (error) throw new Error(`Saving recipe failed: ${error.message}`);
  revalidatePath("/admin");
  revalidatePath("/");
}
