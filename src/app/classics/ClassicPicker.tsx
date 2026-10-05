"use client";

import { useRef, useState, useTransition } from "react";
import { postClassic } from "./actions.ts";
import { looksLikeImage, type ClassicShirt, type ClassicUse } from "@/lib/recipes/classics.ts";
import {
  gettySearchUrl,
  imageSearchUrl,
  photoTerms,
  type EraPlayer,
} from "@/lib/recipes/era-players.ts";
import { uploadPhoto } from "@/lib/upload/browser.ts";

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * What happened last time this shirt was used.
 *
 * The four states are genuinely different decisions and the list used to
 * collapse them into one line that said "posted recently" for all of them.
 * Published means it went out: every platform the draft carried copy for is
 * confirmed in the publish log. Cleared means a person approved it and it is
 * sitting on the Publish page waiting to be posted, which is a reason to go
 * and finish that rather than write a second one. In the queue means nobody
 * has read it yet. Rejected means somebody looked and said no, and the shirt
 * is free again - the cooldown holds it for a while so the same reject does
 * not come straight back, but it is not "used".
 */
function UseBadge({ use, recent }: { use: ClassicUse; recent: boolean }) {
  const [tone, text] =
    use.published
      ? ["published", `Published ${whenLabel(use.at)}`]
      : use.status === "approved"
        ? ["cleared", `Cleared to post ${whenLabel(use.at)}`]
        : use.status === "rejected"
          ? ["rejected", `Rejected ${whenLabel(use.at)}`]
          : use.status === "expired"
            ? ["rejected", `Expired out of the queue ${whenLabel(use.at)}`]
            : ["queued", `In the queue since ${whenLabel(use.at)}`];

  return (
    <div className="pick-meta">
      <span className={`use-badge ${tone}`}>{text}</span>
      {recent && !use.published && use.status !== "approved" && (
        <span className="use-note">still inside the cooldown</span>
      )}
    </div>
  );
}

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
  shirt: ClassicShirt & {
    postedRecently: boolean;
    use: ClassicUse | null;
    players: EraPlayer[];
  };
}) {
  const [open, setOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoCredit, setPhotoCredit] = useState("");
  const [photoPlayer, setPhotoPlayer] = useState(shirt.playerName ?? "");
  const [result, setResult] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const choose = async (file: File | null | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const stored = await uploadPhoto(file, "kickio-classics");
      setPhotoUrl(stored.url);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      // Cleared so choosing the same file again still fires a change event,
      // which it does not otherwise - the commonest way a retry looks broken.
      if (fileInput.current) fileInput.current.value = "";
    }
  };

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
          {shirt.use && <UseBadge use={shirt.use} recent={shirt.postedRecently} />}
        </div>

        <button className="btn pick-btn" type="button" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Add photo"}
        </button>
      </div>

      {open && (
        <>
          <div className="row">
            <span className="field-label">Who to look for</span>
            <p className="hint">
              Players we can show were at {shirt.team ?? "this club"} around{" "}
              {shirt.season ?? "then"}. A name opens an image search for that player in
              this kit, and fills in the field below. It is a starting point, not a squad
              list: check the photograph shows this shirt before you use it.
            </p>

            {shirt.players.length > 0 ? (
              <ul className="players">
                {shirt.players.map((player) => (
                  <li key={player.name}>
                    <a
                      href={imageSearchUrl(
                        photoTerms({
                          player: player.name,
                          team: shirt.team,
                          season: shirt.season,
                          kit: shirt.kit,
                        }),
                      )}
                      target="_blank"
                      rel="noreferrer noopener"
                      onClick={() => setPhotoPlayer(player.name)}
                    >
                      {player.name}
                    </a>
                    <a
                      className="getty"
                      href={gettySearchUrl(
                        photoTerms({
                          player: player.name,
                          team: shirt.team,
                          season: shirt.season,
                        }),
                      )}
                      target="_blank"
                      rel="noreferrer noopener"
                      title="The same search at Getty, where the licensed version is"
                    >
                      Getty
                    </a>
                    {/* Said out loud, because the two halves of this list are
                        not equally checked. A career on file is dated to the
                        season; a name off a shirt is a name somebody printed on
                        a shirt from around then, which is weaker.

                        A name off a DIFFERENT season is weaker again, and it is
                        marked: the catalogue offers Bergkamp for a 1993-94
                        Arsenal shirt off a 1995-96 one, and he did not sign
                        until 1995. The engine cannot know that. Showing which
                        season the name came from is what lets a person see it. */}
                    {player.source === "catalogue" && (
                      <span
                        className={`whence${
                          player.season && player.season !== shirt.season ? " off" : ""
                        }`}
                      >
                        printed on {player.season ? `a ${player.season} ` : "a "}shirt
                        {player.season && player.season !== shirt.season
                          ? ", not this season"
                          : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">
                No players on file for this club and season. The kit search below is the
                place to start.
              </p>
            )}

            <div className="players-also">
              <span>Or the kit on its own:</span>
              <a
                href={imageSearchUrl(
                  photoTerms({ team: shirt.team, season: shirt.season, kit: shirt.kit }),
                )}
                target="_blank"
                rel="noreferrer noopener"
              >
                Google Images
              </a>
              <a
                href={gettySearchUrl(
                  photoTerms({ team: shirt.team, season: shirt.season, kit: shirt.kit }),
                )}
                target="_blank"
                rel="noreferrer noopener"
              >
                Getty
              </a>
            </div>
          </div>

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
              {/* `accept` rather than a capture hint: the picture is nearly
                  always one already saved to the device from a licensing site,
                  not one taken on the spot. */}
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

            {/* Kept visible after an upload rather than hidden: it is where the
                stored address appears, which is how someone sees the upload
                worked, and it is how a wrong one gets cleared. */}
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
