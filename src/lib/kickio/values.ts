/**
 * Placeholder scrubbing for Kickio's free-text fields.
 *
 * Several columns carry stand-ins for "we don't know" rather than being left
 * null: `player_name` is literally "Unknown" on 7 active listings (and empty on
 * 27), `manufacturer` is "Other" on 12, `size` is "N/A" on one. Passed through
 * as facts, these become copy like "Unknown printing" on a card, or invite
 * Claude to write "Other, 1996".
 *
 * A placeholder is not a fact. Treating it as absent means the post simply says
 * less, which is always safe; treating it as present states something false.
 */
const PLACEHOLDERS = new Set([
  "unknown",
  "n/a",
  "n/a.",
  "na",
  "none",
  "null",
  "nil",
  "tbc",
  "tbd",
  "other",
  "various",
  "-",
  "--",
  "?",
  "???",
]);

/**
 * The value if it says something, otherwise null.
 *
 * Deliberately conservative: anything matching a known placeholder, blank, or
 * punctuation-only is dropped. An unrecognised value is kept - this removes
 * known non-facts, it does not vet real ones.
 */
export function cleanValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (PLACEHOLDERS.has(trimmed.toLowerCase())) return null;
  // Punctuation or separators only, e.g. "—" or "..."
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return null;
  return trimmed;
}

/** Drop keys whose values are placeholders, so they never reach the prompt. */
export function cleanFacts<T extends Record<string, unknown>>(facts: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(facts)) {
    if (typeof value === "string") {
      const cleaned = cleanValue(value);
      if (cleaned !== null) out[key] = cleaned;
    } else if (value !== null && value !== undefined) {
      out[key] = value;
    }
  }
  return out as Partial<T>;
}
