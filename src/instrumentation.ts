/**
 * Every server error, written somewhere this project can actually read.
 *
 * WHY. A failed password change showed "Application error: a server-side
 * exception has occurred" and a digest, and nothing else: Next redacts server
 * error messages in production on purpose, so the message lives only in the
 * hosting platform's logs. Those logs are not readable from every seat, which
 * left a reproducible fault with no symptom beyond a number on a white page.
 * An error that cannot be read cannot be fixed.
 *
 * So the engine's own database takes a copy. It is the one place both the app
 * and the people working on it can always see, it already holds the run log
 * for exactly this reason, and a row per error is nothing next to a draft.
 *
 * WHAT IT RECORDS. The message, the stack, the path and the digest shown on
 * the error page, so a screenshot can be matched to a row. Plus a fingerprint
 * of the environment: which variables are SET, and how long the session secret
 * is, never a value. A missing or truncated variable is the most common way
 * this app breaks and the hardest thing to see from outside, and a boolean
 * answers it without putting a secret in a table.
 *
 * IT MUST NOT THROW. A handler that fails while reporting a failure turns one
 * broken request into two, so everything here is inside a try and the last
 * resort is the console.
 */
import type { Instrumentation } from "next";

function fingerprint(): Record<string, unknown> {
  const secret = process.env.SESSION_SECRET;
  return {
    vercel_env: process.env.VERCEL_ENV ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    // Length rather than the value: 32 is the floor the session code demands,
    // and "set but too short" is a different fault from "not set at all".
    session_secret_length: secret ? secret.length : 0,
    engine_url: Boolean(process.env.ENGINE_SUPABASE_URL),
    engine_key: Boolean(process.env.ENGINE_SUPABASE_SERVICE_KEY),
    kickio_url: Boolean(process.env.KICKIO_SUPABASE_URL),
    kickio_key: Boolean(process.env.KICKIO_SUPABASE_PUBLISHABLE_KEY),
    anthropic_key: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const err = error as { message?: unknown; stack?: unknown; digest?: unknown };
  const message = typeof err?.message === "string" ? err.message : String(error);
  const stack = typeof err?.stack === "string" ? err.stack.slice(0, 8000) : null;

  // Always, and first: if the database write fails too, this is still in the
  // platform's log for whoever can read it.
  console.error(`[app error] ${request.method} ${request.path}: ${message}`);

  try {
    // Imported here rather than at the top of the file so a broken engine
    // client cannot take the instrumentation hook down with it.
    const { engine } = await import("./lib/engine/client.ts");
    await engine()
      .from("app_errors")
      .insert({
        path: request.path,
        method: request.method,
        route_type: context.routeType,
        route_path: context.routePath ?? null,
        render_source: context.renderSource ?? null,
        digest: typeof err?.digest === "string" ? err.digest : null,
        message,
        stack,
        env: fingerprint(),
      });
  } catch (writeError) {
    console.error(`[app error] could not record it: ${(writeError as Error).message}`);
  }
};
