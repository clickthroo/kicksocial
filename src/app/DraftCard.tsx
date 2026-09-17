"use client";

import { useOptimistic, useState, useTransition } from "react";
import { approveDraft, rejectDraft } from "./actions.ts";
import type { Platform, PostDraft } from "@/lib/engine/types.ts";

const LABELS: Record<Platform, string> = { x: "X", instagram: "Instagram", tiktok: "TikTok" };
const X_LIMIT = 280;

/** The originating store page, so a reviewer can verify the item is still live. */
function sourceUrl(sourceData: Record<string, unknown>): string | null {
  const url = sourceData.source_url;
  return typeof url === "string" && url.startsWith("http") ? url : null;
}

/** Instagram is the 4:5 portrait crop; X is 16:9. */
function renderUrl(id: string, format: "ig" | "x"): string {
  return `/api/render/${id}?format=${format}`;
}

export function DraftCard({ draft }: { draft: PostDraft }) {
  const available = (Object.keys(draft.copy) as Platform[]).filter((p) => draft.copy[p]);
  const [tab, setTab] = useState<Platform>(available[0] ?? "x");
  const [isPending, startTransition] = useTransition();

  // Resolve instantly on tap; the row disappears when the server revalidates.
  const [resolved, setResolved] = useOptimistic<null | "approved" | "rejected">(null);

  const [copied, setCopied] = useState(false);

  const copyText = async () => {
    const c = draft.copy;
    const text =
      tab === "x"
        ? (c.x?.text ?? "")
        : tab === "instagram"
          ? [c.instagram?.caption, (c.instagram?.hashtags ?? []).map((h) => `#${h.replace(/^#/, "")}`).join(" ")]
              .filter(Boolean)
              .join("\n\n")
          : [c.tiktok?.hook, ...(c.tiktok?.beats ?? []), c.tiktok?.cta].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const act = (verb: "approved" | "rejected") => {
    startTransition(async () => {
      setResolved(verb);
      if (verb === "approved") await approveDraft(draft.id);
      else await rejectDraft(draft.id);
    });
  };


  return (
    <article className={`card${resolved ? " resolved" : ""}`}>
      <div className="card-head">
        <span className="recipe-tag">{draft.recipe_key.replace(/_/g, " ")}</span>
        <h2>{draft.headline}</h2>
      </div>

      {/* The rendered card - what gets posted, not the raw photo. */}
      <img
        className="shot"
        src={renderUrl(draft.id, tab === "x" ? "x" : "ig")}
        alt=""
        loading="lazy"
      />

      {available.length > 1 && (
        <div className="tabs" role="tablist">
          {available.map((p) => (
            <button
              key={p}
              role="tab"
              className="tab"
              aria-selected={tab === p}
              onClick={() => setTab(p)}
            >
              {LABELS[p]}
            </button>
          ))}
        </div>
      )}

      <div className="copy-body">
        {tab === "x" && draft.copy.x && (
          <>
            <p>{draft.copy.x.text}</p>
            <span className={`count${draft.copy.x.text.length > X_LIMIT ? " count over" : ""}`}>
              {draft.copy.x.text.length}/{X_LIMIT}
            </span>
          </>
        )}

        {tab === "instagram" && draft.copy.instagram && (
          <>
            <p>{draft.copy.instagram.caption}</p>
            <p className="hashtags">
              {draft.copy.instagram.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}
            </p>
          </>
        )}

        {tab === "tiktok" && draft.copy.tiktok && (
          <>
            <p>{draft.copy.tiktok.hook}</p>
            <ol className="beats">
              {draft.copy.tiktok.beats.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ol>
            <p className="hashtags">{draft.copy.tiktok.cta}</p>
          </>
        )}
      </div>

      {/* Every number in the copy should be checkable against these before approving. */}
      <details className="facts">
        <summary>
          Check {draft.claims.length} claim{draft.claims.length === 1 ? "" : "s"}
        </summary>
        {draft.claims.map((c, i) => (
          <div className="claim" key={i}>
            <span className="stmt">{c.statement}</span>
            <span className="val">{String(c.value)}</span>
            <span className="src">
              {c.source}
              {c.basis ? ` — ${c.basis}` : ""}
            </span>
          </div>
        ))}
      </details>

      <details className="facts">
        <summary>Source data</summary>
        <pre className="raw">{JSON.stringify(draft.source_data, null, 2)}</pre>
      </details>

      {sourceUrl(draft.source_data) && (
        <div className="verify">
          <a href={sourceUrl(draft.source_data)!} target="_blank" rel="noopener noreferrer">
            Open listing to check it&rsquo;s still live &rarr;
          </a>
        </div>
      )}

      <div className="export">
        <a className="link" href={renderUrl(draft.id, "ig")} download={`${draft.recipe_key}-ig.png`}>
          Download 4:5
        </a>
        <a className="link" href={renderUrl(draft.id, "x")} download={`${draft.recipe_key}-x.png`}>
          Download 16:9
        </a>
        <button className="link" onClick={copyText} type="button">
          {copied ? "Copied" : `Copy ${LABELS[tab]} text`}
        </button>
      </div>

      <div className="actions">
        <button
          className="btn reject"
          onClick={() => act("rejected")}
          disabled={isPending || !!resolved}
        >
          Reject
        </button>
        <button
          className="btn approve"
          onClick={() => act("approved")}
          disabled={isPending || !!resolved}
        >
          {resolved === "approved" ? "Approved" : "Approve"}
        </button>
      </div>
    </article>
  );
}
