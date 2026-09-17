/**
 * Kickio's logo, inlined as a data URI.
 *
 * Inlined rather than fetched or read from disk: Satori needs the bytes at
 * render time, and a URL means a network round trip on every card (and a
 * different answer in preview, in dev and on Vercel). A constant cannot fail.
 *
 * TO SET IT: put the artwork somewhere on disk and run
 *
 *     node scripts/embed-mark.mjs path/to/kickio-mark.png
 *
 * which rewrites the constant below. PNG or JPEG only - Satori decodes neither
 * SVG reliably nor WebP at all. A square, transparent-background PNG at 512px
 * or larger gives the best result.
 *
 * Until it is set, the cards fall back to the text wordmark, which is why this
 * is allowed to be null rather than throwing.
 */
export const KICKIO_MARK: string | null = null;
