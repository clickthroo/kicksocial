import { engine } from "../engine/client.ts";

/**
 * Subjects this recipe has already covered within the window, so the feed does
 * not repeat itself. Reads the engine's own draft history - never Kickio.
 *
 * Rejected drafts count. Releasing a subject on rejection, as an earlier version
 * did, hands the same subject straight back on the next run - the reviewer would
 * reject it again every time.
 *
 * Grail of the Day needs stronger treatment than this and uses `history.ts`
 * instead: its subjects are individual shirts, so a rejection blocks one
 * permanently. Here the subjects recur by nature (a club's price trend, a given
 * week's sales), so a rejection serves the normal cooldown and no longer.
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
    .gte("created_at", since);

  if (error) throw new Error(`Cooldown lookup failed: ${error.message}`);
  return new Set((data ?? []).map((r) => r.subject_ref as string));
}
