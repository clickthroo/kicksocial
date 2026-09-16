/**
 * Price Trends - "England shirts up 12% this quarter", from real market data.
 *
 * THE INTEGRITY RULE OF THIS RECIPE
 *
 * A naive "median price by team, this month vs last" produces headlines that are
 * simply false. Measured that way the Kickio data yields "AC Milan down 42%"
 * (£118.99 -> £68.49), but that is cohort mix-shift: a different mix of shirts
 * sold in each window. Nothing moved 42%.
 *
 * Kickio already solved this. `price_index_aggregates.change_basis` marks each
 * figure as either `like_for_like` (same comparable shirts tracked across both
 * windows - a real price movement) or `pooled` (whatever happened to sell - not
 * comparable).
 *
 * So: we publish `like_for_like` rows only. This deliberately discards otherwise
 * attractive figures, e.g. `club:arsenal +17.69%`, which is `pooled`. A wrong
 * number in a price post costs more credibility with collectors than a missed
 * post costs in reach.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { recentlyFeatured } from "./cooldown.ts";

interface AggregateRow {
  scope: string;
  key: string;
  label: string;
  cohort_count: number;
  total_sales: number;
  median_fair_price_cents: number;
  pct_change_90d: number | null;
  change_window_days: number | null;
  change_basis: string | null;
  updated_at: string;
}

interface HistoryRow {
  day: string;
  index_value: number;
  cohort_count: number;
  total_sales_90d: number;
}

export interface PriceTrendsConfig {
  /** Only this basis may be published. Do not widen without reading the note above. */
  requiredBasis: string;
  /** Minimum comparable items behind a figure. */
  minCohort: number;
  /** Minimum sales behind a figure. */
  minSales: number;
  /** Ignore movements smaller than this - noise, not a story. */
  minAbsPctChange: number;
  /** Refuse figures this implausible; they indicate a data problem, not a trend. */
  maxAbsPctChange: number;
  cooldownDays: number;
}

export const DEFAULT_PRICE_TRENDS_CONFIG: PriceTrendsConfig = {
  requiredBasis: "like_for_like",
  minCohort: 5,
  minSales: 20,
  minAbsPctChange: 5,
  maxAbsPctChange: 200,
  cooldownDays: 21,
};

export interface TrendRejection {
  key: string;
  reason: string;
}

/**
 * Filter aggregates down to figures we are willing to publish, and record why
 * each rejection happened so the dashboard can show the working.
 */
export function selectPublishable(
  rows: AggregateRow[],
  config: PriceTrendsConfig,
): { publishable: AggregateRow[]; rejected: TrendRejection[] } {
  const publishable: AggregateRow[] = [];
  const rejected: TrendRejection[] = [];

  for (const row of rows) {
    const id = `${row.scope}:${row.key}`;
    if (row.pct_change_90d === null) {
      rejected.push({ key: id, reason: "No change figure computed" });
    } else if (row.change_basis !== config.requiredBasis) {
      rejected.push({
        key: id,
        reason: `change_basis is '${row.change_basis ?? "unset"}', not '${config.requiredBasis}' - ` +
          "not comparable across windows (mix-shift risk)",
      });
    } else if (row.cohort_count < config.minCohort) {
      rejected.push({
        key: id,
        reason: `Only ${row.cohort_count} comparable items (need ${config.minCohort})`,
      });
    } else if (row.total_sales < config.minSales) {
      rejected.push({
        key: id,
        reason: `Only ${row.total_sales} sales (need ${config.minSales})`,
      });
    } else if (Math.abs(row.pct_change_90d) < config.minAbsPctChange) {
      rejected.push({
        key: id,
        reason: `Movement of ${row.pct_change_90d}% is below the ${config.minAbsPctChange}% threshold`,
      });
    } else if (Math.abs(row.pct_change_90d) > config.maxAbsPctChange) {
      rejected.push({
        key: id,
        reason: `Movement of ${row.pct_change_90d}% is implausible - suspected data issue`,
      });
    } else {
      publishable.push(row);
    }
  }

  return { publishable, rejected };
}

export async function runPriceTrends(
  config: PriceTrendsConfig = DEFAULT_PRICE_TRENDS_CONFIG,
): Promise<RecipeResult> {
  const { data, error } = await kickio()
    .from("price_index_aggregates")
    .select(
      "scope,key,label,cohort_count,total_sales,median_fair_price_cents," +
        "pct_change_90d,change_window_days,change_basis,updated_at",
    );

  if (error) return { ok: false, reason: `Kickio query failed: ${error.message}` };

  const rows = (data ?? []) as unknown as AggregateRow[];
  const { publishable, rejected } = selectPublishable(rows, config);

  if (publishable.length === 0) {
    return {
      ok: false,
      reason: "No like-for-like price movement met the publishing thresholds",
      diagnostics: { considered: rows.length, rejected },
    };
  }

  const seen = await recentlyFeatured("price_trends", config.cooldownDays);
  const eligible = publishable.filter((r) => !seen.has(`${r.scope}:${r.key}`));
  if (eligible.length === 0) {
    return {
      ok: false,
      reason: `All ${publishable.length} publishable trends covered within ${config.cooldownDays} days`,
      diagnostics: { rejected },
    };
  }

  // Lead with the biggest genuine movement.
  const winner = eligible.sort(
    (a, b) => Math.abs(b.pct_change_90d!) - Math.abs(a.pct_change_90d!),
  )[0];

  const pct = winner.pct_change_90d!;
  const direction = pct >= 0 ? "up" : "down";
  const windowDays = winner.change_window_days ?? 90;

  // The daily series behind the figure, for the trend graphic.
  const { data: history } = await kickio()
    .from("price_index_history")
    .select("day,index_value,cohort_count,total_sales_90d")
    .order("day", { ascending: true });

  const median = (winner.median_fair_price_cents / 100).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });

  const claims: Claim[] = [
    {
      statement: `${winner.label} ${direction} ${Math.abs(pct).toFixed(1)}% over ${windowDays} days`,
      value: pct,
      source: `price_index_aggregates.pct_change_90d (${winner.scope}:${winner.key})`,
      basis:
        `like-for-like: the same ${winner.cohort_count} comparable shirts tracked ` +
        `across both windows, from ${winner.total_sales} sales`,
    },
    {
      statement: `Median fair price ${median}`,
      value: winner.median_fair_price_cents / 100,
      source: "price_index_aggregates.median_fair_price_cents",
    },
  ];

  const candidate: RecipeCandidate = {
    subjectRef: `${winner.scope}:${winner.key}`,
    headline: `${winner.label} ${direction} ${Math.abs(pct).toFixed(1)}%`,
    sourceData: {
      scope: winner.scope,
      key: winner.key,
      label: winner.label,
      pct_change: pct,
      change_basis: winner.change_basis,
      change_window_days: windowDays,
      cohort_count: winner.cohort_count,
      total_sales: winner.total_sales,
      median_fair_price: median,
      data_updated_at: winner.updated_at,
      series: (history ?? []) as HistoryRow[],
      // Shown in the dashboard so the reviewer can see what was excluded and why.
      excluded_from_consideration: rejected,
    },
    claims,
    // Chart-led post: the visual template renders the series, no photography.
    images: [],
  };

  return { ok: true, candidate };
}
