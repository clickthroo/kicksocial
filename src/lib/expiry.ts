import { engine } from "./engine/client.ts";
import { hasExpired, perishKind } from "./engine/freshness.ts";

/**
 * Clearing out drafts nobody got to.
 *
 * WHY THE QUEUE NEEDS THIS. Four posts a day is the ceiling, and the recipes
 * produce close to three, so a week away leaves twenty drafts waiting - eleven
 * of them describing listings that may have sold or roundups whose week has
 * gone. Reviewing that is worse than reviewing nothing: the interesting posts
 * are buried among ones that cannot go out, and the pile is a standing
 * argument for not opening the tool at all.
 *
 * WHY NOT REJECT THEM. Rejecting is a judgement - "not this shirt" - and the
 * engine treats it as permanent, so a swept-up Grail would take its shirt out
 * of circulation for good over a week's holiday. Expiring says only that
 * nobody got to it, and history.ts frees the subject again after a month.
 *
 * WHY NOT DELETE THEM. The run log would then disagree with the drafts table
 * about what the engine produced, and "where did Tuesday's post go" would have
 * no answer.
 */
export interface ExpirySweep {
  expired: number;
  /** What went, so the cron response says it rather than only counting it. */
  cleared: Array<{ id: string; recipe_key: string; headline: string | null }>;
}

export async function expireStaleDrafts(now: number = Date.now()): Promise<ExpirySweep> {
  const { data, error } = await engine()
    .from("post_drafts")
    .select("id,recipe_key,headline,created_at")
    .eq("status", "draft");

  if (error) throw new Error(`Expiry sweep failed to read the queue: ${error.message}`);

  const rows = (data ?? []) as Array<{
    id: string;
    recipe_key: string;
    headline: string | null;
    created_at: string;
  }>;

  // Decided here rather than in SQL: the thresholds differ per recipe and they
  // are the same ones the card warns with, so there is one table, not two.
  const due = rows.filter((row) => hasExpired(row.created_at, row.recipe_key, now));
  if (due.length === 0) return { expired: 0, cleared: [] };

  const { error: updateError } = await engine()
    .from("post_drafts")
    .update({
      status: "expired",
      reviewed_at: new Date(now).toISOString(),
      notes: "Cleared automatically: nobody decided on it before it went out of date.",
    })
    .in("id", due.map((row) => row.id));

  if (updateError) throw new Error(`Expiry sweep failed to write: ${updateError.message}`);

  return {
    expired: due.length,
    cleared: due.map(({ id, recipe_key, headline }) => ({ id, recipe_key, headline })),
  };
}

/** Exposed for the settings screen, so the rule is readable without the code. */
export function expiryDescription(recipeKey: string): string {
  const kind = perishKind(recipeKey);
  if (kind === "none") return "Never clears itself - the sale it describes already happened.";
  return kind === "listing"
    ? "Clears itself after 6 days: it points at a listing that can sell."
    : "Clears itself after 14 days: it describes a stretch of time that has passed.";
}

/**
 * What the sweep took recently, so the queue can say so.
 *
 * "Where did Tuesday's post go" needs an answer on the screen it went missing
 * from. Without this the tidying is invisible, and invisible tidying is
 * indistinguishable from losing things.
 */
export async function recentlyExpired(days = 7): Promise<number> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { count, error } = await engine()
    .from("post_drafts")
    .select("id", { count: "exact", head: true })
    .eq("status", "expired")
    .gte("reviewed_at", since);

  if (error) throw new Error(`Counting cleared drafts failed: ${error.message}`);
  return count ?? 0;
}
