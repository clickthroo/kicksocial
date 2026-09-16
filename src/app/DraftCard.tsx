"use client";

import { useOptimistic, useState, useTransition } from "react";
import { approveDraft, rejectDraft } from "./actions.ts";
import type { Platform, PostDraft } from "@/lib/engine/types.ts";

const LABELS: Record<Platform, string> = { x: "X", instagram: "Instagram", tiktok: "TikTok" };
const X_LIMIT = 280;

function firstImage(sourceData: Record<string, unknown>): string | null {
  const images = sourceData.images;
  return Array.isArray(images) && typeof images[0] === "string" ? images[0] : null;
}

export function DraftCard({ draft }: { draft: PostDraft }) {
  const available = (Object.keys(draft.copy) as Platform[]).filter((p) => draft.copy[p]);
  const [tab, setTab] = useState<Platform>(available[0] ?? "x");
  const [isPending, startTransition] = useTransition();

  // Resolve instantly on tap; the row disappears when the server revalidates.
  const [resolved, setResolved] = useOptimistic<null | "approved" | "rejected">(null);

  const act = (verb: "approved" | "rejected") => {
    startTransition(async () => {
      setResolved(verb);
      if (verb === "approved") await approveDraft(draft.id);
      else await rejectDraft(draft.id);
    });
  };

  const image = firstImage(draft.source_data);

  return (
    <article className={`card${resolved ? " resolved" : ""}`}>
      <div className="card-head">
        <span className="recipe-tag">{draft.recipe_key.replace(/_/g, " ")}</span>
        <h2>{draft.headline}</h2>
      </div>

      {image && <img className="shot" src={image} alt="" loading="lazy" />}

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
