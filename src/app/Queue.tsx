"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DraftCard } from "./DraftCard.tsx";
import type { Freshness } from "@/lib/engine/freshness.ts";
import type { PostDraft } from "@/lib/engine/types.ts";

/**
 * The queue, on a phone and on a computer, from one render.
 *
 * On a phone the drafts stack as they always have: one thumb, one card at a
 * time, scroll to the next. On a wide screen that is a bad use of the space -
 * you scroll past a whole post to find out whether the next one is worth
 * looking at, and there is no sense of how much is left. So above 1000px the
 * same markup becomes a list on the left and the picked draft on the right,
 * with j/k to move and a/r to decide without reaching for the mouse.
 *
 * WHY CSS DECIDES AND NOT JAVASCRIPT. There is one tree, and the media query
 * hides what the other layout does not need. Branching on a measured width
 * would mean the server renders one layout and the browser swaps to the other
 * on first paint - a flash on every load, and two code paths to keep honest.
 * Cards the wide layout hides are `display: none`, so their lazy images never
 * fetch: the rail costs nothing.
 */
/**
 * Whether the split layout is up. Matches the breakpoint in globals.css, and
 * has to: it gates the keyboard shortcuts, and a shortcut that fires while
 * nothing on screen is highlighted is a decision taken blind.
 *
 * Starts false so the server's HTML and the first paint agree - the hint line
 * appears a frame later, which is the cheap half of the trade.
 */
function useWideLayout(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1000px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return wide;
}

export function Queue({
  drafts,
  ages,
}: {
  drafts: PostDraft[];
  ages: Record<string, Freshness>;
}) {
  const [picked, setPicked] = useState<string | null>(drafts[0]?.id ?? null);
  const paneRef = useRef<HTMLDivElement>(null);
  const wide = useWideLayout();

  // A decision removes a draft from the list, and the id that was picked goes
  // with it. Land on whatever took its place rather than on nothing.
  const current = drafts.some((d) => d.id === picked) ? picked : (drafts[0]?.id ?? null);
  useEffect(() => {
    if (current !== picked) setPicked(current);
  }, [current, picked]);

  const move = useCallback(
    (delta: number) => {
      const index = drafts.findIndex((d) => d.id === current);
      const next = drafts[Math.min(drafts.length - 1, Math.max(0, index + delta))];
      if (next) setPicked(next.id);
      // The right-hand pane scrolls independently, so a new draft must start at
      // its own top rather than wherever the last one was left.
      paneRef.current?.scrollTo({ top: 0 });
    },
    [drafts, current],
  );

  useEffect(() => {
    // Only while the split layout is up. In the stacked layout nothing is
    // highlighted, so j/k would move an invisible cursor - and swallowing the
    // arrow keys there would stop the page scrolling with them.
    if (!wide) return;
    const onKey = (event: KeyboardEvent) => {
      // Never eat a browser shortcut, and never a keystroke meant for a field.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, wide]);

  return (
    <div className="queue-split">
      <ol className="rail" aria-label="Drafts awaiting review">
        {drafts.map((draft) => {
          const age = ages[draft.id];
          return (
            <li key={draft.id}>
              <button
                type="button"
                className="rail-item"
                aria-current={draft.id === current ? "true" : undefined}
                onClick={() => {
                  setPicked(draft.id);
                  paneRef.current?.scrollTo({ top: 0 });
                }}
              >
                <span className="rail-top">
                  <span className="recipe-tag">{draft.recipe_key.replace(/_/g, " ")}</span>
                  <span className={`age age-${age?.state ?? "fresh"}`}>{age?.label}</span>
                </span>
                <span className="rail-headline">{draft.headline}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="pane" ref={paneRef}>
        <p className="keyhint">
          <kbd>j</kbd> <kbd>k</kbd> move · <kbd>a</kbd> approve · <kbd>r</kbd> reject
        </p>
        {drafts.map((draft) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            age={ages[draft.id]}
            picked={draft.id === current}
            hotkeys={wide && draft.id === current}
          />
        ))}
      </div>
    </div>
  );
}
