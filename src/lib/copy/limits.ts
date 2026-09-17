/**
 * Per-network limits, in one place.
 *
 * Its own module rather than living in generate.ts because the dashboard needs
 * these too, and a client component importing generate.ts would pull the whole
 * Anthropic SDK into the browser bundle.
 *
 * KICKIO POSTS FROM AN X PREMIUM ACCOUNT, which is why `x.chars` is 25,000
 * rather than 280. Two things follow from that, and only one of them is about
 * the limit:
 *
 *  - Hashtags no longer eat the post. On a free account every tag came out of
 *    the same 280 characters as the writing, which is why this used to be three.
 *  - The first ~280 characters still decide whether anyone reads the rest. A
 *    long post is collapsed behind "Show more" in the timeline, so `x.lead` is
 *    the part that has to stand on its own. That is a writing constraint, not a
 *    platform one, and it survives Premium.
 *
 * Hashtag counts are per network because the networks differ, not because one
 * number was split three ways. Instagram's 30 is the platform's own cap.
 */
export const PLATFORM_LIMITS = {
  x: { chars: 25_000, lead: 280, hashtags: 15 },
  instagram: { chars: 2_200, hashtags: 30 },
  tiktok: { chars: 2_200, hashtags: 12 },
} as const;

/**
 * The opening that shows before X collapses the post. Counted on the body only:
 * hashtags are appended at the end and are never part of what gets read first.
 */
export function leadLength(text: string): number {
  return Math.min(text.length, PLATFORM_LIMITS.x.lead);
}

/** True when the post is long enough that X will collapse it in the timeline. */
export function willCollapse(text: string): boolean {
  return text.length > PLATFORM_LIMITS.x.lead;
}
