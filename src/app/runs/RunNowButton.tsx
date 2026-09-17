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
        setResult(
          outcome.status === "created"
            ? "Draft created"
            : outcome.status === "skipped"
              ? "Nothing to post"
              : "Failed",
        );
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
