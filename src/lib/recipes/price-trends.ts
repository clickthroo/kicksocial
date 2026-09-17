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
import { formatPrice } from "../kickio/pricing.ts";
import { imageUrls } from "./grail-of-the-day.ts";

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
 * The daily series for THIS subject - or nothing.
 *
 * `price_index_history` carries no scope or key: it is a single market-wide
 * index, 97 days of it, and there is no per-club or per-era series in Kickio at
 * all. It was being plotted under every headline regardless of subject, so a
 * card reading "Germany +21.9% · like-for-like" carried a line that was neither
 * Germany's nor like-for-like nor 90 days - and which fell 2.3% while the
 * headline rose 21.9%. A reader checking the picture against the number found
 * them in opposite directions, which is the most expensive kind of wrong.
 *
 * So: no series unless it is genuinely this subject's. The card drops the chart
 * rather than illustrating a number with someone else's data. If Kickio ever
 * adds a scoped history table this is the one function to change.
 */
async function subjectSeries(
  scope: string,
  key: string,
): Promise<{ points: HistoryRow[]; basis: string | null }> {
  void scope;
  void key;
  return {
    points: [],
    basis: null,
  };
}

/**
 * A series may only be drawn beside a headline it agrees with.
 *
 * Pure and exported so the rule is testable: the failure this exists to prevent
 * was invisible in code review and obvious the moment anyone looked at the card.
 */
export function seriesAgreesWithHeadline(points: Array<{ index_value: number }>, pct: number): boolean {
  const values = points.map((p) => Number(p.index_value)).filter(Number.isFinite);
  // Two points is not a trend, and one is not a line.
  if (values.length < 3) return false;

  const net = values[values.length - 1] - values[0];
  // A flat series contradicts nothing, but it also illustrates nothing.
  if (net === 0) return false;
  return net > 0 === pct > 0;
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

/**
 * A few shirts of the kind the figure is about, to put on the card.
 *
 * THESE ARE NOT THE COMPARABLES. The figure comes from `sales_history` rows the
 * engine cannot even read; these are current listings that happen to match the
 * subject. Shown unlabelled beside "+21.9%" they would read as the shirts that
 * moved, which is a claim the data does not support - so the card captions them
 * as examples, and `montage_basis` records that here too.
 *
 * Only `club` and `era` map onto something queryable. A condition band does not
 * describe a shirt anyone could picture, so those trends carry no montage.
 */
async function montageFor(
  scope: string,
  key: string,
  label: string,
): Promise<{ images: string[]; basis: string | null }> {
  const query = kickio()
    .from("products")
    .select("primary_image_url,images")
    .is("deleted_at", null)
    .eq("status", "active")
    .not("primary_image_url", "is", null)
    .limit(24);

  if (scope === "club") {
    query.ilike("team", label);
  } else if (scope === "era") {
    // key is the decade's first year, e.g. "1990".
    const decade = Number.parseInt(key, 10);
    if (!Number.isFinite(decade)) return { images: [], basis: null };
    query.gte("season_end_year", decade).lt("season_end_year", decade + 10);
  } else {
    return { images: [], basis: null };
  }

  const { data, error } = await query;
  if (error) return { images: [], basis: null };

  const seen = new Set<string>();
  const images: string[] = [];
  for (const row of (data ?? []) as Array<{ primary_image_url: string | null; images: unknown }>) {
    for (const url of imageUrls([row.primary_image_url, ...(Array.isArray(row.images) ? row.images : [])])) {
      if (seen.has(url)) continue;
      seen.add(url);
      images.push(url);
      break;
    }
    if (images.length >= 4) break;
  }

  // One shirt reads as "this shirt moved 21.9%". Three or four read as a
  // category, which is what this is.
  if (images.length < 3) return { images: [], basis: null };
  return { images: images.slice(0, 4), basis: `${label} shirts listed on Kickio now` };
}

/** "Germany" is a country; "Germany football shirts" is the subject. */
export function subjectPhrase(scope: string, label: string): string {
  if (scope === "club") return `${label} football shirts`;
  if (scope === "era") return `${label} football shirts`;
  if (scope === "condition_band") return `Shirts in ${label.toLowerCase()} condition`;
  return `${label} shirts`;
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

  const series = await subjectSeries(winner.scope, winner.key);
  // The guard, applied even though subjectSeries returns nothing today: if a
  // scoped series is ever wired up, a line that disagrees with the headline
  // must never reach a card again.
  const plottable = seriesAgreesWithHeadline(series.points, pct);

  const median = formatPrice(winner.median_fair_price_cents, "GBP");
  const montage = await montageFor(winner.scope, winner.key, winner.label);

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
      // What the subject IS, spelled out. "Germany" alone on a card reads as a
      // country; the point is the shirts.
      subject: subjectPhrase(winner.scope, winner.label),
      montage_basis: montage.basis,
      data_updated_at: winner.updated_at,
      series: plottable ? series.points : [],
      // Why there is no chart, where there is none. A reviewer should not have
      // to wonder whether it simply failed to load.
      series_basis: plottable
        ? series.basis
        : series.points.length > 0
          ? "Series withheld: its direction disagrees with the headline figure"
          : "No per-subject price history exists in Kickio, so no chart is drawn",
      // Shown in the dashboard so the reviewer can see what was excluded and why.
      excluded_from_consideration: rejected,
    },
    claims,
    // Illustrative only - see montageFor. The card labels them as such.
    images: montage.images,
  };

  return { ok: true, candidate };
}
