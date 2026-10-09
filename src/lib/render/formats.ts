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

/**
 * The largest font size a single line of text can be set at and still fit.
 *
 * Satori returns no text metrics, so a line that is too long does not report
 * itself: it wraps, and a block given a fixed height then spills into whatever
 * is under it. The Battle card's hero sat at up to 132px because "Which one?"
 * is ten characters and fitted; "Which one wins?" is fifteen and does not, by
 * about eighty pixels on a 1080-wide frame.
 *
 * `perChar` is the average glyph width as a fraction of the font size, for the
 * bold grotesque these cards are set in. 0.58 is deliberately on the wide side:
 * being wrong small costs a few points of type nobody will notice, and being
 * wrong large costs a second line through the artwork.
 *
 * Here rather than in templates.tsx because the bare node test runner cannot
 * load a .tsx file, and this is a rule worth testing.
 */
export function lineFits(
  text: string,
  available: number,
  max: number,
  perChar = 0.58,
): number {
  if (text.length === 0 || available <= 0) return max;
  return Math.max(1, Math.min(max, Math.floor(available / (text.length * perChar))));
}

/**
 * How big the mark is drawn, in one place.
 *
 * `lockupHeight` used to repeat these numbers as literals, which is a second
 * copy of a layout constant that nine cards reserve space against: change the
 * lockup and every one of them is laying out around the old size without
 * saying so.
 *
 * Raised about 10% from 172/128. The mark is the only thing on most of these
 * cards that says whose post it is, and at the old size it was losing that
 * argument to the photography.
 */
export function markSize(format: FormatKey, compact: boolean): number {
  const portrait = format !== "x";
  return compact ? (portrait ? 102 : 80) : portrait ? 190 : 142;
}

export function addressSize(format: FormatKey, compact: boolean): number {
  const portrait = format !== "x";
  return compact ? (portrait ? 21 : 18) : portrait ? 26 : 21;
}

/** The space a card must leave for the lockup. Stacked in portrait, inline on 16:9. */
export function lockupHeight(format: FormatKey): number {
  const mark = markSize(format, false);
  return format !== "x" ? mark + 8 + addressSize(format, false) : mark;
}
