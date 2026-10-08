"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { approveDraft, rejectDraft, chooseStyle, replacePhoto } from "./actions.ts";
import { uploadPhoto } from "@/lib/upload/browser.ts";
import { CARD_STYLES, asCardStyle, type CardStyle } from "@/lib/render/styles.ts";
import type { FormatKey } from "@/lib/render/templates.tsx";
import { exportLength, exportText, overBy, platformTags, tagLimit, xLength } from "@/lib/copy/export.ts";
import { PLATFORM_LIMITS, leadLength, willCollapse } from "@/lib/copy/limits.ts";
import type { Freshness } from "@/lib/engine/freshness.ts";
import type { Platform, PostDraft } from "@/lib/engine/types.ts";

const LABELS: Record<Platform, string> = { x: "X", instagram: "Instagram", tiktok: "TikTok" };

/**
 * Inline rather than an icon font or a package: two shapes, and Satori is not
 * involved here so plain SVG is fine. `currentColor` so the button's own state
 * colours them without a second rule.
 */
function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12.5 9 17.5 20 6.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * How many tags the draft has, and how many of them will survive the post.
 *
 * "30/5 hashtags" reads as a validation error on a draft that is perfectly
 * fine; the draft is not broken, the platform changed under it. Instagram cut
 * its cap from thirty to five in December 2025, so every draft written before
 * that carries thirty. The export caps them, so nothing is lost at the point of
 * pasting - this just says so rather than leaving the reviewer to wonder which
 * five they are getting.
 */
