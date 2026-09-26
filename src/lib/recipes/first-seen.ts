/**
 * When each subject first became eligible, so a picker can say what is new.
 *
 * The lists on /who-am-i and /price-history re-test themselves against the
 * live catalogue on every load, which means they move on their own as shirts
 * arrive. That is the point, and it is also the problem: "19 ready of 71" does
 * not tell you whether today's 19 are last week's 19. This records the first
 * time we saw each subject qualify so the difference is visible.
 *
 * Engine state, in the engine's own database. Nothing here touches Kickio.
 */
import { engine } from "../engine/client.ts";

/** How long a subject wears the badge after we first see it. */
export const NEW_FOR_DAYS = 7;

const TABLE = "subject_first_seen";

export function isNew(firstSeenAt: string | null | undefined, now = Date.now()): boolean {
  if (!firstSeenAt) return false;
  const seen = Date.parse(firstSeenAt);
  if (Number.isNaN(seen)) return false;
  // A date in the future is a clock problem, not a new arrival. Treat it as
  // new rather than as ancient, which is what a bare subtraction would do.
  return now - seen < NEW_FOR_DAYS * 86_400_000;
}

/** How many of these are new, for the count in a page header. */
export function countNew(
  firstSeen: ReadonlyMap<string, string>,
  refs: readonly string[],
  now = Date.now(),
): number {
  return refs.filter((ref) => isNew(firstSeen.get(ref), now)).length;
}

/**
 * Records any subject we have not seen before and returns the dates for all of
 * them.
 *
 * Insert-only by design. The row is never updated, because a cooldown takes a
 * subject off the list for months and then hands it back: refreshing the date
 * on its return would badge every recycled subject as new. `ignoreDuplicates`
 * does that in one statement and is safe against two page loads racing.
 */
export async function recordFirstSeen(
  recipeKey: string,
  subjectRefs: readonly string[],
): Promise<Map<string, string>> {
  if (subjectRefs.length === 0) return new Map();

  const { error: insertError } = await engine()
    .from(TABLE)
    .upsert(
      subjectRefs.map((subject_ref) => ({ recipe_key: recipeKey, subject_ref })),
      { onConflict: "recipe_key,subject_ref", ignoreDuplicates: true },
    );
  if (insertError) throw new Error(`Recording new subjects failed: ${insertError.message}`);

  const { data, error } = await engine()
    .from(TABLE)
    .select("subject_ref,first_seen_at")
    .eq("recipe_key", recipeKey)
    .in("subject_ref", subjectRefs as string[]);
  if (error) throw new Error(`Reading first-seen dates failed: ${error.message}`);

  const seen = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ subject_ref: string; first_seen_at: string }>) {
    seen.set(row.subject_ref, row.first_seen_at);
  }
  return seen;
}
