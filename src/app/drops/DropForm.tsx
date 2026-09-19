"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { lookupListing, generateKickioDrop, type DropPreview } from "./actions.ts";

export function DropForm() {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ draftId?: string; headline?: string } | null>(null);
  const [looking, startLookup] = useTransition();
  const [generating, startGenerate] = useTransition();

  const lookup = () => {
    setError(null);
    setDone(null);
    startLookup(async () => {
      const result = await lookupListing(url);
      if (result.ok) setPreview(result.preview);
      else {
        setPreview(null);
        setError(result.reason);
      }
    });
  };

  const generate = () => {
    setError(null);
    startGenerate(async () => {
      try {
        const outcome = await generateKickioDrop({ url, note: note || undefined });
        if (outcome.status === "created") {
          setDone({ draftId: outcome.draftId, headline: outcome.headline });
          setPreview(null);
          setUrl("");
          setNote("");
        } else {
          setError(outcome.reason ?? "Nothing was produced.");
        }
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  return (
    <>
      {done && (
        <section className="card settings">
          <div className="card-head">
            <span className="recipe-tag">Draft created</span>
            <h2>{done.headline}</h2>
            <p className="desc">
              It is waiting in the approval queue, with a card rendered for each network
              and the style switchable there.
            </p>
          </div>
          <div className="actions">
            <Link className="btn approve" href="/" style={{ textAlign: "center" }}>
              Open the queue
            </Link>
          </div>
        </section>
      )}

      <section className="card settings">
        <div className="card-head">
          <span className="recipe-tag">Step 1</span>
          <h2>Which listing?</h2>
          <p className="desc">
            Paste the <strong>listing</strong> link — one seller&apos;s copy of a shirt, not
            the product page. The post will link to the product page, so it still works
            after this one sells.
          </p>
        </div>

        <div className="row">
          <label>
            <span className="field-label">Kickio listing URL</span>
            <input
              type="url"
              value={url}
              placeholder="https://kickio.com/listings/21b7f8c2-6e2c-4203-9d0a-65f93232cf6b"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
        </div>

        <div className="actions">
          <button className="btn" onClick={lookup} disabled={looking || !url.trim()}>
            {looking ? "Looking up…" : "Look up listing"}
          </button>
        </div>
      </section>

      {error && <div className="banner">{error}</div>}

      {preview && (
        <section className="card settings">
          <div className="card-head">
            <span className="recipe-tag">Step 2</span>
            <h2>{preview.title}</h2>
            <p className="desc">
              Check this is right before generating — writing the post calls Claude and
              creates a draft.
            </p>
          </div>

          {preview.photo ? (
            <img className="shot sold-photo" src={preview.photo} alt="" />
          ) : (
            <div className="banner">No photo the card can use, on the product or the listing.</div>
          )}

          {/* The whole reason the price and the link can disagree. Shown before
              generating, not after, so the decision costs nothing. */}
          {preview.warning && <div className="setup"><strong>Cheaper one available</strong><p>{preview.warning}</p></div>}

          {preview.photoSource === "listing" && (
            <p className="hint" style={{ padding: "0 16px" }}>
              Using the seller&apos;s own photos — this product has no catalogue image the
              card can use. They show the actual item rather than the reference shot.
            </p>
          )}

          <div className="row sold-facts">
            <div className="sold-fact">
              <span className="field-label">Price</span>
              <span>{preview.price}</span>
            </div>
            {preview.facts.map((f) => (
              <div className="sold-fact" key={f.label}>
                <span className="field-label">{f.label}</span>
                <span>{f.value}</span>
              </div>
            ))}
          </div>

          <div className="verify">
            <a href={preview.kickioUrl} target="_blank" rel="noreferrer">
              Open the product on Kickio ↗
            </a>
          </div>

          <p className="hint" style={{ padding: "0 16px" }}>
            The price includes buyer protection, so it matches what someone pays at
            checkout. It is read from the listing, not typed.
          </p>

          <div className="row">
            <span className="field-label">Note for the writer (optional)</span>
            <p className="hint">
              Context only, e.g. &quot;last one we&apos;ve seen in this size&quot;. It is
              never treated as a checkable fact.
            </p>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="actions">
            <button className="btn approve" onClick={generate} disabled={generating}>
              {generating ? "Writing…" : "Generate the post"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
