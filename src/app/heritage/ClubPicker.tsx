"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { previewHeritage, postHeritage, type HeritagePreview } from "./actions.ts";
import type { HeritageClub } from "@/lib/recipes/club-heritage.ts";

/** How many rows the list shows before asking you to type. */
const SHOWN = 20;

/**
 * Pick a club, look at the six shirts, then pay for the copy.
 *
 * Two steps on purpose, the same shape as /drops. The six are chosen by season
 * and nothing about a season string says whether the photographs sit well
 * together, so the reviewer sees the actual card contents before a Claude call
 * is made. It is also the only place the price, size and condition can be
 * checked against the listing they came from.
 */
export function ClubPicker({ clubs }: { clubs: HeritageClub[] }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [preview, setPreview] = useState<HeritagePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ headline?: string } | null>(null);
  const [looking, startLookup] = useTransition();
  const [writing, startWrite] = useTransition();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? clubs.filter((c) => c.team.toLowerCase().includes(q)) : clubs;
  }, [clubs, query]);

  const choose = (team: string) => {
    setError(null);
    setDone(null);
    setChosen(team);
    setPreview(null);
    startLookup(async () => {
      const result = await previewHeritage(team);
      if (result.ok) setPreview(result.preview);
      else setError(result.reason);
    });
  };

  const write = () => {
    if (!preview) return;
    setError(null);
    startWrite(async () => {
      try {
        const outcome = await postHeritage(preview.team);
        if (outcome.status === "created") {
          setDone({ headline: outcome.headline });
          setPreview(null);
          setChosen(null);
        } else {
          setError(outcome.reason ?? "Nothing was produced.");
        }
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  const recent = clubs.find((c) => c.team === chosen)?.postedRecently ?? false;

  return (
    <>
      {done && (
        <section className="card settings">
          <div className="card-head">
            <span className="recipe-tag">Draft created</span>
            <h2>{done.headline}</h2>
            <p className="desc">
              It is waiting in the approval queue, with a card rendered for each network.
              It arrives in the Sweep style, so the field behind the shirts is the colour
              of the first one; the style is switchable there.
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
          <h2>Which club?</h2>
          <p className="desc">
            Every club here has six shirts the card can use. The seasons are the span of
            those six, not of what the club has.
          </p>
        </div>

        <div className="row">
          <label>
            <span className="field-label">Search</span>
            <input
              type="text"
              value={query}
              placeholder="Liverpool"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <div className="club-list">
          {matches.slice(0, SHOWN).map((club) => (
            <button
              key={club.team}
              type="button"
              className="club-row"
              aria-pressed={chosen === club.team}
              onClick={() => choose(club.team)}
              disabled={looking || writing}
            >
              <span>
                <span className="club-name">{club.team}</span>
                <br />
                <span className="club-span">{club.span}</span>
              </span>
              {club.postedRecently && <span className="club-recent">Posted recently</span>}
            </button>
          ))}
        </div>

        {matches.length === 0 && (
          <p className="hint" style={{ padding: "12px 16px" }}>
            No club on the list matches that.
          </p>
        )}
        {matches.length > SHOWN && (
          <p className="hint" style={{ padding: "12px 16px" }}>
            {matches.length - SHOWN} more. Type a few letters of the club&rsquo;s name to
            find it.
          </p>
        )}
      </section>

      {looking && <div className="banner">Reading {chosen}&rsquo;s shirts…</div>}
      {error && <div className="banner">{error}</div>}

      {preview && (
        <section className="card settings">
          <div className="card-head">
            <span className="recipe-tag">Step 2</span>
            <h2>{preview.team}</h2>
            <p className="desc">
              {preview.span}. Check the six before generating: writing the post calls
              Claude and creates a draft.
            </p>
          </div>

          {/* Said here rather than enforced, because this page is somebody
              choosing on purpose. A club that ran last month is usually a
              mistake and occasionally exactly what you meant. */}
          {recent && (
            <div className="setup">
              <strong>This club had a heritage post recently</strong>
              <p>
                Within the last few months, so these six will be much the same shirts as
                last time. Post it anyway if that is what you want.
              </p>
            </div>
          )}

          <div className="heritage-grid">
            {preview.shirts.map((shirt) => (
              <div className="heritage-item" key={shirt.productId}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shirt.imageUrl} alt="" loading="lazy" />
                <span className="heritage-season">
                  {shirt.season} · {shirt.kit}
                </span>
                <span className="heritage-price">{shirt.price}</span>
                <span className="heritage-detail">
                  {[shirt.condition, shirt.size ? `Size ${shirt.size}` : null]
                    .filter(Boolean)
                    .join(" · ") || "No size or condition on the listing"}
                </span>
              </div>
            ))}
          </div>

          <p className="hint" style={{ padding: "0 16px 12px" }}>
            Each price is what a buyer pays, fee included, and the size and condition
            belong to that same listing rather than to whichever copy of the shirt was
            listed last.
          </p>

          <div className="verify">
            {preview.shirts[0]?.productUrl && (
              <a href={preview.shirts[0].productUrl} target="_blank" rel="noreferrer">
                Open the first one on Kickio ↗
              </a>
            )}
          </div>

          <div className="actions">
            <button className="btn approve" onClick={write} disabled={writing} type="button">
              {writing ? "Writing…" : "Generate the post"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
