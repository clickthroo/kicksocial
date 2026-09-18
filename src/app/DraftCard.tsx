"use client";

import { useOptimistic, useState, useTransition } from "react";
import { approveDraft, rejectDraft, chooseStyle } from "./actions.ts";
import { CARD_STYLES, asCardStyle, type CardStyle } from "@/lib/render/styles.ts";
import { exportText, tags, xLength } from "@/lib/copy/export.ts";
import { PLATFORM_LIMITS, leadLength, willCollapse } from "@/lib/copy/limits.ts";
import type { Platform, PostDraft } from "@/lib/engine/types.ts";

const LABELS: Record<Platform, string> = { x: "X", instagram: "Instagram", tiktok: "TikTok" };

function urlField(sourceData: Record<string, unknown>, key: string): string | null {
  const url = sourceData[key];
  return typeof url === "string" && url.startsWith("http") ? url : null;
}

/**
 * Instagram is the 4:5 portrait crop; X is 16:9.
 *
 * `style` is passed on the URL rather than saved first, so tapping through the
 * options re-renders immediately and nothing is committed until a choice is
 * made. `v` busts the browser cache when the saved style changes underneath the
 * same URL.
 */
function renderUrl(id: string, format: "ig" | "x", style?: string, v = 0): string {
  const q = new URLSearchParams({ format });
  if (style) q.set("style", style);
  if (v) q.set("v", String(v));
  return `/api/render/${id}?${q}`;
}

export function DraftCard({ draft }: { draft: PostDraft }) {
  const available = (Object.keys(draft.copy) as Platform[]).filter((p) => draft.copy[p]);
  const [tab, setTab] = useState<Platform>(available[0] ?? "x");
  const [isPending, startTransition] = useTransition();

  // Resolve instantly on tap; the row disappears when the server revalidates.
  const [resolved, setResolved] = useOptimistic<null | "approved" | "rejected">(null);

  const [copied, setCopied] = useState(false);

  const savedStyle = asCardStyle((draft.generation as { style?: unknown })?.style);
  // What is on screen, which may not be what is saved yet.
  const [preview, setPreview] = useState<CardStyle>(savedStyle);
  const [savedAt, setSavedAt] = useState(0);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [savingStyle, startStyle] = useTransition();
  const restylable = (draft.generation as { visual_template?: string })?.visual_template ===
    "grail_sale_card";

  const pickStyle = (style: CardStyle) => {
    setPreview(style);
    setStyleError(null);
    startTransition(() => {});
    startStyle(async () => {
      try {
        await chooseStyle(draft.id, style);
        setSavedAt(Date.now());
      } catch (err) {
        setStyleError((err as Error).message);
      }
    });
  };

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
        src={renderUrl(draft.id, tab === "x" ? "x" : "ig", preview, savedAt)}
        alt=""
        loading="lazy"
      />

      {restylable && (
        <div className="styles">
          <div className="styles-row" role="radiogroup" aria-label="Card style">
            {CARD_STYLES.map((style) => (
              <button
                key={style.key}
                type="button"
                role="radio"
                aria-checked={preview === style.key}
                className="style-chip"
                title={style.blurb}
                onClick={() => pickStyle(style.key)}
                disabled={savingStyle}
              >
                {style.name}
              </button>
            ))}
          </div>
          <p className="styles-note">
            {styleError
              ? styleError
              : (CARD_STYLES.find((s) => s.key === preview)?.blurb ?? "")}
          </p>
        </div>
      )}

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

      {/* A real person is the subject. Under Kickio's opt-out setting they may
          not know this is coming, so the reviewer is told who it is before they
          approve rather than having to open the source data to find out. It is
          the difference between opt-out plus a person and opt-out plus a cron
          job. */}
      {typeof draft.source_data.collector_handle === "string" && (
        <div className="notice">
          <strong>About {String(draft.source_data.collector_handle)}</strong> — a real
          collector, featured under Kickio&rsquo;s opt-out setting (
          {String(draft.source_data.collector_flags ?? "consent flags unknown")}). Worth a
          hello before this goes out. Nothing here states what the collection is worth or
          what anything cost, and it must not.
        </div>
      )}

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
        <a className="link" href={renderUrl(draft.id, "ig", preview, savedAt)} download={`${draft.recipe_key}-ig.png`}>
          Download 4:5
        </a>
        <a className="link" href={renderUrl(draft.id, "x", preview, savedAt)} download={`${draft.recipe_key}-x.png`}>
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
