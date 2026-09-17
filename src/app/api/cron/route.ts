import { NextResponse } from "next/server";
import { runRecipe } from "@/lib/run-recipe.ts";
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
  if (day === 4) keys.push("market_index");   // Thursday
  if (day === 5) keys.push("sold_this_week"); // Friday
  return keys;
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = checkTriggerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const keys = recipesForToday(new Date());
  // Sequential: these hit the same rate limits and the volume is tiny.
  const results = [];
  for (const key of keys) {
    results.push(await runRecipe(key, "cron"));
  }

  return NextResponse.json({ ran: results.length, results });
}