function TagCount({ written, platform }: { written: number; platform: Platform }) {
  const limit = tagLimit(platform);
  if (written <= limit) return <>{`${written}/${limit} hashtags`}</>;
  return <>{`${written} hashtags written, the ${limit} shown are what will post`}</>;
}

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
  const [copyFailed, setCopyFailed] = useState(false);
  const [copiedAlt, setCopiedAlt] = useState(false);
  const [saving, setSaving] = useState<FormatKey | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The draft's own pictures, held in state because they can be changed here
  // and the card has to redraw without a round trip through the server render.
  const [images, setImages] = useState<string[]>(() =>
    Array.isArray(draft.source_data.images)
      ? (draft.source_data.images as unknown[]).filter((u): u is string => typeof u === "string")
      : [],
  );
  const [swapping, setSwapping] = useState<number | "append" | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // Which slot the file dialog was opened for. A ref rather than state because
  // the change event fires long after the click and must not read a value that
  // a re-render has moved on from.
  const photoSlot = useRef<number | "append">("append");

  const choosePhoto = async (file: File | null | undefined) => {
    if (!file) return;
    const slot = photoSlot.current;
    setPhotoError(null);
    setSwapping(slot);
    try {
      const stored = await uploadPhoto(file, draft.recipe_key);
      setImages(await replacePhoto(draft.id, stored.url, slot));
      // Busts the render cache: the URL is unchanged but the card behind it
      // is not, and without this the preview shows the old photo.
      setSavedAt(Date.now());
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setSwapping(null);
      if (photoInput.current) photoInput.current.value = "";
    }
  };

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
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The clipboard is refused outside a secure context and by some
      // permission policies. Swallowing that left a button that looked like it
      // had worked and had not, which is worse than the post going out unsent.
      setCopied(false);
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2500);
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

      {/* Every post type passes through this queue, including the ones cron
          writes that have no form anywhere to put this on. So the photo swap
          lives here, beside the rendered card that shows you it is needed. */}
      <details className="facts">
        <summary>
          {images.length === 1 ? "Photo" : `Photos: ${images.length}`}
        </summary>
        <div className="photos">
          <p className="styles-note">
            The pictures this card draws, in the order it draws them. Replacing one
            changes this draft only, never the listing on Kickio.
          </p>
          <div className="photo-strip">
            {images.map((url, i) => (
              <div className="photo-slot" key={`${i}-${url}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" loading="lazy" />
                <button
                  type="button"
                  className="btn"
                  disabled={swapping !== null}
                  onClick={() => {
                    photoSlot.current = i;
                    photoInput.current?.click();
                  }}
                >
                  {swapping === i ? "Uploading…" : "Replace"}
                </button>
              </div>
            ))}
            <div className="photo-slot add">
              <button
                type="button"
                className="btn"
                disabled={swapping !== null}
                onClick={() => {
                  photoSlot.current = "append";
                  photoInput.current?.click();
                }}
              >
                {swapping === "append"
                  ? "Uploading…"
                  : images.length === 0
                    ? "Add a photo"
                    : "Add another"}
              </button>
            </div>
          </div>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void choosePhoto(e.target.files?.[0])}
          />
          {photoError && <p className="styles-note photo-failed">{photoError}</p>}

          {/* Kickio Classics prints the credit on the card, and the credit
              belongs to the photograph rather than to the draft. Swapping the
              picture here and leaving the line alone publishes somebody else's
              attribution over somebody's work, which is worse than no credit.
              Nothing in the queue can edit it, so the honest move is to say so
              and send them back to rebuild the post. */}
          {typeof draft.source_data.photo_credit === "string" && (
            <p className="styles-note photo-credit-warning">
              This card prints the credit &ldquo;{String(draft.source_data.photo_credit)}
              &rdquo;. That belongs to the photograph that was here, not to a new one, and
              it cannot be edited from the queue. If you swap the picture, reject this
              draft and build it again with the right credit.
            </p>
          )}
          {images.length === 0 && !photoError && (
            <p className="styles-note">
              This draft carries no pictures. Some cards are built from a chart rather
              than a photograph, so that may be correct.
            </p>
          )}
        </div>
      </details>

      {/* The copy button lives here, on the row above the text it copies, and
          is rendered even for a single-platform post where there are no tabs.
          It used to be the fourth item inside a collapsed "Source data and
          downloads" panel, which is two clicks and a scroll away from the only
          thing anyone comes to this card to take. */}
      <div className="tabs" role={available.length > 1 ? "tablist" : undefined}>
        {available.length > 1 &&
          available.map((p) => (
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
        <button
          className={`copy-btn${copied ? " is-done" : ""}`}
          type="button"
          onClick={copyText}
          aria-label={`Copy the ${LABELS[tab]} post text`}
          title={`Copy the ${LABELS[tab]} post text`}
        >
          {copied ? <TickIcon /> : <CopyIcon />}
          <span>{copied ? "Copied" : copyFailed ? "Could not copy" : "Copy"}</span>
        </button>
      </div>

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
              <p className="hashtags">{platformTags(draft.copy.x.hashtags, "x")}</p>
            ) : null}
            <span className={`count${xLength(draft.copy) > PLATFORM_LIMITS.x.chars ? " count over" : ""}`}>
              {willCollapse(draft.copy.x.text)
                ? `lead ${leadLength(draft.copy.x.text)}/${PLATFORM_LIMITS.x.lead} · ` +
                  `${xLength(draft.copy)} total · grey text is behind “Show more”`
                : `${xLength(draft.copy)} characters · shows in full`}
            </span>
          </>
        )}

        {tab === "instagram" && draft.copy.instagram && (
          <>
            <p>{draft.copy.instagram.caption}</p>
            <p className="hashtags">{platformTags(draft.copy.instagram.hashtags, "instagram")}</p>
            <span
              className={`count${overBy(draft.copy, "instagram") > 0 ? " count over" : ""}`}
            >
              {exportLength(draft.copy, "instagram")}/{PLATFORM_LIMITS.instagram.chars}{" "}
              characters with tags ·{" "}
              <TagCount written={draft.copy.instagram.hashtags.length} platform="instagram" />
            </span>
          </>
        )}

        {tab === "tiktok" && draft.copy.tiktok && (
          <>
            {/* The caption first, because it is the post. The script below it
                is for whoever cuts the video, and is never what gets pasted. */}
            {draft.copy.tiktok.caption ? (
              willCollapse(draft.copy.tiktok.caption, "tiktok") ? (
                <p>
                  {draft.copy.tiktok.caption.slice(0, PLATFORM_LIMITS.tiktok.lead)}
                  <span className="collapsed">
                    {draft.copy.tiktok.caption.slice(PLATFORM_LIMITS.tiktok.lead)}
                  </span>
                </p>
              ) : (
                <p>{draft.copy.tiktok.caption}</p>
              )
            ) : (
              <p className="collapsed">
                Written before captions existed on this card. The script below is what
                the Copy button will give you.
              </p>
            )}
            {draft.copy.tiktok.hashtags?.length ? (
              <p className="hashtags">{platformTags(draft.copy.tiktok.hashtags, "tiktok")}</p>
            ) : null}
            {draft.copy.tiktok.caption && (
              <span
                className={`count${overBy(draft.copy, "tiktok") > 0 ? " count over" : ""}`}
              >
                {exportLength(draft.copy, "tiktok")} characters with tags · aiming at{" "}
                {PLATFORM_LIMITS.tiktok.target} ·{" "}
                {willCollapse(draft.copy.tiktok.caption, "tiktok")
                  ? `grey text is behind “more”`
                  : "shows in full"}
              </span>
            )}

            <details className="facts">
              <summary>Video script</summary>
              <p>{draft.copy.tiktok.hook}</p>
              <ol className="beats">
                {draft.copy.tiktok.beats.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ol>
              <p>{draft.copy.tiktok.cta}</p>
            </details>
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
          <strong>About {String(draft.source_data.collector_handle)}</strong>: a real
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
              {c.basis ? ` · ${c.basis}` : ""}
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
