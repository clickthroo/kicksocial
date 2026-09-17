/**
 * Shared bearer-token check for the two routes that can trigger a recipe run.
 *
 * Both were written as "check the secret if one is configured", which is the
 * fail-open shape: an unset env var silently turned the check off and left a
 * public URL that spends Anthropic credits on demand. A missing secret is now a
 * refusal, not a bypass.
 *
 * The dashboard's Run now button calls runRecipe directly as a server action,
 * so there is still a way in when the secret is absent - failing closed here
 * does not lock anyone out of the app.
 *
 * Deliberately free of any Next import so the decision can be tested directly.
 * The routes turn the verdict into a response.
 */
import { timingSafeEqual } from "node:crypto";

export type AuthVerdict = { ok: true } | { ok: false; status: number; error: string };

function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would leak length by way
  // of a 500, so compare lengths first and still run the constant-time check on
  // equal-length input.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkTriggerAuth(request: Request): AuthVerdict {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error:
        "CRON_SECRET is not set, so this endpoint is disabled. Set it in the " +
        "environment; Vercel sends it automatically on cron requests.",
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!matches(token, secret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
