/**
 * Reading Kickio's `condition` and `size` columns well enough to print them.
 *
 * BOTH COLUMNS ARE SCRAPED, AND BOTH ARE DIRTY.
 *
 * `condition` is mostly clean - Very Good, Brand New (With Tags), Good, Mint,
 * Fair, Needs Attention - with a handful of typed-in misspellings behind it
 * ("Excelllent", "Minit"). Those are listed by hand below. Nothing is guessed:
 * a value that is not in the table is unknown, and an unknown condition takes
 * no part in the reasoning and is not printed.
 *
 * `size` is worse. Alongside S/M/L/XL it carries "Default Title", "Not
 * specified", and - from shopify variant titles - "Manchester United",
 * "Inter Milan", "Germany", "Liverpool". A card that printed "Manchester
 * United" where the size goes would be obviously broken, so sizes are an
 * ALLOWLIST rather than a cleanup: only a value that is recognisably a shirt
 * size survives.
 *
 * This is the same rule legend-shelf.ts arrived at for player names, for the
 * same reason: matching by negation ("anything that is not obviously junk")
 * fails open, and failing open here means printing a club as a size.
 */

/**
 * Worst to best. The order is the whole point - it is what lets the engine say
 * whether a price spread tracks condition or cuts across it.
 */
export const CONDITIONS = [
  "Needs Attention",
  "Fair",
  "Good",
  "Very Good",
  "Excellent",
  "Mint",
  "Brand New (With Tags)",
] as const;

export type Condition = (typeof CONDITIONS)[number];

/** Misspellings seen in the data, listed rather than fuzzy-matched. */
const ALIASES: Record<string, Condition> = {
  "brand new": "Brand New (With Tags)",
  "brand new (with tags)": "Brand New (With Tags)",
  bnwt: "Brand New (With Tags)",
  mint: "Mint",
  minit: "Mint",
  excellent: "Excellent",
  excelllent: "Excellent",
  excellet: "Excellent",
  excelelnt: "Excellent",
  "very good": "Very Good",
  good: "Good",
  fair: "Fair",
  "needs attention": "Needs Attention",
};

export function normaliseCondition(value: unknown): Condition | null {
  if (typeof value !== "string") return null;
  return ALIASES[value.trim().toLowerCase()] ?? null;
}

export function conditionRank(value: unknown): number | null {
  const condition = normaliseCondition(value);
  return condition ? CONDITIONS.indexOf(condition) : null;
}

/**
 * Short enough to sit under a point on the card.
 *
 * Only the one that needs it: "Brand New (With Tags)" is 21 characters and the
 * column it sits in is about twelve. The rest are already short, and
 * abbreviating "Very Good" to "VG" would make the card read like a spreadsheet.
 */
export function shortCondition(value: unknown): string | null {
  const condition = normaliseCondition(value);
  if (!condition) return null;
  return condition === "Brand New (With Tags)" ? "Brand New" : condition;
}

const SIZES: Record<string, string> = {
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
  xxl: "XXL",
  "2xl": "XXL",
  xxxl: "3XL",
  "3xl": "3XL",
  "4xl": "4XL",
  xxxxl: "4XL",
};

/**
 * A shirt size, or nothing.
 *
 * Multi-size values ("M, L") are a listing that covered two sizes, so there is
 * no single size to print and it is dropped rather than halved.
 */
export function normaliseSize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return SIZES[value.trim().toLowerCase()] ?? null;
}

/** "M · Very Good", "XL", "Brand New", or nothing at all. */
export function sizeAndCondition(size: unknown, condition: unknown): string | null {
  const parts = [normaliseSize(size), shortCondition(condition)].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
