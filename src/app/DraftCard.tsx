"use client";

import { useOptimistic, useState, useTransition } from "react";
import { approveDraft, rejectDraft } from "./actions.ts";
import { exportText, tags, xLength } from "@/lib/copy/export.ts";
import { PLATFORM_LIMITS, leadLength, willCollapse } from "@/lib/copy/limits.ts";
import type { Platform, PostDraft } from "@/lib/engine/types.ts";

const LABELS: Record<Platform, string> = { x: "X", instagram: "Instagram", tiktok: "TikTok" };

function urlField(sourceData: Record<string, unknown>, key: string): string | null {
  const url = sourceData[key];
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
    try {
      await navigator.clipboard.writeText(exportText(draft.copy, tab));
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
            {/* Premium allows 25,000 characters, so a raw count against it tells a
                reviewer nothing. What matters is the opening 280: past that, X
                collapses the post and only the lead is read in the timeline. */}
            {willCollapse(draft.copy.x.text) ? (
              <p>
                {draft.copy.x.text.slice(0, PLATFORM_LIMITS.x.lead)}
                <span className="collapsed">
                  {draft.copy.x.text.slice(PLATFORM_LIMITS.x.lead)}
                </span>
              </p>
            ) : (
              <p>{draft.copy.x.text}</p>
            )}
            {draft.copy.x.hashtags?.length ? (
              <p className="hashtags">{tags(draft.copy.x.hashtags)}</p>
            ) : null}
            <span className={`count${xLength(draft.copy) > PLATFORM_LIMITS.x.chars ? " count over" : ""}`}>
              {willCollapse(draft.copy.x.text)
                ? `lead ${leadLength(draft.copy.x.text)}/${PLATFORM_LIMITS.x.lead} · ` +
                  `${xLength(draft.copy)} total — grey text is behind “Show more”`
                : `${xLength(draft.copy)} characters — shows in full`}
            </span>
          </>
        )}

        {tab === "instagram" && draft.copy.instagram && (
          <>
            <p>{draft.copy.instagram.caption}</p>
            <p className="hashtags">{tags(draft.copy.instagram.hashtags)}</p>
            <span className="count">
              {draft.copy.instagram.hashtags.length}/{PLATFORM_LIMITS.instagram.hashtags} hashtags
            </span>
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
            <p>{draft.copy.tiktok.cta}</p>
            {draft.copy.tiktok.hashtags?.length ? (
              <p className="hashtags">{tags(draft.copy.tiktok.hashtags)}</p>
            ) : null}
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

      {/* Two distinct references: the page on Kickio, and where it was scraped
          from. Labelled apart so a reviewer is never misled about which. */}
      {(urlField(draft.source_data, "kickio_url") ||
        urlField(draft.source_data, "origin_url")) && (
        <div className="verify">
          {urlField(draft.source_data, "kickio_url") && (
            <a
              href={urlField(draft.source_data, "kickio_url")!}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open on Kickio &rarr;
            </a>
          )}
          {urlField(draft.source_data, "origin_url") && (
            <a
              className="secondary"
              href={urlField(draft.source_data, "origin_url")!}
              target="_blank"
              rel="noopener noreferrer"
            >
              Source: {String(draft.source_data.origin_source ?? "external")} &#8599;
            </a>
          )}
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
