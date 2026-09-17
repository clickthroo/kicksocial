/**
 * Turning a pasted kickio.com link into a product slug.
 *
 * The admin pastes a URL; everything the post says about the shirt is then read
 * from Kickio's own `products` row rather than parsed out of a page. So the only
 * thing this file has to get right is which URLs it is willing to accept.
 *
 * It is an allowlist, for the same reason the rarity signals are: a permissive
 * parser that "finds a slug somewhere in the string" will happily accept an eBay
 * URL, miss, and look up a slug that does not exist - or worse, one that does
 * and belongs to a different shirt.
 */
import { KICKIO_SITE_DEFAULT, KICKIO_PRODUCT_PATH_DEFAULT } from "../recipes/grail-of-the-day.ts";

export type SlugResult =
  | { ok: true; slug: string }
  | { ok: false; reason: string };

/** Hosts a product link may come from. */
function allowedHosts(): string[] {
  const configured = process.env.KICKIO_SITE_URL || KICKIO_SITE_DEFAULT;
  let host = "kickio.com";
  try {
    host = new URL(configured).hostname.toLowerCase();
  } catch {
    // Misconfigured env - fall back to the live site rather than accepting all.
  }
  const bare = host.replace(/^www\./, "");
  return [bare, `www.${bare}`];
}

/** The path segment products live under, e.g. "marketplace" from "/marketplace/{slug}". */
function productPathPrefix(): string {
  const pattern = process.env.KICKIO_PRODUCT_PATH || KICKIO_PRODUCT_PATH_DEFAULT;
  return pattern.split("/").filter((s) => s && s !== "{slug}")[0] ?? "marketplace";
}

/** Slugs Kickio generates: lowercase, digits, hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugFromUrl(input: string): SlugResult {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "Paste a Kickio listing URL." };

  // A bare slug is allowed - it is unambiguous and saves the admin a copy-paste
  // when they already know it.
  if (!raw.includes("/") && !raw.includes(" ")) {
    return SLUG.test(raw.toLowerCase())
      ? { ok: true, slug: raw.toLowerCase() }
      : { ok: false, reason: `"${raw}" is not a Kickio URL or product slug.` };
  }

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: "That is not a valid URL." };
  }

  const hosts = allowedHosts();
  const host = url.hostname.toLowerCase();
  if (!hosts.includes(host)) {
    return {
      ok: false,
      reason:
        `This only accepts links from ${hosts[0]}. ` +
        `"${host}" is somewhere else, and the shirt's details are read from ` +
        `Kickio's own record rather than from the page.`,
    };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const prefix = productPathPrefix();
  const at = segments.indexOf(prefix);
  if (at === -1 || !segments[at + 1]) {
    return { ok: false, reason: `That is a ${host} link, but not a /${prefix}/ product page.` };
  }

  const slug = decodeURIComponent(segments[at + 1]).toLowerCase();
  if (!SLUG.test(slug)) {
    return { ok: false, reason: `"${slug}" does not look like a product slug.` };
  }
  return { ok: true, slug };
}
