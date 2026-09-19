/**
 * Output sizes, in their own module so they can be tested and imported without
 * pulling the renderer in.
 *
 * Same reason `limits.ts` is separate from `generate.ts`: the bare node test
 * runner cannot load `.tsx`, and a client component importing templates would
 * drag Satori into the browser bundle.
 */

/**
 * One per platform Kickio actually posts to.
 *
 * TikTok was a declared platform on five recipes with no size of its own, so
 * the only assets an admin could take to it were a 4:5 or a 16:9 - both of
 * which letterbox in a full-screen feed, which is the most obvious possible
 * signal that a post was made for somewhere else.
 */
export const FORMATS = {
  ig: { width: 1080, height: 1350 },
  x: { width: 1200, height: 675 },
  tiktok: { width: 1080, height: 1920 },
} as const;

export type FormatKey = keyof typeof FORMATS;

/**
 * Room to leave clear at the bottom of a 9:16 card.
 *
 * TikTok draws its own caption, username and action buttons over the lower
 * quarter of the screen. Type set against the bottom edge - which is exactly
 * where every one of these cards puts its headline - ends up behind that
 * chrome. This is not padding for looks; it is the part of the frame that is
 * not ours.
 */
export const TIKTOK_SAFE_BOTTOM = 300;

/** Fail to the portrait crop rather than 404 on an unknown format. */
export function asFormat(value: unknown): FormatKey {
  return typeof value === "string" && value in FORMATS ? (value as FormatKey) : "ig";
}
