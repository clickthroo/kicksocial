"use client";

import { useState, useTransition } from "react";
import { markPosted, postDraftToX, unmarkPosted } from "./actions.ts";
import type { Platform, PostDraft } from "@/lib/engine/types.ts";
import type { PublishEntry } from "@/lib/publish.ts";
import { exportText } from "@/lib/copy/export.ts";

const LABELS: Record<Platform, string> = { x: "X", instagram: "Instagram", tiktok: "TikTok" };

/**
 * One platform's row: the assets to post with, and the confirmation that it
 * went out. The engine cannot observe a manual post, so this is the only thing
 * that makes the log true.
 */
function PlatformRow({
  draft,
  platform,
  entry,
  canPostToX,
}: {
  draft: PostDraft;
  platform: Platform;
  entry: PublishEntry | undefined;
  /** False unless this deployment holds X credentials. */
  canPostToX: boolean;
}) {
  const [url, setUrl] = useState(entry?.external_url ?? "");
  const [showUrl, setShowUrl] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const posted = !!entry;
  const format = platform === "x" ? "x" : "ig";
  // Offered only where it can actually work: X, not yet posted, and
  // credentials present. Everywhere else the manual flow is the flow.
  const apiPost = platform === "x" && canPostToX && !posted;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText(draft.copy, platform));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const [sending, setSending] = useState(false);
  const send = () => {
    setError(null);
    setSending(true);
    startTransition(async () => {
      try {
        await postDraftToX(draft.id);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSending(false);
      }
    });
  };

  const toggle = () => {
    setError(null);
    startTransition(async () => {
      try {
        if (posted) await unmarkPosted(draft.id, platform);
        else await markPosted(draft.id, platform, url);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  return (
    <div className={`pub-row${posted ? " posted" : ""}`}>
      <div className="pub-row-head">
        <span className="pub-platform">{LABELS[platform]}</span>
        {posted ? (
          <span className="pill created">Posted</span>
        ) : (
          <span className="pill none">Not posted</span>
        )}
      </div>

      <div className="pub-tools">
        <a className="link" href={`/api/render/${draft.id}?format=${format}`} download={`${draft.recipe_key}-${format}.png`}>
          Download image
        </a>
        <button className="link" type="button" onClick={copy}>
          {copied ? "Copied" : "Copy text"}
        </button>
        {!posted && (
          <button className="link" type="button" onClick={() => setShowUrl((v) => !v)}>
            {showUrl ? "Hide link field" : "Add link"}
          </button>
        )}
        {posted && entry?.external_url && (
          <a className="link" href={entry.external_url} target="_blank" rel="noreferrer">
            View post ↗
          </a>
        )}
      </div>

      {showUrl && !posted && (
        <input
          type="url"
          className="pub-url"
          placeholder="Link to the live post (optional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      )}

      {error && <div className="banner">{error}</div>}

      {apiPost && (
        <>
          <button className="btn approve pub-mark" onClick={send} disabled={isPending}>
            {sending ? "Posting to X…" : "Post to X now"}
          </button>
          {/* Said plainly, because the button spends money and is not
              reversible by this tool: deleting a post is something only X can
              do, from X. */}
          <p className="section-note">
            Uploads the 16:9 card and posts the text above, as Kickio. It cannot be
            undone from here.
          </p>
        </>
      )}

      <button
        className={`btn ${posted || apiPost ? "" : "approve"} pub-mark`}
        onClick={toggle}
        disabled={isPending}
      >
        {isPending && !sending
          ? "Saving…"
          : posted
            ? "Undo"
            : apiPost
              ? "I posted it myself"
              : `Mark posted to ${LABELS[platform]}`}
      </button>
    </div>
  );
}

export function PostRow({
  draft,
  platforms,
  entries,
  canPostToX = false,
}: {
  draft: PostDraft;
  platforms: Platform[];
  entries: PublishEntry[];
  canPostToX?: boolean;
}) {
  const byPlatform = new Map(entries.map((e) => [e.platform, e]));
  const done = platforms.filter((p) => byPlatform.has(p)).length;

  return (
    <article className={`card${done === platforms.length ? " resolved" : ""}`}>
      <div className="card-head">
        <span className="recipe-tag">{draft.recipe_key.replace(/_/g, " ")}</span>
        <h2>{draft.headline}</h2>
        <p className="desc">
          {done} of {platforms.length} posted
        </p>
      </div>

      {platforms.map((p) => (
        <PlatformRow
          key={p}
          draft={draft}
          platform={p}
          entry={byPlatform.get(p)}
          canPostToX={canPostToX}
        />
      ))}
    </article>
  );
}
