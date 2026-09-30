/**
 * Posting a finished card to X.
 *
 * v1 of this engine published by export: a person downloaded the card, pasted
 * the text and confirmed it went out. This does the same job over the API, and
 * keeps the same shape - a person still presses the button, per post. Nothing
 * here runs on a schedule.
 *
 * WHY THE REFRESH TOKEN LIVES IN THE DATABASE
 *
 * X rotates refresh tokens: every refresh returns a new one and invalidates
 * the one used. A token kept only in an environment variable would therefore
 * work exactly once and then leave the integration permanently broken, with no
 * way back except re-authorising by hand. `X_REFRESH_TOKEN` seeds the first
 * row in `platform_tokens`; from then on the row is the source of truth and
 * the variable is ignored.
 *
 * WHAT THIS COSTS
 *
 * X has been pay-per-use since February 2026: about $0.015 per post, and about
 * $0.20 for a post containing a link. Every post this engine writes carries
 * kickio.com and X auto-links bare domains, so assume the higher rate on all
 * of them. That is the reason this is one tap per post rather than automatic:
 * a loop that posts by accident spends real money and is seen by real people.
 *
 * INERT WITHOUT CREDENTIALS. `isConfigured()` is false until all three
 * variables are set, the button does not render, and the action refuses. There
 * is no path through this file that does anything at all to an unconfigured
 * install.
 */
import { engine } from "../engine/client.ts";
import { PLATFORM_LIMITS } from "../copy/limits.ts";

const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const MEDIA_URL = "https://api.x.com/2/media/upload";
/**
 * The create-post endpoint was renamed from `/2/tweets` to `/2/posts` and both
 * names are documented in different places. Rather than guess, the first call
 * tries the new name and falls back once on a 404. One wasted request on an
 * older account beats an integration that fails for a reason nobody can see.
 */
const POST_URLS = ["https://api.x.com/2/posts", "https://api.x.com/2/tweets"] as const;

/** A post takes a while to upload; a hung request must not hold a page open. */
const TIMEOUT_MS = 30_000;

/** Refresh a little before expiry rather than on it, so a slow call cannot race the clock. */
const EXPIRY_SKEW_MS = 60_000;

export interface XCredentials {
  clientId: string;
  clientSecret: string;
  /** Only used to seed the first row. The database wins afterwards. */
  seedRefreshToken: string;
}

export function xCredentials(): XCredentials | null {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const seedRefreshToken = process.env.X_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !seedRefreshToken) return null;
  return { clientId, clientSecret, seedRefreshToken };
}

/** Whether posting to X is available at all. The UI asks this before offering it. */
export function isConfigured(): boolean {
  return xCredentials() !== null;
}

/**
 * The media id out of an upload response.
 *
 * Exported and pure because this is the one shape in the whole integration
 * that could not be confirmed against the live API from here: the v2 endpoint
 * wraps its payload in `data`, while responses carrying the older
 * `media_id_string` are still reported in the wild. Rather than pick one and
 * find out in production, every documented spelling is accepted and anything
 * else fails loudly with the body attached.
 */
export function mediaIdFrom(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const root = body as Record<string, unknown>;
  const data = (typeof root.data === "object" && root.data !== null ? root.data : root) as Record<
    string,
    unknown
  >;
  for (const key of ["id", "media_id_string", "media_key", "media_id"]) {
    const value = data[key];
    if (typeof value === "string" && value !== "") return value;
    // media_id arrives as a number in the older shape, and JavaScript cannot
    // hold it precisely - so it is only read when the string forms are absent,
    // and it is never the preferred spelling.
    if (key === "media_id" && typeof value === "number") return String(value);
  }
  return null;
}

/** The post id out of a create response, same reasoning as above. */
export function postIdFrom(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const root = body as Record<string, unknown>;
  const data = (typeof root.data === "object" && root.data !== null ? root.data : root) as Record<
    string,
    unknown
  >;
  const id = data.id ?? data.id_str;
  return typeof id === "string" && id !== "" ? id : null;
}

/** Where a post ends up, given its id. */
export function postUrl(id: string, handle: string | null): string {
  return `https://x.com/${handle ?? "i"}/status/${id}`;
}

/**
 * Refuse before spending anything on a post X will reject.
 *
 * Exported so the rule is testable: the failure this prevents costs money and
 * shows up as a 4xx that reads like a bug in the client.
 */
export function tooLongForX(text: string): boolean {
  return text.length > PLATFORM_LIMITS.x.chars;
}

interface TokenRow {
  refresh_token: string;
  access_token: string | null;
  access_expires_at: string | null;
}

