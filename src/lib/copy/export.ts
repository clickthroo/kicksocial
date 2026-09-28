/**
 * The exact text a person pastes into each network.
 *
 * Shared, because the queue and the publish screen were each building it, and a
 * post that goes out missing its hashtags because one of them was not updated
 * is not a failure anyone would notice until the reach was already lost.
 */
import type { Platform, PlatformCopy } from "../engine/types.ts";
import { PLATFORM_LIMITS } from "./limits.ts";

export function tags(list: string[] | undefined): string {
  return (list ?? []).map((h) => `#${h.replace(/^#/, "")}`).join(" ");
}

export function exportText(copy: PlatformCopy, platform: Platform): string {
  if (platform === "x") {
    // X counts hashtags inside the character limit, so they belong in the post
    // body rather than as a separate block.
    return [copy.x?.text, tags(copy.x?.hashtags)].filter(Boolean).join(" ");
  }
  if (platform === "instagram") {
    return [copy.instagram?.caption, tags(copy.instagram?.hashtags)]
      .filter(Boolean)
      .join("\n\n");
  }
  // The caption is the post. The hook, beats and CTA are the script for the
  // video and belong on screen, not in the caption - pasting them there is
  // what this used to do, and it read as a list of six-word fragments.
  //
  // The fallback is for drafts written before the caption field existed: the
  // old script is still better than an empty box, and it is the shape their
  // reviewer is used to seeing.
  const tiktok = copy.tiktok;
  const body =
    tiktok?.caption ?? [tiktok?.hook, ...(tiktok?.beats ?? []), tiktok?.cta].filter(Boolean).join("\n");
  return [body, tags(tiktok?.hashtags)].filter(Boolean).join("\n\n");
}

/** What the network will actually count: the post plus the tags with it. */
export function exportLength(copy: PlatformCopy, platform: Platform): number {
  return exportText(copy, platform).length;
}

/** Kept for the X panel, which was measuring this before the others were. */
export function xLength(copy: PlatformCopy): number {
  return exportLength(copy, "x");
}

/**
 * How many characters the body may still use once the tags are allowed for.
 *
 * Hashtags count toward the character limit on all three networks, so a caption
 * written to the limit and then given its tags is a caption over the limit.
 * Negative means the tags alone have already overrun it.
 */
export function bodyBudget(platform: Platform, hashtags: string[] | undefined): number {
  const block = tags(hashtags);
  // The separator is part of the cost: a space on X, a blank line elsewhere.
  const separator = block === "" ? 0 : platform === "x" ? 1 : 2;
  return PLATFORM_LIMITS[platform].chars - block.length - separator;
}

/** Characters over the network's ceiling, or 0 when it fits. */
export function overBy(copy: PlatformCopy, platform: Platform): number {
  return Math.max(0, exportLength(copy, platform) - PLATFORM_LIMITS[platform].chars);
}
