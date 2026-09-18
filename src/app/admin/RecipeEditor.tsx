"use client";

import { useState, useTransition } from "react";
import { saveRecipe } from "./actions.ts";
import type { SellerOption } from "@/lib/kickio/sellers.ts";
import type { ArchiveTeamOption } from "@/lib/recipes/archive-options.ts";
import type { SetOption } from "@/lib/recipes/set-options.ts";
import type { CollectorOption } from "@/lib/recipes/collector-access.ts";
import { CARD_STYLES, asCardStyle, type CardStyle } from "@/lib/render/styles.ts";

export interface RecipeRow {
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  cadence: string;
  selection: Record<string, unknown>;
  prompt_template: string;
}

/** "3 months ago" / "yesterday" - enough to judge whether a club is due again. */
function monthsAgo(iso: string | null): string {
  if (!iso) return "recently";
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 45) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

function num(selection: Record<string, unknown>, key: string, fallback: number): number {
  const v = selection[key];
  return typeof v === "number" ? v : fallback;
}

/** One row in a queue picker, whatever kind of thing the queue holds. */
interface QueueChoice {
  /** What goes in `upNext` - a club name, a set slug, a collector's user id. */
  value: string;
  label: string;
  available: boolean;
  lastPostedAt: string | null;
}

export function RecipeEditor({
  recipe,
  sellers,
  teams,
  sets,
  collectors,
  collectorAccess,
}: {
  recipe: RecipeRow;
  sellers: SellerOption[];
  teams: ArchiveTeamOption[];
  sets: SetOption[];
  collectors: CollectorOption[];
  /** Null when the engine can read collections; a reason when it cannot. */
  collectorAccess: string | null;
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
  const [style, setStyle] = useState<CardStyle>(asCardStyle(recipe.selection.style));
  const [upNext, setUpNext] = useState<string[]>(
    Array.isArray(recipe.selection.upNext)
      ? (recipe.selection.upNext as string[]).filter((t) => typeof t === "string")
      : [],
  );
  const [picking, setPicking] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Seller choice and the stock window only mean anything for listing-based
  // recipes; the aggregate ones don't select individual listings.
  const isListingRecipe = recipe.key === "grail_of_the_day";
  // Grail Sale selects nothing - an admin names the shirt and types the price -
  // so a price floor and a cooldown would be controls that do nothing.
  // A control that does nothing is worse than no control: it invites someone to
  // set a price floor on Club Archive and wonder why nothing changed. Only
  // these two recipes read minPriceCents; the cooldown is used by everything
  // except Grail Sale, which selects nothing.
  const usesPriceFloor = recipe.key === "grail_of_the_day" || recipe.key === "sold_this_week";
  const selectsCandidates = recipe.key !== "grail_sale";
  // Only the sale card has style variants so far.
  const hasStyles = recipe.key === "grail_sale";
  const picksClub = recipe.key === "club_archive";
  const picksSet = recipe.key === "featured_set";
  const picksCollector =
    recipe.key === "collector_spotlight" || recipe.key === "collector_set_progress";
  const hasQueue = picksClub || picksSet || picksCollector;

  // One queue UI, three kinds of subject. The queue itself is identical - a
  // running order that drains - so only the choices differ.
  const choices: QueueChoice[] = picksSet
    ? sets.map((o) => ({
        value: o.slug,
        label: `${o.name} — ${o.buyable} of ${o.slots} buyable (${o.scope})`,
        available: o.available,
        lastPostedAt: o.lastPostedAt,
      }))
    : picksCollector
      ? collectors.map((o) => ({
          value: o.userId,
          // Listed rather than hidden. Kickio's own account is currently the
          // biggest collection on the platform, and an admin who cannot see
          // why it is missing will assume the list is broken.
          label:
            `${o.name} — ${o.shirts} shirts` +
            (o.blocked === "house"
              ? " (Kickio account — never featured)"
              : o.blocked === "excluded"
                ? " (excluded in settings)"
                : ""),
          available: o.available,
          lastPostedAt: o.lastPostedAt,
        }))
      : teams.map((o) => ({
          value: o.name,
          label:
            `${o.name} — ${o.shirts} shirts` +
            (o.earliest && o.latest ? `, ${o.earliest}–${o.latest}` : ""),
          available: o.available,
          lastPostedAt: o.lastPostedAt,
        }));

  const subjectWord = picksSet ? "set" : picksCollector ? "collector" : "club";
  const cooldownDays = num(recipe.selection, "cooldownDays", 180);

  /**
   * Why this picker cannot pick, when it cannot.
   *
   * Three states that look identical on screen and mean different things: the
   * engine is not allowed to read the data, it is allowed and there is none
   * yet, or everything eligible is inside its cooldown. Only the first is
   * something to go and fix, so each says which it is.
   */
  const blocked: { title: string; detail: string } | null = (() => {
    if (picksCollector && collectorAccess) {
      return {
        title: "Collector posts are not connected yet",
        detail: collectorAccess,
      };
    }
    if (choices.length === 0) {
      return picksCollector
        ? {
            title: "No collectors to feature yet",
            detail:
              "Nobody has added enough shirts to their Kickio collection, or everyone " +
              "who has is opted out. This fills up on its own as people collect — " +
              "nothing to do here.",
          }
        : {
            title: `No ${subjectWord}s available`,
            detail:
              `Kickio has no ${subjectWord} this recipe can use right now. The run will ` +
              "say the same thing on the run log rather than posting something thin.",
          };
    }
    if (!choices.some((c) => c.available)) {
      return {
        title: `Every ${subjectWord} is inside its cooldown`,
        detail:
          `All ${choices.length} have been posted in the last ${Math.round(cooldownDays / 30)} ` +
          "months. They become available again as the cooldown passes; until then the " +
          "run will skip rather than repeat one.",
      };
    }
    return null;
  })();
  // Queued collectors are stored as user ids, which are unreadable in a list.
  const labelFor = (value: string) =>
    choices.find((c) => c.value === value)?.label ?? value;
  // Featured Collection only posts when its list has actually moved, so its
  // cooldown is a floor under that rule rather than the thing that paces it.
  // Labelling it "Cooldown (days)" would read as the pacing control it is not.
  const tracksAList = recipe.key === "featured_collection";

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
            ...(usesPriceFloor ? { minPriceCents: Math.round(minPrice * 100) } : {}),
            ...(selectsCandidates ? { cooldownDays: cooldown } : {}),
            ...(hasStyles ? { style } : {}),
            ...(hasQueue ? { upNext } : {}),
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

      {selectsCandidates && (
      <div className="row grid">
        {usesPriceFloor && (
          <label>
            <span className="field-label">Minimum price (£)</span>
            <input
              type="number"
              min={0}
              value={minPrice}
              onChange={(e) => setMinPrice(Number(e.target.value))}
            />
          </label>
        )}
        <label>
          <span className="field-label">
            {isListingRecipe
              ? "Same shirt again after (days)"
              : picksClub
                ? "Same club again after (days)"
                : tracksAList
                  ? "Never post the same list twice within (days)"
                  : "Cooldown (days)"}
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
      )}

      {isListingRecipe && (
        <p className="hint" style={{ padding: "0 16px" }}>
          A rejected shirt is never offered again, whatever these windows say.
          Club and kit windows are preferences — they reorder candidates rather
          than block a post, so a thin day still produces one.
        </p>
      )}

      {hasStyles && (
        <div className="row">
          <div className="field-label">Default card style</div>
          <p className="hint">
            Where a new sale starts. Every draft can still be restyled in the queue —
            changing a look never changes a fact.
          </p>
          <div className="styles-row">
            {CARD_STYLES.map((option) => (
              <button
                key={option.key}
                type="button"
                className="style-chip"
                aria-checked={style === option.key}
                role="radio"
                title={option.blurb}
                onClick={() => setStyle(option.key)}
              >
                {option.name}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 9 }}>
            {CARD_STYLES.find((o) => o.key === style)?.blurb}
          </p>
        </div>
      )}

      {hasQueue && (
        <div className="row">
          <div className="field-label">Up next</div>

          {/* One state at a time. A picker that cannot pick anything should say
              why and stop, not follow its own warning with an empty dropdown
              and two lines of copy about how the picking works. */}
          {blocked ? (
            <div className="setup">
              <strong>{blocked.title}</strong>
              <p>{blocked.detail}</p>
            </div>
          ) : (
            <>
              <p className="hint">
                A running order, not a setting. Each run takes the {subjectWord} at the
                top and removes it once the draft exists, so a choice made once does not
                become every week. When the list is empty the best available{" "}
                {subjectWord} is chosen automatically.
              </p>

              {picksCollector && (
                <p className="hint">
                  Only collectors who have left both switches on are listed — anyone who
                  turned off “my collection is public” or “Kickio may feature me” is not
                  here and cannot be queued.
                </p>
              )}

              {upNext.length > 0 ? (
                <ol className="queue">
                  {upNext.map((value, i) => (
                    <li key={`${value}-${i}`}>
                      <span className="queue-pos">{i + 1}</span>
                      <span className="queue-name">{labelFor(value)}</span>
                      <button
                        type="button"
                        className="link"
                        onClick={() => setUpNext(upNext.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="hint queue-empty">
                  Nothing queued — the next run picks the best {subjectWord} that has not
                  been posted in {Math.round(cooldownDays / 30)} months.
                </p>
              )}

              <div className="queue-add">
                <select value={picking} onChange={(e) => setPicking(e.target.value)}>
                  <option value="">Add a {subjectWord}…</option>
                  {choices.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={!option.available || upNext.includes(option.value)}
                    >
                      {option.label}
                      {option.available ? "" : ` (posted ${monthsAgo(option.lastPostedAt)})`}
                      {upNext.includes(option.value) ? " (queued)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn"
                  disabled={!picking}
                  onClick={() => {
                    if (picking && !upNext.includes(picking)) setUpNext([...upNext, picking]);
                    setPicking("");
                  }}
                >
                  Add
                </button>
              </div>

              {choices.some((c) => !c.available) && (
                <p className="hint">
                  Anything posted in the last {Math.round(cooldownDays / 30)} months is
                  listed but cannot be chosen — picking one would only produce a run that
                  refuses itself.
                </p>
              )}
            </>
          )}
        </div>
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
