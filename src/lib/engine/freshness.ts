/**
 * How old a draft is, and whether its age is a problem.
 *
 * The queue had no date on it at all, so a draft written on Tuesday and one
 * written three minutes ago looked identical. That matters because most of
 * these posts go out of date, and they do it in two different ways:
 *
 *   * A post about a LISTING points at a shirt someone can buy. The shirt can
 *     sell, or be relisted at another price, and then the post sends people to
 *     a dead page - or worse, quotes a price that is no longer the price.
 *   * A post about a WINDOW ("sold this week", "up 18.3% since last month")
 *     describes a stretch of time. The facts stay true; the tense does not.
 *     Posting last week's roundup on Thursday is simply wrong.
 *
 * A completed sale is neither: it happened, and it stays happened.
 *
 * Kept free of imports on purpose - the approval card is a client component,
 * and the recipe modules behind `RECIPES` each open a Kickio connection.
 */

export type PerishKind = "listing" | "window" | "none";

export type FreshnessState = "fresh" | "ageing" | "stale";

export interface Freshness {
  /** Plain age, always shown: "4h ago", "2 days ago". */
  label: string;
  state: FreshnessState;
  /** Why the age matters, once it does. Null while the draft is fresh. */
  note: string | null;
}

/**
 * What goes out of date about each recipe. Unknown keys are treated as
 * listings, which is the cautious reading: it asks for a check that may not be
 * needed, rather than staying quiet about one that is.
 */
export const PERISHES: Record<string, PerishKind> = {
  grail_of_the_day: "listing",
  value_pick: "listing",
  featured_collection: "listing",
  featured_set: "listing",
  club_archive: "listing",
  collector_spotlight: "listing",
  collector_set_progress: "listing",
  sold_this_week: "window",
  price_trends: "window",
  market_index: "window",
  collection_index: "window",
  // Posted by hand from /sold, about a sale that has already completed.
  grail_sale: "none",
};

export function perishKind(recipeKey: string): PerishKind {
  return PERISHES[recipeKey] ?? "listing";
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Thresholds in hours: at `ageing` it is worth a look, at `stale` a check. */
const LIMITS: Record<Exclude<PerishKind, "none">, { ageing: number; stale: number }> = {
  listing: { ageing: 24, stale: 72 },
  window: { ageing: 72, stale: 168 },
};

const NOTES: Record<Exclude<PerishKind, "none">, string> = {
  listing:
    "Open the listing before you post this - a shirt this old may have sold, " +
    "or been relisted at a different price.",
  window:
    "This post describes a stretch of time that has moved on. Read it back and " +
    "check it still says something true today.",
};

export function ageLabel(ms: number): string {
  if (ms < 0) return "just now";
  if (ms < HOUR) {
    const mins = Math.floor(ms / 60_000);
    return mins < 1 ? "just now" : `${mins} min ago`;
  }
  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    return `${hours}h ago`;
  }
  const days = Math.round(ms / DAY);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function freshness(
  createdAt: string,
  recipeKey: string,
  now: number = Date.now(),
): Freshness {
  const age = now - new Date(createdAt).getTime();
  const label = Number.isNaN(age) ? "date unknown" : ageLabel(age);
  const kind = perishKind(recipeKey);

  // A bad timestamp is not a fresh draft. Say so rather than quietly passing it.
  if (Number.isNaN(age)) {
    return { label, state: "ageing", note: "This draft has no readable date on it." };
  }

  if (kind === "none") return { label, state: "fresh", note: null };

  const hours = age / HOUR;
  const limit = LIMITS[kind];
  if (hours >= limit.stale) return { label, state: "stale", note: NOTES[kind] };
  if (hours >= limit.ageing) return { label, state: "ageing", note: NOTES[kind] };
  return { label, state: "fresh", note: null };
}
