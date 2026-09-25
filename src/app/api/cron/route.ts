import { NextResponse } from "next/server";
import { runRecipe } from "@/lib/run-recipe.ts";
import { expireStaleDrafts, type ExpirySweep } from "@/lib/expiry.ts";
import { checkTriggerAuth } from "@/lib/http-auth.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily trigger. Cadence per the brief: at least one post per day across
 * platforms, so Grail runs daily and the weekly recipes are spread across
 * different days rather than stacking on one.
 */
function recipesForToday(date: Date): string[] {
  const keys = ["grail_of_the_day"];
  const day = date.getUTCDay(); // 0 Sun .. 6 Sat
  if (day === 2) keys.push("price_trends");   // Tuesday
  if (day === 3) keys.push("club_archive");   // Wednesday
  if (day === 4) keys.push("market_index");
  if (day === 4) keys.push("value_pick");   // Thursday
  if (day === 5) keys.push("sold_this_week"); // Friday
  // Saturday. Usually skips - Featured Collection only posts when the list has
  // actually moved - so it is cheap to ask every week.
  if (day === 6) keys.push("featured_collection");
  // Sunday. Collector Spotlight leads because it needs nobody to have finished
  // anything; the progress post is the rarer, better one when it does fire.
  if (day === 0) keys.push("collector_spotlight", "collector_set_progress");
  // Monday. Featured Set is the no-personal-data sibling of Featured
  // Collection, and the only one of the three that can run before the
  // collector grant lands.
  if (day === 1) keys.push("featured_set");
  // First Monday of the month. Monthly to start, per the brief - a month is
  // long enough that one recorded sale does not swing the curve, and it echoes
  // the Monday collection email users already get.
  if (day === 1 && date.getUTCDate() <= 7) keys.push("collection_index");
  return keys;
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = checkTriggerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Before generating, not after: a draft that ages out today frees its
  // subject, and today's run should be allowed to pick that subject up.
  //
  // Tidying must never cost a post, so a failed sweep is reported and stepped
  // over rather than thrown - the day's recipes still run.
  let sweep = { expired: 0, cleared: [] as ExpirySweep["cleared"], error: null as string | null };
  try {
    sweep = { ...(await expireStaleDrafts()), error: null };
  } catch (err) {
    sweep.error = (err as Error).message;
  }

  const keys = recipesForToday(new Date());
  // Sequential: these hit the same rate limits and the volume is tiny.
  const results = [];
  for (const key of keys) {
    results.push(await runRecipe(key, "cron"));
  }

  return NextResponse.json({ swept: sweep, ran: results.length, results });
}
