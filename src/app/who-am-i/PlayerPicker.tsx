"use client";

import { useState, useTransition } from "react";
import { postWhoAmI } from "./actions.ts";
import type { QualifyingPlayer } from "@/lib/recipes/who-am-i.ts";

/**
 * One career the shelf can currently carry.
 *
 * The six shirts are shown because they ARE the post - a reviewer picking from
 * names alone would be choosing blind, and whether a grid looks good is most of
 * whether the puzzle works. The name is here too: this screen is the one place
 * the answer is allowed to be visible.
 */
export function PlayerPicker({
  player,
  isNew = false,
}: {
  player: QualifyingPlayer;
  /** First seen on this list within the last week. */
  isNew?: boolean;
}) {
  const [result, setResult] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const go = () => {
    setResult(null);
    startTransition(async () => {
      try {
        const outcome = await postWhoAmI(player.key);
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
        <div className="pick-main">
          <h2>
            {player.display}
            {isNew && <span className="tag-new">New</span>}
          </h2>
          <div className="pick-meta">
            {player.countries} {player.countries === 1 ? "country" : "countries"} ·{" "}
            {player.span} · {player.clubs} clubs we can show
            {player.spare > 0 ? ` (${player.spare} spare)` : ""}
          </div>
          {player.postedAt && (
            <div className="pick-meta">
              Last posted {new Date(player.postedAt).toLocaleDateString("en-GB")}
            </div>
          )}
        </div>

        <button className="btn pick-btn" onClick={go} disabled={isPending || done} type="button">
          {isPending ? "Writing…" : done ? "Queued" : "Make the post"}
        </button>
      </div>

      <div className="pick-grid">
        {player.shirts.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" loading="lazy" />
        ))}
      </div>

      {result && <div className="pick-result">{result}</div>}
    </article>
  );
}
