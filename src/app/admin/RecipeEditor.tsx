"use client";

import { useState, useTransition } from "react";
import { saveRecipe } from "./actions.ts";
import type { SellerOption } from "@/lib/kickio/sellers.ts";

export interface RecipeRow {
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  cadence: string;
  selection: Record<string, unknown>;
  prompt_template: string;
}

function num(selection: Record<string, unknown>, key: string, fallback: number): number {
  const v = selection[key];
  return typeof v === "number" ? v : fallback;
}

export function RecipeEditor({
  recipe,
  sellers,
}: {
  recipe: RecipeRow;
  sellers: SellerOption[];
}) {
  const [enabled, setEnabled] = useState(recipe.enabled);
  const [brief, setBrief] = useState(recipe.prompt_template);
  const [minPrice, setMinPrice] = useState(num(recipe.selection, "minPriceCents", 10_000) / 100);
  const [cooldown, setCooldown] = useState(num(recipe.selection, "cooldownDays", 45));
  const [stockAge, setStockAge] = useState(num(recipe.selection, "maxStockCheckAgeDays", 7));
  const [comboCooldown, setComboCooldown] = useState(
    num(recipe.selection, "comboCooldownDays", 120),
  );
  const [teamCooldown, setTeamCooldown] = useState(num(recipe.selection, "teamCooldownDays", 14));
  const [allowed, setAllowed] = useState<string[]>(
    Array.isArray(recipe.selection.allowedSellerIds)
      ? (recipe.selection.allowedSellerIds as string[])
      : [],
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Seller choice and the stock window only mean anything for listing-based
  // recipes; the aggregate ones don't select individual listings.
  const isListingRecipe = recipe.key === "grail_of_the_day";

  const toggleSeller = (id: string) =>
    setAllowed((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        await saveRecipe({
          key: recipe.key,
          enabled,
          prompt_template: brief,
          selection: {
            ...recipe.selection,
            minPriceCents: Math.round(minPrice * 100),
            cooldownDays: cooldown,
            ...(isListingRecipe
              ? {
                maxStockCheckAgeDays: stockAge,
                allowedSellerIds: allowed,
                comboCooldownDays: comboCooldown,
                teamCooldownDays: teamCooldown,
              }
              : {}),
          },
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  return (
    <section className="card settings">
      <div className="card-head">
        <span className="recipe-tag">{recipe.cadence}</span>
        <h2>{recipe.name}</h2>
        {recipe.description && <p className="desc">{recipe.description}</p>}
      </div>

      <label className="row toggle">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Enabled</span>
      </label>

      {isListingRecipe && (
        <div className="row">
          <div className="field-label">Sellers shown on kickio.com</div>
          <p className="hint">
            Nothing on a listing records whether it appears on the site — it depends on
            who is selling it. Only ticked sellers can be featured.
          </p>
          {sellers.map((seller) => (
            <label className="check" key={seller.id}>
              <input
                type="checkbox"
                checked={allowed.includes(seller.id)}
                onChange={() => toggleSeller(seller.id)}
              />
              <span>{seller.label}</span>
            </label>
          ))}
        </div>
      )}

      <div className="row grid">
        <label>
          <span className="field-label">Minimum price (£)</span>
          <input
            type="number"
            min={0}
            value={minPrice}
            onChange={(e) => setMinPrice(Number(e.target.value))}
          />
        </label>
        <label>
          <span className="field-label">
            {isListingRecipe ? "Same shirt again after (days)" : "Cooldown (days)"}
          </span>
          <input
            type="number"
            min={0}
            value={cooldown}
            onChange={(e) => setCooldown(Number(e.target.value))}
          />
        </label>
        {isListingRecipe && (
          <>
            <label>
              <span className="field-label">Same kit again after (days)</span>
              <input
                type="number"
                min={0}
                value={comboCooldown}
                onChange={(e) => setComboCooldown(Number(e.target.value))}
              />
            </label>
            <label>
              <span className="field-label">Same club again after (days)</span>
              <input
                type="number"
                min={0}
                value={teamCooldown}
                onChange={(e) => setTeamCooldown(Number(e.target.value))}
              />
            </label>
          </>
        )}
        {isListingRecipe && (
          <label>
            <span className="field-label">Stock check within (days)</span>
            <input
              type="number"
              min={1}
              value={stockAge}
              onChange={(e) => setStockAge(Number(e.target.value))}
            />
          </label>
        )}
      </div>

      {isListingRecipe && (
        <p className="hint" style={{ padding: "0 16px" }}>
          A rejected shirt is never offered again, whatever these windows say.
          Club and kit windows are preferences — they reorder candidates rather
          than block a post, so a thin day still produces one.
        </p>
      )}

      <div className="row">
        <span className="field-label">Copy brief</span>
        <p className="hint">Sent to Claude with the brand voice and the verified facts.</p>
        <textarea rows={8} value={brief} onChange={(e) => setBrief(e.target.value)} />
      </div>

      {error && <div className="banner">{error}</div>}

      <div className="actions">
        <button className="btn approve" onClick={save} disabled={isPending}>
          {saved ? "Saved" : isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
