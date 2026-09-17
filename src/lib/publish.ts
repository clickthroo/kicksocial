/**
 * The publish log: what actually went out, as opposed to what was generated.
 *
 * Approving a draft used to be the end of the road. The draft left the queue,
 * nothing recorded where it went, and the rendered assets became unreachable -
 * so "did we post the Arsenal one?" had no answer inside the tool.
 *
 * v1 publishes by export: a person downloads the card and posts it. The engine
 * therefore cannot know a post went live, and must not pretend otherwise. So
 * approving means "cleared to post", and posting is confirmed by the person who
 * did it, per platform. A draft only becomes `published` once every platform it
 * carries copy for has been confirmed.
 *
 * `method` is 'export' for all of these. When a platform API is wired up it
 * writes its own rows with method/external_id/status, and this file's roll-up
 * logic does not change.
 */
import { engine } from "./engine/client.ts";
import type { DraftStatus, Platform, PostDraft } from "./engine/types.ts";

export interface PublishEntry {
  id: string;
  draft_id: string;
  platform: Platform;
  method: string;
  external_url: string | null;
  status: string;
  error: string | null;
  published_at: string;
}

/** Platforms a draft actually carries copy for - the set it has to complete. */
export function platformsOf(draft: Pick<PostDraft, "copy">): Platform[] {
  return (Object.keys(draft.copy) as Platform[]).filter((p) => draft.copy[p]);
}

export async function publishedPlatforms(draftIds: string[]): Promise<Map<string, PublishEntry[]>> {
  const byDraft = new Map<string, PublishEntry[]>();
  if (draftIds.length === 0) return byDraft;

  const { data, error } = await engine()
    .from("publish_log")
    .select("id,draft_id,platform,method,external_url,status,error,published_at")
    .in("draft_id", draftIds)
    .eq("status", "succeeded");

  if (error) throw new Error(`Loading the publish log failed: ${error.message}`);
  for (const row of (data ?? []) as PublishEntry[]) {
    const list = byDraft.get(row.draft_id) ?? [];
    list.push(row);
    byDraft.set(row.draft_id, list);
  }
  return byDraft;
}

/**
 * The status a draft should carry given what the log holds, or null to leave it
 * alone. Pure, because this is the rule that decides whether the queue and the
 * log agree, and it is easier to be sure of it in a test than in a round trip.
 */
export function nextStatus(
  current: DraftStatus,
  required: Platform[],
  done: Set<Platform>,
): DraftStatus | null {
  // A rejected draft is not dragged back into the flow by a stray log row, and
  // one still awaiting review has not been cleared to post in the first place.
  if (current === "rejected" || current === "draft") return null;

  // No platforms means nothing to complete; calling that "published" would put
  // a post in the log that was never written.
  const complete = required.length > 0 && required.every((p) => done.has(p));
  const next: DraftStatus = complete ? "published" : "approved";
  return next === current ? null : next;
}

/**
 * Move a draft between `approved` and `published` based on what the log now
 * holds. Called after every change, so the two can never disagree - the status
 * is derived from the log rather than tracked alongside it.
 */
async function reconcileDraftStatus(draftId: string): Promise<void> {
  const { data, error } = await engine()
    .from("post_drafts")
    .select("copy,status")
    .eq("id", draftId)
    .maybeSingle();
  if (error) throw new Error(`Loading draft failed: ${error.message}`);
  if (!data) return;

  const draft = data as Pick<PostDraft, "copy" | "status">;
  const logged = await publishedPlatforms([draftId]);
  const done = new Set((logged.get(draftId) ?? []).map((r) => r.platform));

  const next = nextStatus(draft.status, platformsOf(draft), done);
  if (next === null) return;

  const { error: updateError } = await engine()
    .from("post_drafts")
    .update({
      status: next,
      published_at: next === "published" ? new Date().toISOString() : null,
    })
    .eq("id", draftId);
  if (updateError) throw new Error(`Updating draft status failed: ${updateError.message}`);
}

export async function recordPublish(
  draftId: string,
  platform: Platform,
  externalUrl?: string,
): Promise<void> {
  const url = externalUrl?.trim();
  const { error } = await engine()
    .from("publish_log")
    .upsert(
      {
        draft_id: draftId,
        platform,
        method: "export",
        status: "succeeded",
        external_url: url && url.length > 0 ? url : null,
        published_at: new Date().toISOString(),
      },
      // Matches the partial unique index, so a double tap updates the row it
      // already wrote rather than claiming the post went out twice.
      { onConflict: "draft_id,platform" },
    );

  if (error) throw new Error(`Recording the post failed: ${error.message}`);
  await reconcileDraftStatus(draftId);
}

/** Undo a mark - a mis-tap should not be permanent. */
export async function unrecordPublish(draftId: string, platform: Platform): Promise<void> {
  const { error } = await engine()
    .from("publish_log")
    .delete()
    .eq("draft_id", draftId)
    .eq("platform", platform)
    .eq("status", "succeeded");

  if (error) throw new Error(`Removing the log entry failed: ${error.message}`);
  await reconcileDraftStatus(draftId);
}

/** Drafts cleared to post, oldest first - the ones still owed a post lead. */
export async function approvedDrafts(): Promise<PostDraft[]> {
  const { data, error } = await engine()
    .from("post_drafts")
    .select("*")
    .in("status", ["approved", "published"])
    .order("reviewed_at", { ascending: true, nullsFirst: false })
    .limit(60);

  if (error) throw new Error(`Loading approved drafts failed: ${error.message}`);
  return (data ?? []) as PostDraft[];
}

export interface LogRow extends PublishEntry {
  post_drafts: { headline: string | null; recipe_key: string } | null;
}

/** The log itself, newest first. */
export async function recentPublishes(limit = 40): Promise<LogRow[]> {
  const { data, error } = await engine()
    .from("publish_log")
    .select(
      "id,draft_id,platform,method,external_url,status,error,published_at," +
        "post_drafts(headline,recipe_key)",
    )
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Loading the publish log failed: ${error.message}`);
  return (data ?? []) as unknown as LogRow[];
}
