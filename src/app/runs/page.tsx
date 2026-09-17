import { Nav } from "../Nav.tsx";
import Link from "next/link";
import { engine } from "@/lib/engine/client.ts";
import { RECIPES } from "@/lib/recipes/index.ts";
import { RunNowButton } from "./RunNowButton.tsx";

export const dynamic = "force-dynamic";
// A manual run queries Kickio and then waits on Claude; the default limit cuts
// it off mid-generation.
export const maxDuration = 300;

interface RunRow {
  id: string;
  recipe_key: string;
  trigger: string;
  status: string;
  draft_id: string | null;
  skipped_reason: string | null;
  diagnostics: Record<string, unknown>;
  duration_ms: number | null;
  created_at: string;
  post_drafts: { headline: string | null; status: string } | null;
}

/** Recipes started by a person rather than by cron, so absent from RECIPES. */
const ON_DEMAND_RECIPES = [{ key: "grail_sale", name: "Grail Sale" }];

function titleise(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_LABEL: Record<string, string> = {
  created: "Draft created",
  skipped: "Nothing to post",
  failed: "Failed",
};

function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Turn a diagnostics object into readable lines rather than raw JSON. */
function diagnosticLines(diagnostics: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(diagnostics)) {
    if (value === null || value === undefined) continue;
    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase());

    if (Array.isArray(value)) {
      // e.g. the price-trend rejections, each with its own reason
      for (const entry of value.slice(0, 12)) {
        if (entry && typeof entry === "object" && "key" in entry && "reason" in entry) {
          lines.push(`${(entry as { key: string }).key} — ${(entry as { reason: string }).reason}`);
        } else {
          lines.push(`${label}: ${JSON.stringify(entry)}`);
        }
      }
      if (value.length > 12) lines.push(`…and ${value.length - 12} more`);
    } else if (typeof value === "object") {
      lines.push(`${label}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${label}: ${String(value)}`);
    }
  }
  return lines;
}

export default async function RunsPage() {
  let runs: RunRow[] = [];
  let loadError: string | null = null;

  try {
    const { data, error } = await engine()
      .from("recipe_runs")
      .select(
        "id,recipe_key,trigger,status,draft_id,skipped_reason,diagnostics,duration_ms," +
          "created_at,post_drafts(headline,status)",
      )
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    runs = (data ?? []) as unknown as RunRow[];
  } catch (err) {
    loadError = (err as Error).message;
  }

  // The question this page exists to answer is "why was there no post today?",
  // so lead with the latest outcome per recipe rather than a raw log.
  const latestByRecipe = new Map<string, RunRow>();
  for (const run of runs) {
    if (!latestByRecipe.has(run.recipe_key)) latestByRecipe.set(run.recipe_key, run);
  }

  // RECIPES holds only the scheduled ones - they are the entries cron can select
  // and run unattended. Grail Sale is started from a form, so it is not in that
  // registry but still belongs on this page; so does any key that has run and is
  // no longer in the code, which would otherwise vanish from the summary.
  const summary: Array<{ key: string; name: string; onDemand: boolean }> = [
    ...RECIPES.map((r) => ({ key: r.key, name: r.name, onDemand: false })),
    ...ON_DEMAND_RECIPES.map((r) => ({ ...r, onDemand: true })),
  ];
  for (const key of latestByRecipe.keys()) {
    if (summary.some((r) => r.key === key)) continue;
    summary.push({ key, name: titleise(key), onDemand: true });
  }

  const now = Date.now();
  const last7 = runs.filter((r) => now - new Date(r.created_at).getTime() < 7 * 86_400_000);
  const counts = {
    created: last7.filter((r) => r.status === "created").length,
    skipped: last7.filter((r) => r.status === "skipped").length,
    failed: last7.filter((r) => r.status === "failed").length,
  };

  return (
    <div className="wrap">
      <header className="top">
        <h1>Run history</h1>
        <div className="sub">
          {loadError
            ? "Could not load runs"
            : `${counts.created} created · ${counts.skipped} skipped · ${counts.failed} failed, last 7 days`}
        </div>
        <Nav current="/runs" />
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      {!loadError && runs.length === 0 && (
        <div className="empty">
          <h2>No runs yet</h2>
          <p>Every scheduled and manual run is recorded here, including the quiet ones.</p>
        </div>
      )}

      {!loadError && (
        <section className="card settings">
          <div className="card-head">
            <h2>Latest per recipe</h2>
            <p className="desc">
              Run one on demand, or read why the last one produced nothing. A recipe
              that skips is working as intended — the reason says what it was looking
              for and did not find.
            </p>
          </div>
          {summary.map((recipe) => {
            const run = latestByRecipe.get(recipe.key);
            return (
              <div className="run-latest" key={recipe.key}>
                <div className="run-latest-name">
                  <strong>{recipe.name}</strong>
                  <span className="run-when">
                    {run ? timeAgo(run.created_at, now) : "never run"}
                  </span>
                </div>
                <span className={`pill ${run ? run.status : "none"}`}>
                  {run ? (STATUS_LABEL[run.status] ?? run.status) : "No runs"}
                </span>
                {recipe.onDemand ? (
                  // Nothing for a button to run: this one needs the admin's input.
                  <Link className="btn run-now-btn" href="/sold">
                    Add a sale
                  </Link>
                ) : (
                  <RunNowButton recipeKey={recipe.key} />
                )}
              </div>
            );
          })}
        </section>
      )}

      {runs.map((run) => {
        const lines = diagnosticLines(run.diagnostics ?? {});
        const hasDetail = !!run.skipped_reason || lines.length > 0;
        return (
          <article className={`card run run-${run.status}`} key={run.id}>
            <div className="run-head">
              <div>
                <span className="recipe-tag">{run.recipe_key.replace(/_/g, " ")}</span>
                <div className="run-title">
                  {run.status === "created" && run.post_drafts?.headline
                    ? run.post_drafts.headline
                    : (STATUS_LABEL[run.status] ?? run.status)}
                </div>
              </div>
              <span className={`pill ${run.status}`}>{STATUS_LABEL[run.status] ?? run.status}</span>
            </div>

            <div className="run-meta">
              {whenLabel(run.created_at)} · {run.trigger}
              {run.duration_ms !== null && ` · ${(run.duration_ms / 1000).toFixed(1)}s`}
              {run.post_drafts && ` · draft ${run.post_drafts.status}`}
            </div>

            {run.skipped_reason && <p className="run-reason">{run.skipped_reason}</p>}

            {hasDetail && lines.length > 0 && (
              <details className="facts">
                <summary>Details</summary>
                <div className="run-diagnostics">
                  {lines.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </details>
            )}
          </article>
        );
      })}
    </div>
  );
}
