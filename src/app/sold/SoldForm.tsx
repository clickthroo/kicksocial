"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { lookupForForm, generateJustSold, type ProductPreview } from "./actions.ts";

const today = () => new Date().toISOString().slice(0, 10);

export function SoldForm() {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<ProductPreview | null>(null);
  const [price, setPrice] = useState("");
  const [soldAt, setSoldAt] = useState(today());
  const [condition, setCondition] = useState("");
  const [size, setSize] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ draftId?: string; headline?: string } | null>(null);
  const [looking, startLookup] = useTransition();
  const [generating, startGenerate] = useTransition();

  const lookup = () => {
    setError(null);
    setDone(null);
    startLookup(async () => {
      const result = await lookupForForm(url);
      if (result.ok) {
        setPreview(result.preview);
        // Prefill from the record; the admin can still correct either.
        const c = result.preview.facts.find((f) => f.label === "Condition");
        const s = result.preview.facts.find((f) => f.label === "Size");
        setCondition(c?.value ?? "");
        setSize(s?.value ?? "");
      } else {
        setPreview(null);
        setError(result.reason);
      }
    });
  };

  const generate = () => {
    setError(null);
    const pounds = Number(price);
    if (!Number.isFinite(pounds) || pounds <= 0) {
      setError("Enter what it sold for.");
      return;
    }
    startGenerate(async () => {
      try {
        const outcome = await generateJustSold({
          url,
          priceCents: Math.round(pounds * 100),
          soldAt,
          condition: condition || undefined,
          size: size || undefined,
          note: note || undefined,
        });
        if (outcome.status === "created") {
          setDone({ draftId: outcome.draftId, headline: outcome.headline });
          setPreview(null);
          setUrl("");
          setPrice("");
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
              It is waiting in the approval queue with the card rendered for each network.
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
          <h2>Which shirt sold?</h2>
          <p className="desc">
            Paste its Kickio link. Everything about the shirt is read from Kickio&apos;s own
            record — nothing is taken from the page itself.
          </p>
        </div>

        <div className="row">
          <label>
            <span className="field-label">Kickio listing URL</span>
            <input
              type="url"
              value={url}
              placeholder="https://kickio.com/marketplace/1990-92-england-third-shirt"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
        </div>

        <div className="actions">
          <button className="btn" onClick={lookup} disabled={looking || !url.trim()}>
            {looking ? "Looking up…" : "Look up shirt"}
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
              Check this is the right shirt before generating — writing the post calls
              Claude and creates a draft.
            </p>
          </div>

          {preview.photo ? (
            <img className="shot sold-photo" src={preview.photo} alt="" />
          ) : (
            <div className="banner">
              No photo the card can render. {preview.unrenderableImages} photo(s) on this
              product are in a format the renderer cannot decode, so a post would have an
              empty frame where the shirt should be.
            </div>
          )}

          {preview.facts.length > 0 && (
            <div className="row sold-facts">
              {preview.facts.map((f) => (
                <div className="sold-fact" key={f.label}>
                  <span className="field-label">{f.label}</span>
                  <span>{f.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="verify">
            <a href={preview.kickioUrl} target="_blank" rel="noreferrer">
              Open on Kickio ↗
            </a>
          </div>

          <div className="row grid">
            <label>
              <span className="field-label">Sold for (£)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Sold on</span>
              <input type="date" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} />
            </label>
            <label>
              <span className="field-label">Condition</span>
              <input
                type="text"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Size</span>
              <input type="text" value={size} onChange={(e) => setSize(e.target.value)} />
            </label>
          </div>

          <p className="hint" style={{ padding: "0 16px" }}>
            The price is the one thing here that is not read from Kickio, so the draft
            records it as entered by you rather than as a verified figure. Enter what the
            buyer actually paid — no fee is added on top.
          </p>

          <div className="row">
            <span className="field-label">Note for the writer (optional)</span>
            <p className="hint">
              Context only, e.g. &quot;went in under an hour&quot;. It is never treated as a
              checkable fact.
            </p>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="actions">
            <button className="btn approve" onClick={generate} disabled={generating}>
              {generating ? "Writing the post…" : "Generate post"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
