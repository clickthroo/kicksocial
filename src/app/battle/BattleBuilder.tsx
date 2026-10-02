"use client";

import { useState, useTransition } from "react";
import { findShirts, postBattle } from "./actions.ts";
import type { Fighter } from "@/lib/recipes/battle.ts";

/**
 * Two searches, two picks, one post.
 *
 * SEPARATE SEARCHES PER CORNER, not one list you click twice. The pairing is
 * the whole judgement here, and the two halves of it are usually different
 * searches: you are looking for the Villa away AND the Ajax home, not two
 * results from "1990s". One shared box would mean searching, picking, clearing
 * and searching again with the first choice out of sight.
 */
function Corner({
  letter,
  picked,
  onPick,
  disabledId,
}: {
  letter: "A" | "B";
  picked: Fighter | null;
  onPick: (f: Fighter | null) => void;
  /** The other corner's shirt, so the same one cannot be chosen twice. */
  disabledId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Fighter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const search = () => {
    setError(null);
    startTransition(async () => {
      try {
        setResults(await findShirts(query));
      } catch (err) {
        setError((err as Error).message);
        setResults(null);
      }
    });
  };

  if (picked) {
    return (
      <div className="card pick">
        <div className="pick-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pick-shot" src={picked.imageUrl ?? ""} alt="" />
          <div className="pick-main">
            <span className="recipe-tag">Corner {letter}</span>
            <h2>{picked.title}</h2>
            <div className="pick-meta">
              {[picked.season, picked.team, picked.kit].filter(Boolean).join(" · ")}
              {picked.manufacturer ? ` · ${picked.manufacturer}` : ""}
            </div>
            {/* Shown because it may be mentioned in the copy, not because it
                is a condition of the post - a shirt nobody can buy is a
                perfectly good thing to argue about. */}
            <div className="pick-meta">
              {picked.buyable ? `On Kickio now${picked.price ? ` from ${picked.price}` : ""}` : "Not for sale"}
            </div>
          </div>
          <button className="btn pick-btn" type="button" onClick={() => onPick(null)}>
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card pick">
      <span className="recipe-tag">Corner {letter}</span>
      <div className="row">
        <input
          type="search"
          className="pub-url"
          placeholder="Search shirts, e.g. Aston Villa away 1993"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
        />
        <button className="btn" type="button" onClick={search} disabled={isPending}>
          {isPending ? "Searching…" : "Search"}
        </button>
      </div>

      {error && <div className="banner">{error}</div>}

      {results !== null && results.length === 0 && (
        <p className="hint">
          Nothing matched. Only home, away and third shirts with a photograph can fight,
          so a training top or a shirt with no picture will not appear here.
        </p>
      )}

      {results?.map((f) => (
        <div className="pick-row" key={f.productId}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pick-shot" src={f.imageUrl ?? ""} alt="" loading="lazy" />
          <div className="pick-main">
            <h2>{f.title}</h2>
            <div className="pick-meta">
              {[f.season, f.team, f.kit].filter(Boolean).join(" · ")}
              {f.buyable ? " · on Kickio now" : ""}
            </div>
          </div>
          <button
            className="btn pick-btn"
            type="button"
            onClick={() => onPick(f)}
            disabled={f.productId === disabledId}
            title={f.productId === disabledId ? "Already in the other corner" : undefined}
          >
            {f.productId === disabledId ? "In corner" : "Pick"}
          </button>
        </div>
      ))}
    </div>
  );
}

export function BattleBuilder() {
  const [a, setA] = useState<Fighter | null>(null);
  const [b, setB] = useState<Fighter | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const go = () => {
    if (!a || !b) return;
    setResult(null);
    startTransition(async () => {
      try {
        const outcome = await postBattle(a.productId, b.productId);
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
    <>
      <Corner letter="A" picked={a} onPick={setA} disabledId={b?.productId ?? null} />
      <Corner letter="B" picked={b} onPick={setB} disabledId={a?.productId ?? null} />

      {result && <div className="pick-result">{result}</div>}

      <div className="actions">
        <button
          className="btn approve"
          type="button"
          onClick={go}
          disabled={!a || !b || isPending || done}
        >
          {isPending ? "Writing…" : done ? "Queued" : "Make the battle"}
        </button>
      </div>
    </>
  );
}
