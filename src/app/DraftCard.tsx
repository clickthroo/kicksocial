"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { approveDraft, rejectDraft, chooseStyle } from "./actions.ts";
import { CARD_STYLES, asCardStyle, type CardStyle } from "@/lib/render/styles.ts";
import type { FormatKey } from "@/lib/render/templates.tsx";
import { exportText, tags, xLength } from "@/lib/copy/export.ts";
import { PLATFORM_LIMITS, leadLength, willCollapse } from "@/lib/copy/limits.ts";
import type { Freshness } from "@/lib/engine/freshness.ts";
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
function renderUrl(id: string, format: FormatKey, style?: string, v = 0): string {
  const q = new URLSearchParams({ format });
  if (style) q.set("style", style);
  if (v) q.set("v", String(v));
  return `/api/render/${id}?${q}`;
}

/**
 * One draft, laid out around the decision.
 *
 * ORDER IS THE DESIGN HERE. This card used to run head, picture, six style
 * chips, tabs, copy, claims, a wall of raw JSON, verify links and five export
 * buttons - and only then Approve and Reject, off the bottom of a phone
 * screen. Everything was equally loud, so the one thing the screen exists for
 * was the hardest thing on it to reach.
 *
 * So now: what you read to decide comes first (the picture, the copy, who it is
 * about, the links that check it), then the decision, then the tools. Choosing
 * a look and reading the source rows are real needs but they are not the job,
 * so they fold away behind one line each.
 */
