"use client";

import { useState, useTransition } from "react";
import { runNow } from "./actions.ts";

/**
 * A run can take half a minute - the recipe queries Kickio, then Claude writes
 * the copy - so the button has to say it is working rather than look dead.
 */
export function RunNowButton({ recipeKey }: { recipeKey: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const go = () => {
    setResult(null);
    startTransition(async () => {
      try {
        const outcome = await runNow(recipeKey);
        // Show the reason, not just the verdict. "Nothing to post" hid a
        // query that was failing with a 400 - the run had never looked at a
        // single listing, and the card said the same thing it says on a quiet
        // day. The reason was already being recorded; it just stopped here.
        const verdict =
          outcome.status === "created"
            ? "Draft created"
            : outcome.status === "skipped"
              ? "Nothing to post"
              : "Failed";
        setResult(outcome.reason ? `${verdict} — ${outcome.reason}` : verdict);
      } catch (err) {
        setResult((err as Error).message);
      }
    });
  };

  return (
    <div className="run-now">
      <button className="btn run-now-btn" onClick={go} disabled={isPending}>
        {isPending ? "Running…" : "Run now"}
      </button>
      {result && <span className="run-now-result">{result}</span>}
    </div>
  );
}
