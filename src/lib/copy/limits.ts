/**
 * Per-network limits, in one place.
 *
 * Its own module rather than living in generate.ts because the dashboard needs
 * these too, and a client component importing generate.ts would pull the whole
 * Anthropic SDK into the browser bundle.
 *
 * Three numbers per network, and they answer different questions:
 *
 *  - `chars` is the ceiling the network will accept. Breaking it loses the post.
 *  - `lead` is how much shows before the caption is collapsed behind a "more".
 *    Breaking it loses the reader, which is worse and much easier to do.
 *  - `target` is the length the writing should actually aim for. It exists
 *    because on two of these three networks the ceiling is nowhere near the
 *    right answer, and a model given only a maximum writes to the maximum.
 *
 * Hashtags count toward `chars` on all three, so the body's real budget is
 * `chars` minus the tag block. `bodyBudget` in export.ts does that arithmetic
 * against the tags a draft actually carries.
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
 * TIKTOK'S CEILING IS 2,200, NOT 4,000. The app itself now takes 4,000, but
 * TikTok's Direct Post API - the one an automated publisher has to go through -
 * still caps a caption at 2,200 UTF-16 runes. A post written to 4,000 would
 * paste by hand today and fail the moment publishing is wired up, so the number
 * here is the one that is true on both paths.
 *
 * That ceiling is academic anyway, because TikTok captions perform best far
 * short of it: the 150-300 character band consistently out-reaches longer ones,
 * and only 80-100 characters show before the "more". So `tiktok.target` is 300
 * and `tiktok.lead` is the conservative end of that visible window.
 *
 * Hashtag counts are per network because the networks differ, not because one
 * number was split three ways. Instagram's 30 is the platform's own cap and it
 * rewards filling it. TikTok's 5 is the opposite case: 3-5 relevant tags is
 * what performs, and past about ten a caption reads as spam and loses reach.
 * Five tags is also roughly 70 characters, which a 300-character caption can
 * afford and a 2,200-character one never needed to think about.
 */
export const PLATFORM_LIMITS = {
  x: { chars: 25_000, lead: 280, hashtags: 15 },
  instagram: { chars: 2_200, lead: 125, hashtags: 30 },
  tiktok: { chars: 2_200, lead: 80, target: 300, hashtags: 5 },
} as const;

/** The networks that collapse a long caption, and so have a lead to protect. */
export type LeadPlatform = keyof typeof PLATFORM_LIMITS;

/**
 * The opening that shows before the network collapses the post. Counted on the
 * body only: hashtags are appended at the end and are never part of what gets
 * read first.
 */
export function leadLength(text: string, platform: LeadPlatform = "x"): number {
  return Math.min(text.length, PLATFORM_LIMITS[platform].lead);
}

/** True when the post is long enough that the network will collapse it. */
export function willCollapse(text: string, platform: LeadPlatform = "x"): boolean {
  return text.length > PLATFORM_LIMITS[platform].lead;
}
