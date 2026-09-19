/**
 * Turning a pasted kickio.com listing link into a listing id.
 *
 *   https://kickio.com/listings/21b7f8c2-6e2c-4203-9d0a-65f93232cf6b
 *
 * Listings have no slug - only a UUID - so unlike the product parser there is
 * no human-readable form to fall back on and no shape to validate beyond "is
 * this a UUID". That makes the host and path checks the whole defence, so they
 * are an allowlist for the same reason the product parser's are: a permissive
 * "find a UUID somewhere in the string" would happily accept an eBay link, or
 * a Kickio admin URL, and look up something that is not the listing the admin
 * meant.
 *
 * ONE LETTER APART, AND A DIFFERENT THING
 *
 * `/marketplace/{slug}` is a product - the shirt, every seller. `/listings/{id}`
 * is one seller's copy of it. Pasting a product link here is the likeliest
 * mistake an admin will make, so that case is detected and named rather than
 * refused as "not a listing URL".
 */
import { KICKIO_SITE_DEFAULT, KICKIO_PRODUCT_PATH_DEFAULT } from "../recipes/grail-of-the-day.ts";

export const KICKIO_LISTING_PATH_DEFAULT = "/listings/{id}";

export type ListingResult =
  | { ok: true; id: string }
  | { ok: false; reason: string };

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

/** The path segment listings live under, e.g. "listings" from "/listings/{id}". */
function listingPathPrefix(): string {
  const pattern = process.env.KICKIO_LISTING_PATH || KICKIO_LISTING_PATH_DEFAULT;
  return pattern.split("/").filter((s) => s && !s.startsWith("{"))[0] ?? "listings";
}

function productPathPrefix(): string {
  const pattern = process.env.KICKIO_PRODUCT_PATH || KICKIO_PRODUCT_PATH_DEFAULT;
  return pattern.split("/").filter((s) => s && !s.startsWith("{"))[0] ?? "marketplace";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function listingIdFromUrl(input: string): ListingResult {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "Paste a Kickio listing URL." };

  // A bare UUID is unambiguous, and saves a copy-paste when someone already
  // has the id in front of them.
  if (!raw.includes("/") && !raw.includes(" ")) {
    return UUID.test(raw)
      ? { ok: true, id: raw.toLowerCase() }
      : { ok: false, reason: `"${raw}" is not a Kickio listing URL or listing id.` };
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
        `This only accepts links from ${hosts[0]}. "${host}" is somewhere else, ` +
        "and the shirt's details are read from Kickio's own record rather than " +
        "from the page.",
    };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const listingAt = segments.indexOf(listingPathPrefix());

  if (listingAt === -1) {
    // The likeliest mistake, so it gets its own sentence rather than a generic
    // refusal. Product in, listing out is the whole point of this recipe.
    if (segments.includes(productPathPrefix())) {
      return {
        ok: false,
        reason:
          `That is a product page, not a listing. A product is the shirt; a listing ` +
          `is one seller's copy of it. Open the seller's listing from that page and ` +
          `paste its /${listingPathPrefix()}/ link.`,
      };
    }
    return {
      ok: false,
      reason: `That is a ${host} link, but not a /${listingPathPrefix()}/ page.`,
    };
  }

  const id = decodeURIComponent(segments[listingAt + 1] ?? "");
  if (!UUID.test(id)) {
    return {
      ok: false,
      reason: id
        ? `"${id}" is not a listing id.`
        : `That /${listingPathPrefix()}/ link has no listing id on the end.`,
    };
  }
  return { ok: true, id: id.toLowerCase() };
}
