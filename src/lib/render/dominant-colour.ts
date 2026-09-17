/**
 * The shirt's own colour, for the Sweep style.
 *
 * Read from the photograph rather than from `teams.primary_color`, which is
 * populated for 180 of Kickio's 2,959 teams - and is a club brand colour
 * anyway, not the colour of this particular shirt. A 1994 away kit is not the
 * club's primary colour, and that is usually the interesting one.
 *
 * Runs once when the draft is created, not per render, and is stored on the
 * draft. It is allowed to fail: a post with a neutral backdrop is fine, a post
 * that did not happen because a colour lookup threw is not.
 */
import sharp from "sharp";

export interface ShirtColour {
  /** Dominant hue, as hex. */
  hex: string;
  /** Darkened for the foot of the sweep, so type stays legible over it. */
  deep: string;
}

function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

/**
 * Product shots are mostly background, so the raw dominant colour is usually
 * the backdrop rather than the shirt. Sampling the middle half of the frame -
 * where the garment is - gets the shirt instead.
 */
export async function shirtColour(imageUrl: string): Promise<ShirtColour | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());

    const image = sharp(buffer);
    const { width, height } = await image.metadata();
    if (!width || !height) return null;

    const { dominant } = await image
      .extract({
        left: Math.round(width * 0.25),
        top: Math.round(height * 0.25),
        width: Math.max(1, Math.round(width * 0.5)),
        height: Math.max(1, Math.round(height * 0.5)),
      })
      .stats();

    const { r, g, b } = dominant;
    // A near-white or near-black shirt gives a backdrop with no colour in it at
    // all, which looks broken rather than minimal. Say so, and let the caller
    // fall back.
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 40 || min > 215 || max - min < 18) return null;

    return { hex: toHex(r, g, b), deep: toHex(r * 0.3, g * 0.3, b * 0.3) };
  } catch {
    return null;
  }
}
