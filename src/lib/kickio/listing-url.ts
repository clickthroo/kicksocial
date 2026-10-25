/**
 * Turning a pasted kickio.com link into the thing a Drop should promote.
 *
 *   https://kickio.com/listings/21b7f8c2-6e2c-4203-9d0a-65f93232cf6b
 *   https://kickio.com/marketplace/1994-96-chelsea-away-shirt
 *
 * BOTH KINDS ARE ACCEPTED, AND THAT IS THE POINT. A listing is one seller's
 * copy of a shirt and has only a UUID; a product is the shirt itself and has
 * a readable slug. This used to take the first and refuse the second with an
 * instruction to go and find a listing link, which is a chore the admin should
 * not be doing: the product page already leads with its cheapest live listing,
 * the post links back to the product page whichever was pasted, and the engine
 * can pick the same listing the page does without being told.
 *
 * So a product link resolves to a listing later (see `resolveDropListing`),
 * and this file's only job is to say which of the two was pasted.
 *
 * A SLUG UNDER /listings/ IS A PRODUCT. Listings have no slug, so something
 * readable in that position is a product address somebody has put under the
 * wrong prefix - which is exactly what happened the day this was written. It
 * resolves rather than refusing: the alternative is a correct message about a
 * distinction the admin does not care about.
 *
 * The host and path checks stay an allowlist. A permissive "find a UUID or a
 * slug somewhere in the string" would happily accept an eBay link or a Kickio
 * admin URL and look up something nobody meant.
 */
import { KICKIO_SITE_DEFAULT, KICKIO_PRODUCT_PATH_DEFAULT } from "../recipes/grail-of-the-day.ts";

export const KICKIO_LISTING_PATH_DEFAULT = "/listings/{id}";

export type DropTarget =
  /** One seller's copy, by its id. */
  | { ok: true; kind: "listing"; id: string }
  /** The shirt itself, by its address. The listing is chosen from it later. */
  | { ok: true; kind: "product"; slug: string }
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
/** Slugs Kickio generates: lowercase, digits, hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A trailing path segment read as whichever of the two it looks like. */
function readSegment(value: string): DropTarget | null {
  if (UUID.test(value)) return { ok: true, kind: "listing", id: value.toLowerCase() };
  if (SLUG.test(value.toLowerCase())) return { ok: true, kind: "product", slug: value.toLowerCase() };
  return null;
}

export function dropTargetFromUrl(input: string): DropTarget {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "Paste a Kickio listing or shirt link." };

  // A bare id or slug is unambiguous, and saves a copy-paste when somebody
  // already has one in front of them.
  if (!raw.includes("/") && !raw.includes(" ")) {
    return (
      readSegment(raw) ?? {
        ok: false,
        reason: `"${raw}" is not a Kickio link, a listing id or a shirt's address.`,
      }
    );
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
  const listings = listingPathPrefix();
  const products = productPathPrefix();

  for (const prefix of [listings, products]) {
    const at = segments.indexOf(prefix);
    if (at === -1) continue;
    const value = decodeURIComponent(segments[at + 1] ?? "");
    if (!value) {
      return {
        ok: false,
        reason: `That /${prefix}/ link has nothing on the end of it.`,
      };
    }
    const read = readSegment(value);
    if (read) return read;
    return {
      ok: false,
      reason: `"${value}" is not a listing id or a shirt's address.`,
    };
  }

  return {
    ok: false,
    reason:
      `That is a ${host} link, but not a /${listings}/ or /${products}/ page. ` +
      "Paste the shirt's page or one seller's listing.",
  };
}
