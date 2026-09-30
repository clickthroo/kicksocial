"use server";

import { revalidatePath } from "next/cache";
import {
  alreadyPublished,
  recordFailure,
  recordPublish,
  unrecordPublish,
} from "@/lib/publish.ts";
import { engine } from "@/lib/engine/client.ts";
import { exportText } from "@/lib/copy/export.ts";
import { renderDraftPng } from "@/lib/render/draft-image.ts";
import { isConfigured, postToX } from "@/lib/publishers/x.ts";
import type { Platform, PostDraft } from "@/lib/engine/types.ts";

export async function markPosted(
  draftId: string,
  platform: Platform,
  url?: string,
): Promise<void> {
  await recordPublish(draftId, platform, url);
  revalidatePath("/publish");
  revalidatePath("/");
}

export async function unmarkPosted(draftId: string, platform: Platform): Promise<void> {
  await unrecordPublish(draftId, platform);
  revalidatePath("/publish");
  revalidatePath("/");
}

export interface PostResult {
  url: string;
}

/**
 * Send an approved draft to X: upload the card, post the text, log where it
 * landed.
 *
 * THE ORDER OF THE CHECKS IS THE DESIGN. Each one refuses before anything is
 * spent or sent, because every failure past this point is either money gone or
 * something on a public timeline that cannot be quietly taken back.
 *
 *  1. Configured at all, so an install without credentials cannot be coaxed
 *     into a half-attempt.
 *  2. Not already posted. `recordPublish` upserts, so the log can never hold
 *     two rows - but nothing stops a second click sending a second post before
 *     the first is recorded. This is the guard that does.
 *  3. Approved. A draft still in review has not been cleared by anyone, and
 *     the one thing this tool must never do is post something nobody read.
 *  4. Has X copy. A draft without it would post an empty message.
 *
 * A failure is written to the log as well as thrown. A post that failed
 * silently gets retried blindly, and on a paid API that is the expensive kind
 * of invisible.
 */
export async function postDraftToX(draftId: string): Promise<PostResult> {
  if (!isConfigured()) {
    throw new Error("X posting is not configured on this deployment.");
  }

  if (await alreadyPublished(draftId, "x")) {
    throw new Error("This draft has already been posted to X. Nothing sent.");
  }

  const { data, error } = await engine()
    .from("post_drafts")
    .select("*")
    .eq("id", draftId)
    .maybeSingle();
  if (error) throw new Error(`Loading the draft failed: ${error.message}`);
  if (!data) throw new Error("Draft not found.");

  const draft = data as PostDraft;
  if (draft.status !== "approved") {
    throw new Error(
      `Only an approved draft can be posted. This one is ${draft.status}.`,
    );
  }
  if (!draft.copy.x) {
    throw new Error("This draft carries no X copy, so there is nothing to post.");
  }

  const text = exportText(draft.copy, "x");

  try {
    // 16:9, and no style argument: `templateFor` reads the style the draft
    // was saved with, so this is byte-for-byte the card the Download button
    // gives you and the queue previewed.
    const png = await renderDraftPng(draft, "x");
    const result = await postToX(text, png);
    await recordPublish(draftId, "x", result.url, "x_api");
    revalidatePath("/publish");
    revalidatePath("/");
    return { url: result.url };
  } catch (err) {
    const message = (err as Error).message;
    await recordFailure(draftId, "x", "x_api", message);
    revalidatePath("/publish");
    throw new Error(message);
  }
}
