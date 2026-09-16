import { engine } from "../engine/client.ts";

/**
 * Subjects this recipe has already posted about within the window, so the feed
 * doesn't repeat itself. Reads the engine's own draft history - never Kickio.
 */
export async function recentlyFeatured(
  recipeKey: string,
  days: number,
): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await engine()
    .from("post_drafts")
    .select("subject_ref")
    .eq("recipe_key", recipeKey)
    .gte("created_at", since)
    // A rejected draft was never published, so its subject is fair game again.
    .neq("status", "rejected");

  if (error) throw new Error(`Cooldown lookup failed: ${error.message}`);
  return new Set((data ?? []).map((r) => r.subject_ref as string));
}
