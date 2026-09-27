/**
 * The signed cookie that says who is logged in.
 *
 * Built on Web Crypto rather than `node:crypto` because the middleware runs on
 * the Edge runtime, where `timingSafeEqual` and `createHmac` do not exist. The
 * same module therefore works in the middleware, in a server action and in a
 * test.
 *
 * The cookie carries the email and an expiry and nothing else. It is a claim
 * about identity, not a capability: every database call the app makes still
 * goes through the service key on the server, so a stolen cookie gets someone
 * into the dashboard, not into Kickio.
 */
const COOKIE = "kickio_session";
const VERSION = "v1";
/** Absolute life of a session. Re-issued while it is being used. */
const LIFE_MS = 12 * 60 * 60 * 1000;

export const SESSION_COOKIE = COOKIE;
export const SESSION_LIFE_MS = LIFE_MS;

export interface SessionPayload {
  email: string;
  /** Epoch ms. */
  expiresAt: number;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

/** Constant time, because `===` on a signature leaks where it stopped matching. */
function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * The secret is required, never defaulted.
 *
 * A default would mean every deployment that forgot to set it shared one
 * signing key, and anybody who read this file could mint a session. Same shape
 * as `checkTriggerAuth`: no secret is a refusal, not a fallback.
 */
export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to at least 32 characters. Generate one with " +
        "`openssl rand -base64 48`.",
    );
  }
  return secret;
}

export async function signSession(
  email: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const payload = b64url(
    new TextEncoder().encode(JSON.stringify({ e: email, x: now + LIFE_MS })),
  );
  const body = `${VERSION}.${payload}`;
  return `${body}.${b64url(await hmac(secret, body))}`;
}

/** The email on a valid, unexpired cookie, or null for anything else. */
export async function readSession(
  token: string | undefined | null,
  secret: string,
  now = Date.now(),
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, payload, signature] = parts as [string, string, string];

  let expected: Uint8Array;
  try {
    expected = await hmac(secret, `${VERSION}.${payload}`);
  } catch {
    return null;
  }
  let given: Uint8Array;
  try {
    given = unb64url(signature);
  } catch {
    return null;
  }
  if (!same(expected, given)) return null;

  try {
    const decoded = JSON.parse(new TextDecoder().decode(unb64url(payload))) as {
      e?: unknown;
      x?: unknown;
    };
    if (typeof decoded.e !== "string" || typeof decoded.x !== "number") return null;
    if (decoded.x <= now) return null;
    return { email: decoded.e, expiresAt: decoded.x };
  } catch {
    return null;
  }
}

/** True once a session is far enough through its life to be worth re-issuing. */
export function shouldRenew(session: SessionPayload, now = Date.now()): boolean {
  return session.expiresAt - now < LIFE_MS / 2;
}
