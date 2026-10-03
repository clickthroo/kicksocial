"use client";

import { useState, useTransition } from "react";
import { postClassic } from "./actions.ts";
import { looksLikeImage, type ClassicShirt } from "@/lib/recipes/classics.ts";

/**
 * One qualifying shirt, and the photograph that turns it into a post.
 *
 * The fields are collapsed until someone opens them, because the list is read
 * as a list - "which shirt" comes before "which picture", and three inputs on
 * every row would bury the shirts under their own form.
 */
export function ClassicPicker({
  shirt,
}: {
  shirt: ClassicShirt & { postedRecently: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoCredit, setPhotoCredit] = useState("");
  const [photoPlayer, setPhotoPlayer] = useState(shirt.playerName ?? "");
  const [result, setResult] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Checked as you type rather than on submit, because the usual mistake is
  // pasting the address of the page an image sits on, and finding that out
  // after a failed run wastes a copy generation.
  const urlLooksWrong = photoUrl.trim() !== "" && !looksLikeImage(photoUrl.trim());
  const ready = photoUrl.trim() !== "" && !urlLooksWrong && photoCredit.trim() !== "";

  const go = () => {
    setResult(null);
    startTransition(async () => {
      try {
        const outcome = await postClassic({
          productId: shirt.productId,
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
    <article className={`card pick${done ? " resolved" : ""}`}>
      <div className="pick-row">
        {shirt.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pick-shot" src={shirt.thumbUrl} alt="" loading="lazy" />
        ) : (
          <div className="pick-shot" />
        )}

        <div className="pick-main">
          <h2>{shirt.title}</h2>
          <div className="pick-stock good">
            From {shirt.price}
            {shirt.listingsCount > 1 ? ` · ${shirt.listingsCount} listed` : " · 1 listed"}
          </div>
          <div className="pick-meta">
            {[shirt.season, shirt.team, shirt.kit].filter(Boolean).join(" · ")}
            {shirt.manufacturer ? ` · ${shirt.manufacturer}` : ""}
          </div>
          {shirt.postedRecently && (
            <div className="pick-meta">Posted recently, so it is probably not the one</div>
          )}
        </div>

        <button className="btn pick-btn" type="button" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Add photo"}
        </button>
      </div>

      {open && (
        <>
          <div className="row">
            <span className="field-label">Photograph URL</span>
            <p className="hint">
              A direct link to the image file, ending .jpg, .png or .webp. One Kickio owns
              or has licensed.
            </p>
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