async function loadTokenRow(creds: XCredentials): Promise<TokenRow> {
  const { data, error } = await engine()
    .from("platform_tokens")
    .select("refresh_token,access_token,access_expires_at")
    .eq("platform", "x")
    .maybeSingle();
  if (error) throw new Error(`Reading the X token failed: ${error.message}`);
  if (data) return data as TokenRow;

  // First run. Seed from the environment, once.
  const seeded: TokenRow = {
    refresh_token: creds.seedRefreshToken,
    access_token: null,
    access_expires_at: null,
  };
  const { error: insertError } = await engine()
    .from("platform_tokens")
    .insert({ platform: "x", refresh_token: seeded.refresh_token });
  if (insertError) throw new Error(`Storing the X token failed: ${insertError.message}`);
  return seeded;
}

async function refreshAccessToken(creds: XCredentials, refreshToken: string): Promise<string> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: creds.clientId,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body = await response.text();
  if (!response.ok) {
    // A 400 here usually means the refresh token was already spent, which is
    // unrecoverable without re-authorising. Say so rather than leaving someone
    // to work it out from an OAuth error code.
    throw new Error(
      `X refused the token refresh (${response.status}). If this says invalid_grant, the ` +
        `refresh token has been used already and the Kickio account has to be re-authorised. ` +
        `Response: ${body.slice(0, 400)}`,
    );
  }

  const json = JSON.parse(body) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) throw new Error(`X returned no access token. Response: ${body.slice(0, 400)}`);

  const expiresAt = new Date(Date.now() + (json.expires_in ?? 7200) * 1000).toISOString();
  // Conditional on the token we actually spent. If another request refreshed
  // first, its newer token stands and ours is already dead - overwriting it
  // would break the integration to record a token nobody can use.
  const { error } = await engine()
    .from("platform_tokens")
    .update({
      refresh_token: json.refresh_token ?? refreshToken,
      access_token: json.access_token,
      access_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("platform", "x")
    .eq("refresh_token", refreshToken);
  if (error) throw new Error(`Storing the refreshed X token failed: ${error.message}`);

  return json.access_token;
}

async function accessToken(creds: XCredentials): Promise<string> {
  const row = await loadTokenRow(creds);
  const expiry = row.access_expires_at ? Date.parse(row.access_expires_at) : 0;
  if (row.access_token && expiry - EXPIRY_SKEW_MS > Date.now()) return row.access_token;
  return refreshAccessToken(creds, row.refresh_token);
}

async function uploadMedia(token: string, png: Blob): Promise<string> {
  const form = new FormData();
  form.append("media", png, "card.png");
  form.append("media_category", "tweet_image");
  form.append("media_type", "image/png");

  const response = await fetch(MEDIA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Uploading the card to X failed (${response.status}): ${body.slice(0, 400)}`);
  }

  const id = mediaIdFrom(JSON.parse(body));
  if (!id) {
    throw new Error(
      `X accepted the upload but the response carried no media id in any known ` +
        `field. Response: ${body.slice(0, 400)}`,
    );
  }
  return id;
}

async function createPost(token: string, text: string, mediaId: string): Promise<string> {
  let lastBody = "";
  for (const url of POST_URLS) {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, media: { media_ids: [mediaId] } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    lastBody = await response.text();

    // Only a 404 means "wrong endpoint name". Anything else is a real answer
    // and must not be retried against the other URL - a 401 or a duplicate-post
    // 403 retried elsewhere would either post twice or hide the real error.
    if (response.status === 404) continue;

    if (!response.ok) {
      throw new Error(`X refused the post (${response.status}): ${lastBody.slice(0, 400)}`);
    }
    const id = postIdFrom(JSON.parse(lastBody));
    if (!id) throw new Error(`X accepted the post but returned no id: ${lastBody.slice(0, 400)}`);
    return id;
  }
  throw new Error(
    `Neither /2/posts nor /2/tweets exists on this account's API access. Last response: ` +
      `${lastBody.slice(0, 400)}`,
  );
}

export interface XPostResult {
  postId: string;
  url: string;
}

/**
 * Upload the card, then post it. Returns where it landed.
 *
 * The caller renders the image and builds the text, so this file never decides
 * what goes out - it only sends what it is given.
 */
export async function postToX(text: string, png: Blob): Promise<XPostResult> {
  const creds = xCredentials();
  if (!creds) throw new Error("X posting is not configured on this deployment.");
  if (text.trim() === "") throw new Error("Refusing to post an empty message to X.");
  if (tooLongForX(text)) {
    throw new Error(
      `The post is ${text.length} characters, over X's ${PLATFORM_LIMITS.x.chars}. ` +
        `Shorten it before posting rather than paying for a rejected request.`,
    );
  }

  const token = await accessToken(creds);
  const mediaId = await uploadMedia(token, png);
  const postId = await createPost(token, text, mediaId);
  return { postId, url: postUrl(postId, process.env.X_HANDLE ?? null) };
}
