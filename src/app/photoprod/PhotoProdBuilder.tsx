"use client";

import { useRef, useState, useTransition } from "react";
import { lookupShirt, postPhotoProd } from "./actions.ts";
import { looksLikeImage } from "@/lib/recipes/classics.ts";
import type { PhotoProdShirt } from "@/lib/recipes/photo-prod.ts";
import { uploadPhoto } from "@/lib/upload/browser.ts";

/**
 * Paste a link, add a picture, make the post.
 *
 * Two steps rather than one form, the same shape as Drops: the link is
 * resolved and shown first, because the commonest mistake is pasting the wrong
 * shirt and the cheapest moment to notice that is before a copy generation has
 * been paid for.
 */
export function PhotoProdBuilder() {
  const [url, setUrl] = useState("");
  const [shirt, setShirt] = useState<PhotoProdShirt | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const [photoUrl, setPhotoUrl] = useState("");
  const [photoCredit, setPhotoCredit] = useState("");
  const [photoPlayer, setPhotoPlayer] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const urlLooksWrong = photoUrl.trim() !== "" && !looksLikeImage(photoUrl.trim());
  const ready =
    shirt !== null && photoUrl.trim() !== "" && !urlLooksWrong && photoCredit.trim() !== "";

  const look = async () => {
    setLookupError(null);
    setShirt(null);
    setResult(null);
    setDone(false);
    setLooking(true);
    try {
      const outcome = await lookupShirt(url);
      if (outcome.ok) {
        setShirt(outcome.shirt);
        // A seed rather than a decision: the name printed on the shirt is
        // often not who is in the photograph, and the field is editable.
        setPhotoPlayer(outcome.shirt.playerName ?? "");
      } else {
        setLookupError(outcome.reason);
      }
    } catch (err) {
      setLookupError((err as Error).message);
    } finally {
      setLooking(false);
    }
  };

  const choose = async (file: File | null | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const stored = await uploadPhoto(file, "photo-prod");
      setPhotoUrl(stored.url);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const go = () => {
    setResult(null);
    startTransition(async () => {
      try {
        const outcome = await postPhotoProd({
          productUrl: url.trim(),
          photoUrl: photoUrl.trim(),
          photoCredit: photoCredit.trim(),
          photoPlayer: photoPlayer.trim() || undefined,
        });
        setDone(outcome.status === "created");
        setResult(
          outcome.status === "created"
            ? "Draft created. It is waiting in the queue"
            : `${outcome.status === "skipped" ? "Not posted" : "Failed"}: ${outcome.reason ?? ""}`,
        );
      } catch (err) {
        setResult((err as Error).message);
      }
    });
  };

  return (
    <article className={`card${done ? " resolved" : ""}`}>
      <div className="row">
        <span className="field-label">The shirt on Kickio</span>
        <p className="hint">
          The product page link, or a link to one seller&rsquo;s listing of it: either
          resolves to the same shirt.
        </p>
        <input
          type="url"
          className="pub-url"
          placeholder="https://kickio.com/marketplace/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="actions">
          <button className="btn" type="button" onClick={look} disabled={looking || !url.trim()}>
            {looking ? "Looking…" : shirt ? "Look again" : "Find it"}
          </button>
        </div>
        {lookupError && <p className="hint upload-failed">{lookupError}</p>}
      </div>

      {shirt && (
        <>
          <div className="pick-row">
            {shirt.thumbUrl ? (
              // Kickio's own catalogue shot, so the admin can see the link
              // resolved to the shirt they meant. It never goes on the card.
              // eslint-disable-next-line @next/next/no-img-element
              <img className="pick-shot" src={shirt.thumbUrl} alt="" />
            ) : (
              <div className="pick-shot" />
            )}
            <div className="pick-main">
              <h2>{shirt.title}</h2>
              <div className={`pick-stock${shirt.forSale ? " good" : ""}`}>
                {shirt.forSale
                  ? `From ${shirt.price}${
                      shirt.listingsCount > 1 ? ` · ${shirt.listingsCount} listed` : " · 1 listed"
                    }`
                  : "Nothing listed for sale right now"}
              </div>
              <div className="pick-meta">
                {[shirt.season, shirt.team, shirt.kit].filter(Boolean).join(" · ")}
                {shirt.manufacturer ? ` · ${shirt.manufacturer}` : ""}
              </div>
            </div>
          </div>

          {!shirt.forSale && (
            // Allowed, but said plainly. The post still links to the product
            // page, and the copy is told not to imply it can be bought.
            <div className="notice">
              <strong>Nothing is listed for this shirt.</strong> The card will carry no
              price and the copy is told not to write about buying it. The post still
              points at the product page, which is where a listing would appear.
            </div>
          )}

          <div className="row">
            <span className="field-label">The photograph</span>
            <p className="hint">
              Upload the image, or paste a direct link to one. Either way it has to be an
              image Kickio owns or has licensed: where the file came from changes nothing
              about who owns it.
            </p>

            <div className="upload">
              <button
                className="btn"
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Uploading…" : "Choose a photo"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void choose(e.target.files?.[0])}
              />
              <span className="upload-note">
                A photo off a phone is converted and resized here before it is sent.
              </span>
            </div>
            {uploadError && <p className="hint upload-failed">{uploadError}</p>}

            <span className="upload-or">or paste a link</span>
            <input
              type="url"
              className="pub-url"
              placeholder="https://…/photo.jpg"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
            />
            {urlLooksWrong && (
              <p className="hint">
                That looks like a web page rather than an image file. Open the image on its
                own and copy that address.
              </p>
            )}
          </div>

          <div className="row">
            <span className="field-label">Credit</span>
            <p className="hint">Required. It is printed on the card.</p>
            <input
              type="text"
              className="pub-url"
              placeholder="e.g. Getty Images / Allsport"
              value={photoCredit}
              onChange={(e) => setPhotoCredit(e.target.value)}
            />
          </div>

          <div className="row">
            <span className="field-label">Player in the photograph</span>
            <p className="hint">
              Optional, and named on the card where given. Leave it out rather than guess:
              the copy is told it may say they wore the shirt.
            </p>
            <input
              type="text"
              className="pub-url"
              placeholder="e.g. Paul Gascoigne"
              value={photoPlayer}
              onChange={(e) => setPhotoPlayer(e.target.value)}
            />
          </div>

          {photoUrl.trim() !== "" && !urlLooksWrong && (
            // Shown before the post is written, because a broken or wrong
            // image is far cheaper to notice here than in the queue.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="shot" src={photoUrl.trim()} alt="" />
          )}

          <div className="actions">
            <button
              className="btn approve"
              type="button"
              onClick={go}
              disabled={!ready || isPending || done}
            >
              {isPending ? "Writing…" : done ? "Queued" : "Make the post"}
            </button>
          </div>
        </>
      )}

      {result && <div className="pick-result">{result}</div>}
    </article>
  );
}
