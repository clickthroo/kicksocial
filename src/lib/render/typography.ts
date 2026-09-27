/**
 * Small typographic repairs the renderer cannot make by measuring.
 *
 * Satori gives no text metrics back, so nothing here can ask how wide a line
 * came out. These are the fixes that work without knowing: they change what a
 * line is allowed to break on rather than what size it is set at.
 */

/** A space that will not break. Satori honours it. */
const NBSP = " ";

/**
 * Bind a short final word to the one before it.
 *
 * "1993-94 Manchester United Away Shirt Cantona #7" wrapped with `#7` alone on
 * the second line, which reads as a mistake on a card that is otherwise set
 * carefully. Sizing down does not fix it: the orphan is about where the line
 * breaks, not how big the type is, and at any size there is a title whose last
 * token lands alone.
 *
 * Only short tails are bound. Joining "Shirt" to "Away" would force a wrap
 * earlier and trade one bad line for another.
 */
export function noOrphan(text: string, shortest = 4): string {
  // Normalised on every path, including the ones that change nothing. Two
  // spaces surviving in one branch and not another is the kind of difference
  // that only shows up in the one title that has them.
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return words.join(" ");

  const last = words[words.length - 1]!;
  if (last.length > shortest) return words.join(" ");

  return words.slice(0, -2).concat(`${words[words.length - 2]}${NBSP}${last}`).join(" ");
}
