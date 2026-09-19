/**
 * Making Kickio's photography renderable.
 *
 * Satori draws WebP as an empty frame and raises no error, so a WebP shirt
 * produced a card that looked fine in the queue with nothing in it. The fix
 * until now was to refuse WebP at selection time - which is safe, and quietly
 * removed 474 of 1,649 live listings from every photo-led recipe. Nearly a
 * third of the shelf was unpostable for a reason that had nothing to do with
 * the shirt.
 *
 * `sharp` is already a dependency (it knocks the background out of the logo),
 * so the images are transcoded here instead, at render time, and inlined as
 * data URIs. Satori never sees a format it cannot read.
 *
 * WHY RENDER TIME AND NOT SELECTION TIME
 *
 * A draft stores URLs, not bytes. Transcoding when the draft is made would
 * freeze a copy of the photo into the row and leave it stale if the seller
 * replaces it; doing it per render keeps the draft a pointer and costs one
 * conversion per card, on a card nobody renders in a loop.
 *
 * EVERYTHING HERE FAILS SOFT. A photo that will not fetch or will not convert
 * is dropped from the list rather than failing the render: a card missing one
 * of nine grid images is a worse card, but a card that 500s is no card. The
 * templates already show "No renderable photo - do not post" when they end up
 * with nothing, so the loud case stays loud.
 */
import sharp from "sharp";

/** Formats Satori reads natively. Anything else has to be converted. */
const NATIVE = /\.(jpe?g|png)(\?|$)/i;

/** Formats sharp can open and we are willing to fetch. */
const CONVERTIBLE = /\.(webp|avif|tiff?|gif)(\?|$)/i;

/** Stop one enormous file stalling a render. */
const MAX_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

export function needsTranscode(url: string): boolean {
  return !NATIVE.test(url) && CONVERTIBLE.test(url);
}

/** Can a card use this at all - directly, or after conversion? */
export function isRenderable(url: string): boolean {
  return NATIVE.test(url) || CONVERTIBLE.test(url);
}

async function toDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;

    const input = Buffer.from(await response.arrayBuffer());
    if (input.byteLength > MAX_BYTES) return null;

    // PNG rather than JPEG: shirt cutouts carry transparency, and a JPEG would
    // flatten it onto black inside a card that may be on a light background.
    const png = await sharp(input).png({ compressionLevel: 6 }).toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Hand back a list of URLs a card can draw, converting the ones Satori cannot
 * read and leaving the rest untouched so Satori fetches them itself.
 *
 * Order is preserved: the grid cards treat position as the curator's order or
 * as a timeline, so a conversion failure must not reshuffle what remains.
 */
export async function renderablePhotos(urls: string[]): Promise<string[]> {
  const out = await Promise.all(
    urls.map(async (url) => {
      if (!isRenderable(url)) return null;
      if (!needsTranscode(url)) return url;
      return toDataUri(url);
    }),
  );
  return out.filter((u): u is string => u !== null);
}

/**
 * The same, for a draft's `source_data.images`.
 *
 * Returns the source data unchanged when there is nothing to convert, so the
 * common case allocates nothing and the render route can call this
 * unconditionally.
 */
export async function withRenderablePhotos(
  sourceData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const images = sourceData.images;
  if (!Array.isArray(images)) return sourceData;
  const urls = images.filter((u): u is string => typeof u === "string");
  if (!urls.some(needsTranscode)) return sourceData;
  return { ...sourceData, images: await renderablePhotos(urls) };
}
