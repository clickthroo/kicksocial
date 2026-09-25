"use client";

import { useState, useTransition } from "react";
import { postPriceHistory } from "./actions.ts";
import type { QualifyingShirt } from "@/lib/recipes/price-history.ts";

/**
 * One qualifying shirt, and the button that turns it into a post.
 *
 * Everything shown here is a reason to pick this one or leave it: how many
 * sales are behind the chart, how many of them are new since the last post
 * about it, and the spread those sales cover. A row that only said the shirt's
 * name would make the list an alphabet rather than a choice.
 */
export function ShirtPicker({ shirt }: { shirt: QualifyingShirt }) {
  const [result, setResult] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const go = () => {
    setResult(null);
    startTransition(async () => {
      try {
        const outcome = await postPriceHistory(shirt.productId);
        setDone(outcome.status === "created");
        setResult(
          outcome.status === "created"
            ? "Draft created — it is waiting in the queue"
            : `${outcome.status === "skipped" ? "Not posted" : "Failed"} — ${outcome.reason ?? ""}`,
        );
      } catch (err) {
        setResult((err as Error).message);
      }
    });
  };

  return (
    <article className={`card pick${done ? " resolved" : ""}`}>
      <div className="pick-row">
        {shirt.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pick-shot" src={shirt.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="pick-shot" />
        )}

        <div className="pick-main">
          <h2>{shirt.title}</h2>
          <div className="pick-meta">
            {shirt.totalSales} recorded sale{shirt.totalSales === 1 ? "" : "s"} ·{" "}
            {shirt.lowest}–{shirt.highest} · latest {shirt.latest}
          </div>
          <div className="pick-meta">
            {shirt.postedBefore
              ? `${shirt.freshSales} new since it was last posted`
              : "Not posted before"}
            {shirt.subtitle ? ` · ${shirt.subtitle}` : ""}
          </div>
        </div>

        <button className="btn pick-btn" onClick={go} disabled={isPending || done} type="button">
          {isPending ? "Writing…" : done ? "Queued" : "Make the post"}
        </button>
      </div>

      {result && <div className="pick-result">{result}</div>}
    </article>
  );
}
