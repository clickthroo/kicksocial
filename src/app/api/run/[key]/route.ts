import { NextResponse } from "next/server";
import { runRecipe } from "@/lib/run-recipe.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Run a single recipe on demand, for testing a recipe without waiting for cron. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await params;
  const result = await runRecipe(key, "manual");
  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}
