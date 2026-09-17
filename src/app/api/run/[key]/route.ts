import { NextResponse } from "next/server";
import { runRecipe } from "@/lib/run-recipe.ts";
import { checkTriggerAuth } from "@/lib/http-auth.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Run a single recipe on demand, for testing a recipe without waiting for cron.
 *
 * Authenticated: this is a public URL that spends Anthropic credits on every
 * call, and it was open to anyone who guessed the path.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const auth = checkTriggerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { key } = await params;
  const result = await runRecipe(key, "manual");
  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}
