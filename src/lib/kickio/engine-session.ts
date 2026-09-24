/**
 * The engine's own Supabase Auth session.
 *
 * WHY THIS EXISTS AT ALL
 *
 * The engine used to authenticate to Kickio with a static key. That stopped
 * being possible for anything but `anon`: Kickio moved to asymmetric JWT
 * signing (ECC P-256) on 2026-09-16, and PostgREST now refuses anything it did
 * not issue -
 *
 *   {"code":"PGRST301","details":"None of the keys was able to decode the JWT",
 *    "message":"No suitable key or wrong key type"}
 *
 * - an EC keyset being handed an HMAC token. Nothing this engine signs itself
 * will ever be accepted, so it has to be given a token Supabase issued.
 *
 * It signs in as a dedicated account, and a Custom Access Token hook on
 * Kickio's side stamps `role: kickio_content_reader` onto that one account's
 * tokens. The role is the same one built in docs/kickio-read-only-role.sql, so
 * the read-only guarantee is still the database's, not this file's: no write
 * grants exist, and `collections.paid_cents` is not granted at all.
 *
 * See docs/kickio-service-account.md.
 *
 * WHY NOT supabase-js's OWN AUTH
 *
 * Setting `accessToken` on a client disables its `auth` namespace entirely, so
 * the sign-in has to happen outside it. That is a one-request endpoint, and
 * doing it by hand means no session is persisted anywhere - there is no refresh
 * token on disk, and a leaked access token dies within the hour.
 */

interface Session {
  token: string;
  /** Epoch ms. Refreshed before this, not at it. */
  expiresAt: number;
  userId: string | null;
}

/**
 * Refresh this long before expiry. A token that dies mid-run would surface as
 * a confusing 401 partway through a recipe rather than a clean sign-in.
 */
const EARLY_REFRESH_MS = 120_000;

let session: Session | null = null;

/**
 * The in-flight sign-in, if any.
 *
 * supabase-js warns that `accessToken` "may be called concurrently and many
 * times". Recipes fan out reads with Promise.all, so without this a single run
 * would sign in several times over and race itself.
 */
let pending: Promise<Session> | null = null;

/** Read a JWT's payload. The server verifies it; here we only need to look. */
export function readClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Is the engine configured to sign in at all?
 *
 * When it is not, everything falls back to the publishable key and the affected
 * recipes report themselves blocked - which is the state this project has been
 * in since 2026-09-19 and handles honestly.
 */
export function engineCredentials(): { email: string; password: string } | null {
  const email = process.env.KICKIO_ENGINE_EMAIL?.trim();
  const password = process.env.KICKIO_ENGINE_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

/**
 * Check the token Supabase actually issued, rather than the one we hoped for.
 *
 * This is the credential layer of the three in client.ts, moved to where the
 * credential now appears. If the hook is not enabled, or is enabled and does
 * not match this account, the token comes back claiming `authenticated` - which
 * on Kickio is NOT a restricted role: it holds INSERT, UPDATE and DELETE on
 * sales_history, collections and collector_profile, held back only by row
 * policies. Connecting as it would quietly end the promise that this engine
 * cannot write to Kickio.
 *
 * So an unexpected role is refused here, loudly, rather than used.
 */
export function assertUsableRole(token: string, allowed: ReadonlySet<string>): string {
  const claims = readClaims(token);
  const role = typeof claims?.role === "string" ? claims.role : null;

  if (role === null) {
    throw new Error(
      "Kickio issued a token with no role claim. Refusing to use it: the role " +
        "is what decides whether this connection can write.",
    );
  }
  if (!allowed.has(role)) {
    throw new Error(
      `Kickio issued a token claiming '${role}', which is not read-only on ` +
        "Kickio. Expected 'kickio_content_reader' - check the Custom Access " +
        "Token hook is enabled and points at this account " +
        "(docs/kickio-service-account.md).",
    );
  }
  return role;
}

async function signIn(allowed: ReadonlySet<string>): Promise<Session> {
  const url = process.env.KICKIO_SUPABASE_URL;
  const apikey = process.env.KICKIO_SUPABASE_PUBLISHABLE_KEY;
  const credentials = engineCredentials();

  if (!url || !apikey || !credentials) {
    throw new Error("Kickio engine credentials are not configured");
  }

  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    // Deliberately does not echo the body: it is an auth response and the
    // email is in scope. The status is enough to tell a wrong password from a
    // disabled account.
    throw new Error(`Kickio sign-in failed with HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    user?: { id?: string };
  };

  if (!body.access_token) throw new Error("Kickio sign-in returned no access token");

  assertUsableRole(body.access_token, allowed);

  return {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    userId: body.user?.id ?? null,
  };
}

/**
 * A usable access token, signing in only when there isn't one.
 *
 * Concurrent callers share one in-flight request. A failure clears it, so the
 * next caller retries rather than inheriting a cached rejection forever - the
 * same trap the browser launcher in this project's sibling repo fell into.
 */
export async function engineToken(allowed: ReadonlySet<string>): Promise<string | null> {
  if (!engineCredentials()) return null;

  if (session && Date.now() < session.expiresAt - EARLY_REFRESH_MS) {
    return session.token;
  }

  if (!pending) {
    pending = signIn(allowed)
      .then((fresh) => {
        session = fresh;
        return fresh;
      })
      .finally(() => {
        pending = null;
      });
  }

  return (await pending).token;
}

/**
 * The engine's own user id, once it has signed in.
 *
 * Kickio's signup trigger gives every new account a public `profiles` row, so
 * this account looks like a collector to `loadCollectors()` - and
 * `collection_public` defaults to true. Rather than write the uid into a list
 * someone has to remember to update, the engine excludes itself by asking who
 * it is. Null before the first read, which is safe: the recipes are reading
 * Kickio by then.
 */
export function engineUserId(): string | null {
  return session?.userId ?? null;
}

/** Test seam: forget the session so env changes take effect. */
export function resetEngineSession(): void {
  session = null;
  pending = null;
}
