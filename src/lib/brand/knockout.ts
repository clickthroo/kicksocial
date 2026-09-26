/**
 * Knock a flat background out of an uploaded logo.
 *
 * Kickio's badge arrived as a black disc on an opaque white square, which on a
 * near-black card reads as a white box with a logo in it. Resizing onto a
 * transparent canvas does not help: the white is in the source pixels, not the
 * padding.
 *
 * WHY THIS IS A FLOOD FILL AND NOT "MAKE WHITE TRANSPARENT"
 *
 * That badge's ring and its lettering are white too. Removing every white pixel
 * would hollow the logo out and leave a black ring holding nothing. So the fill
 * starts at the border and spreads only through touching pixels of the same
 * colour: the surround goes, anything enclosed by the artwork stays.
 *
 * Pure and buffer-in, buffer-out, so the behaviour can be tested without an
 * image decoder or a network.
 */

export interface KnockoutResult {
  /** The RGBA buffer, modified in place. */
  data: Buffer;
  /** How many pixels were cleared. Zero means nothing matched. */
  cleared: number;
  /** Null when the edges were already transparent or not a single flat colour. */
  background: { r: number; g: number; b: number } | null;
}

/**
 * How far a pixel may sit from the background colour and still be swallowed.
 * Generous enough for JPEG ringing and anti-aliased edges, tight enough that a
 * pale cream logo on white does not dissolve.
 */
export const DEFAULT_TOLERANCE = 32;

function distance(
  data: Buffer,
  i: number,
  bg: { r: number; g: number; b: number },
): number {
  return Math.hypot(data[i] - bg.r, data[i + 1] - bg.g, data[i + 2] - bg.b);
}

/**
 * The colour to remove, taken from the four corners.
 *
 * All four must agree. A logo on a gradient or a photograph has no single
 * background to remove, and guessing one would eat part of the artwork.
 */
export function detectBackground(
  data: Buffer,
  width: number,
  height: number,
  tolerance = DEFAULT_TOLERANCE,
): { r: number; g: number; b: number } | null {
  const corners = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + width - 1) * 4,
  ];

  // Already transparent there: whoever made this file did the work already.
  if (corners.some((i) => data[i + 3] < 250)) return null;

  const first = { r: data[corners[0]], g: data[corners[0] + 1], b: data[corners[0] + 2] };
  for (const i of corners.slice(1)) {
    if (distance(data, i, first) > tolerance) return null;
  }
  return first;
}

/**
 * Clear every pixel reachable from the border without crossing the artwork.
 *
 * Iterative rather than recursive: a 512x512 flood of a mostly-background image
 * is a quarter of a million calls deep, which overflows the stack.
 */
export function knockoutBorder(
  data: Buffer,
  width: number,
  height: number,
  tolerance = DEFAULT_TOLERANCE,
): KnockoutResult {
  const background = detectBackground(data, width, height, tolerance);
  if (!background) return { data, cleared: 0, background: null };

  const seen = new Uint8Array(width * height);
  const stack: number[] = [];

  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (distance(data, p * 4, background) <= tolerance) stack.push(p);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  let cleared = 0;
  while (stack.length > 0) {
    const p = stack.pop()!;
    // Zero the colour as well as the alpha: a transparent pixel that still
    // carries white bleeds into the edges when the image is scaled.
    data[p * 4] = 0;
    data[p * 4 + 1] = 0;
    data[p * 4 + 2] = 0;
    data[p * 4 + 3] = 0;
    cleared++;

    const x = p % width;
    const y = (p - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  return { data, cleared, background };
}

export function describeKnockout(result: KnockoutResult, total: number): string {
  if (!result.background) {
    return "Edges were already transparent, or the background is not one flat colour. Left as uploaded.";
  }
  const { r, g, b } = result.background;
  const pct = Math.round((result.cleared / total) * 100);
  const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `Removed the ${hex} background (${pct}% of the image), so the logo sits directly on the card.`;
}
