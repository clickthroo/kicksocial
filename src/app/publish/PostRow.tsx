"use client";

import { useState, useTransition } from "react";
import { markPosted, unmarkPosted } from "./actions.ts";
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
}: {
  draft: PostDraft;
  platform: Platform;
  entry: PublishEntry | undefined;
}) {
  const [url, setUrl] = useState(entry?.external_url ?? "");
  const [showUrl, setShowUrl] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const posted = !!entry;
  const format = platform === "x" ? "x" : "ig";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText(draft.copy, platform));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
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

      <button
        className={`btn ${posted ? "" : "approve"} pub-mark`}
        onClick={toggle}
        disabled={isPending}
      >
        {isPending ? "Saving…" : posted ? "Undo" : `Mark posted to ${LABELS[platform]}`}
      </button>
    </div>
  );
}

export function PostRow({
  draft,
  platforms,
  entries,
}: {
  draft: PostDraft;
  platforms: Platform[];
  entries: PublishEntry[];
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
        <PlatformRow key={p} draft={draft} platform={p} entry={byPlatform.get(p)} />
      ))}
    </article>
  );
}
