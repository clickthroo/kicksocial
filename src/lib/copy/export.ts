/**
 * The exact text a person pastes into each network.
 *
 * Shared, because the queue and the publish screen were each building it, and a
 * post that goes out missing its hashtags because one of them was not updated
 * is not a failure anyone would notice until the reach was already lost.
 */
import type { Platform, PlatformCopy } from "../engine/types.ts";

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
  return [
    copy.tiktok?.hook,
    ...(copy.tiktok?.beats ?? []),
    copy.tiktok?.cta,
    tags(copy.tiktok?.hashtags),
  ]
    .filter(Boolean)
    .join("\n");
}

/** What X will actually count: the post plus the tags appended to it. */
export function xLength(copy: PlatformCopy): number {
  return exportText(copy, "x").length;
}