export function DraftCard({
  draft,
  age,
  picked = false,
  hotkeys = false,
}: {
  draft: PostDraft;
  age: Freshness;
  /** The one the split layout is showing. Styling only. */
  picked?: boolean;
  /** Whether a/r decide this draft - true only for the picked card, and only
   *  while the split layout is up. In the stacked layout nothing is
   *  highlighted, and a keystroke that decides an unhighlighted post is a
   *  decision taken blind. */
  hotkeys?: boolean;
}) {
  const available = (Object.keys(draft.copy) as Platform[]).filter((p) => draft.copy[p]);
  const [tab, setTab] = useState<Platform>(available[0] ?? "x");
  const [isPending, startTransition] = useTransition();

  // Resolve instantly on tap; the row disappears when the server revalidates.
  const [resolved, setResolved] = useOptimistic<null | "approved" | "rejected">(null);

  const [copied, setCopied] = useState(false);
  const [copiedAlt, setCopiedAlt] = useState(false);
  const [saving, setSaving] = useState<FormatKey | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedStyle = asCardStyle((draft.generation as { style?: unknown })?.style);
  // What is on screen, which may not be what is saved yet.
  const [preview, setPreview] = useState<CardStyle>(savedStyle);
  const [savedAt, setSavedAt] = useState(0);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [savingStyle, startStyle] = useTransition();

  /**
   * Get the rendered card onto the phone's camera roll.
   *
   * A plain `download` link is a desktop idiom. On iOS Safari it either opens
   * the PNG in a tab or drops it into Files, and neither is where anyone looks
   * for a photo they are about to post to Instagram. The Web Share API is the
   * route to "Save Image" in the iOS share sheet, and it is also how the image
   * gets handed straight to Instagram without a round trip through Photos.
   *
   * Three tiers, best first, because `canShare` with files is still not
   * everywhere: share sheet, then a blob download, then the link's own href.
   * The anchor keeps working with JavaScript off, which is why this hangs off
   * onClick rather than replacing the anchor with a button.
   */
  const saveImage = async (
    event: React.MouseEvent<HTMLAnchorElement>,
    format: FormatKey,
  ) => {
    const name = `${draft.recipe_key}-${format}.png`;
    // Feature-detect before taking over the anchor: if neither route is
    // available, let the browser follow the href as it always did.
    const canShare =
      typeof navigator !== "undefined" && typeof navigator.share === "function";
    if (!canShare && typeof URL.createObjectURL !== "function") return;

    event.preventDefault();
    setSaveError(null);
    setSaving(format);
    try {
      const response = await fetch(renderUrl(draft.id, format, preview, savedAt));
      if (!response.ok) throw new Error(`Render failed (${response.status})`);
      const blob = await response.blob();
      const file = new File([blob], name, { type: "image/png" });

      if (canShare && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }

      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      link.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      // Dismissing the share sheet is a choice, not a failure.
      if ((err as Error)?.name === "AbortError") return;
      setSaveError((err as Error).message);
    } finally {
      setSaving(null);
    }
  };

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

  // Same two verbs as the buttons, no shortcut the buttons do not have. Bound
  // here rather than in the list because the optimistic "Approved" state and
  // the pending guard already live on this card.
  useEffect(() => {
    if (!hotkeys || resolved) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "a") {
        event.preventDefault();
        act("approved");
      } else if (event.key === "r") {
        event.preventDefault();
        act("rejected");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // No dependency list on purpose: rebinding each render is cheap, and it is
    // the only way the handler is guaranteed to see the current `resolved`
    // rather than the value it closed over when the card first mounted.
  });

  const styleName = CARD_STYLES.find((s) => s.key === preview)?.name ?? "";

  return (
    <article className={`card${resolved ? " resolved" : ""}${picked ? " picked" : ""}`}>
      <div className="card-head">
        <div className="card-head-row">
          <span className="recipe-tag">{draft.recipe_key.replace(/_/g, " ")}</span>
          {/* Age, on every card. The queue used to show none at all, so a draft
              written on Tuesday looked exactly like one written a minute ago. */}
          <span className={`age age-${age.state}`}>{age.label}</span>
        </div>
        <h2>{draft.headline}</h2>
      </div>

      {/* The rendered card - what gets posted, not the raw photo. */}
      <img
        className="shot"
        src={renderUrl(draft.id, tab === "x" ? "x" : "ig", preview, savedAt)}
        alt=""
        loading="lazy"
      />

      {/* Every template reads the six style keys, so there is no card where
          this is a dead control - but it is a tweak, not the decision, so it
          costs one line until it is wanted. */}
      <details className="facts">
        <summary>Look: {styleName}</summary>
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
      </details>

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

      {/* Said here rather than up by the date, because this is the moment it
          changes what you do: it is a reason to open the listing before you
          press Approve, not a badge. */}
      {age.note && <p className={`age-note age-${age.state}`}>{age.note}</p>}

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

      {/* Below the decision on purpose. Approving is what sends a post to
          Publish, and Publish is where the image and text are taken from - so
          nothing down here is needed to get a post out, and it stopped sitting
          between the copy and the buttons. */}
      <details className="facts">
        <summary>Source data and downloads</summary>
        <div className="export">
          <a
            className="link"
            href={renderUrl(draft.id, "ig", preview, savedAt)}
            download={`${draft.recipe_key}-ig.png`}
            onClick={(e) => saveImage(e, "ig")}
          >
            {saving === "ig" ? "Saving…" : "Save 4:5"}
          </a>
          <a
            className="link"
            href={renderUrl(draft.id, "x", preview, savedAt)}
            download={`${draft.recipe_key}-x.png`}
            onClick={(e) => saveImage(e, "x")}
          >
            {saving === "x" ? "Saving…" : "Save 16:9"}
          </a>
          {/* Offered only where TikTok is actually one of this post's platforms -
              a 9:16 download on a chart card nobody takes to TikTok is clutter. */}
          {available.includes("tiktok") && (
            <a
              className="link"
              href={renderUrl(draft.id, "tiktok", preview, savedAt)}
              download={`${draft.recipe_key}-tiktok.png`}
              onClick={(e) => saveImage(e, "tiktok")}
            >
              {saving === "tiktok" ? "Saving…" : "Save 9:16"}
            </a>
          )}
          <button className="link" onClick={copyText} type="button">
            {copied ? "Copied" : `Copy ${LABELS[tab]} text`}
          </button>
          {/* X and Instagram both take alt text and both surface it in search.
              It is a separate field in their composers, so it is a separate
              button here rather than something to dig out of the caption. */}
          {draft.copy.alt && (
            <button
              className="link"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(draft.copy.alt ?? "");
                setCopiedAlt(true);
                setTimeout(() => setCopiedAlt(false), 1500);
              }}
            >
              {copiedAlt ? "Copied" : "Copy alt text"}
            </button>
          )}
        </div>
        {saveError && <div className="banner">Could not save the image: {saveError}</div>}
        <pre className="raw">{JSON.stringify(draft.source_data, null, 2)}</pre>
      </details>
    </article>
  );
}
