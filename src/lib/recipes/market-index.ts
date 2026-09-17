/**
 * Market Index - the whole shirt market over a window, not one club.
 *
 * WHY THIS RECIPE IS MOSTLY A REFUSAL
 *
 * `price_index_history` is a single market-wide series with no scope column. It
 * was previously being drawn under club headlines, where it was simply the
 * wrong data (see price-trends.ts). Here it IS the subject, so plotting it is
 * finally legitimate - but only if the index means what a reader will assume it
 * means.
 *
 * It usually does not. The index is a basket, and Kickio's basket is still
 * filling: `cohort_count` runs 0 -> ~1,900 over the 97 days on record, doubling
 * in the most recent 60. An index whose basket doubles is not measuring prices,
 * it is measuring how much of the market Kickio has got round to tracking. The
 * "-2.3%" that falls out of it is an artefact of composition, which is the same
 * mix-shift trap that makes `pooled` figures unpublishable in Price Trends -
 * one level up, and harder to see because the number looks so calm.
 *
 * So the cohort has to hold still before the index can be quoted. Until it
 * does, this recipe skips and says exactly which number disqualified it. It
 * starts working on its own the week coverage plateaus; nothing here needs
 * changing for that to happen.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { recentlyFeatured } from "./cooldown.ts";

export interface IndexPoint {
  day: string;
  index_value: number;
  cohort_count: number;
  total_sales_90d: number;
}

export interface MarketIndexConfig {
  /** How far back the post looks. */
  windowDays: number;
  /**
   * How much the basket may change across the window and still be quoted as a
   * price movement. The whole integrity of this recipe is this number.
   */
  maxCohortDriftPct: number;
  /** Smaller than this is noise on an index, not a story. */
  minAbsPctChange: number;
  /** Fewer points than this is not a line. */
  minDays: number;
  /** Ignore days where the basket is this far below the window's median - the
   * index had not started yet, and its value is a definition, not a reading. */
  warmupFloorPct: number;
  cooldownDays: number;
}

export const DEFAULT_MARKET_INDEX_CONFIG: MarketIndexConfig = {
  windowDays: 30,
  maxCohortDriftPct: 15,
  minAbsPctChange: 1.5,
  minDays: 14,
  warmupFloorPct: 50,
  cooldownDays: 21,
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Drop the days before the index was really running.
 *
 * The first row on record has `cohort_count = 0` and `index_value = 100.00`:
 * that 100 is the definition of an index's first day, not a measurement, and
 * anchoring a percentage to it invents a movement.
 */
export function trimWarmup(points: IndexPoint[], warmupFloorPct: number): IndexPoint[] {
  if (points.length === 0) return [];
  const floor = (median(points.map((p) => p.cohort_count)) * warmupFloorPct) / 100;
  const firstReal = points.findIndex((p) => p.cohort_count > 0 && p.cohort_count >= floor);
  return firstReal === -1 ? [] : points.slice(firstReal);
}

/** How much the basket grew or shrank across the window, as a percentage. */
export function cohortDriftPct(points: IndexPoint[]): number {
  const counts = points.map((p) => p.cohort_count).filter((c) => c > 0);
  if (counts.length === 0) return Number.POSITIVE_INFINITY;
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  return ((hi - lo) / lo) * 100;
}

export interface IndexVerdict {
  ok: boolean;
  reason?: string;
  diagnostics: Record<string, unknown>;
}

/**
 * Whether this window may be quoted. Pure, because every rule in it is one a
 * reader would care about and none of them is visible in the finished post.
 */
export function assessWindow(points: IndexPoint[], config: MarketIndexConfig): IndexVerdict {
  const days = points.length;
  if (days < config.minDays) {
    return {
      ok: false,
      reason: `Only ${days} days of index history in the window (need ${config.minDays})`,
      diagnostics: { days, required: config.minDays },
    };
  }

  const drift = cohortDriftPct(points);
  const first = points[0];
  const last = points[days - 1];
  const pct = ((last.index_value - first.index_value) / first.index_value) * 100;

  const diagnostics = {
    days,
    cohortFrom: first.cohort_count,
    cohortTo: last.cohort_count,
    cohortDriftPct: Number(drift.toFixed(1)),
    maxCohortDriftPct: config.maxCohortDriftPct,
    indexFrom: Number(first.index_value.toFixed(2)),
    indexTo: Number(last.index_value.toFixed(2)),
    pctChange: Number(pct.toFixed(2)),
  };

  if (drift > config.maxCohortDriftPct) {
    return {
      ok: false,
      reason:
        `The basket behind the index changed by ${drift.toFixed(1)}% across the window ` +
        `(limit ${config.maxCohortDriftPct}%), from ${first.cohort_count} shirts to ` +
        `${last.cohort_count}. A ${pct.toFixed(1)}% move on a basket that size cannot be ` +
        "read as a price change - it is Kickio's tracking coverage growing, not the market.",
      diagnostics,
    };
  }

  if (Math.abs(pct) < config.minAbsPctChange) {
    return {
      ok: false,
      reason: `The index moved ${pct.toFixed(1)}% over ${days} days, below the ${config.minAbsPctChange}% threshold`,
      diagnostics,
    };
  }

  return { ok: true, diagnostics };
}

export async function runMarketIndex(
  config: MarketIndexConfig = DEFAULT_MARKET_INDEX_CONFIG,
): Promise<RecipeResult> {
  const since = new Date(Date.now() - config.windowDays * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await kickio()
    .from("price_index_history")
    .select("day,index_value,cohort_count,total_sales_90d")
    .gte("day", since)
    .order("day", { ascending: true });

  if (error) return { ok: false, reason: `Kickio query failed: ${error.message}` };

  const raw = ((data ?? []) as unknown as IndexPoint[]).map((p) => ({
    ...p,
    // Postgres numerics arrive as strings through PostgREST.
    index_value: Number(p.index_value),
    cohort_count: Number(p.cohort_count),
    total_sales_90d: Number(p.total_sales_90d),
  }));

  const points = trimWarmup(raw, config.warmupFloorPct);
  const verdict = assessWindow(points, config);
  if (!verdict.ok) {
    return {
      ok: false,
      reason: verdict.reason!,
      diagnostics: { ...verdict.diagnostics, rowsFetched: raw.length, warmupTrimmed: raw.length - points.length },
    };
  }

  const first = points[0];
  const last = points[points.length - 1];
  const pct = ((last.index_value - first.index_value) / first.index_value) * 100;
  const direction = pct >= 0 ? "up" : "down";
  const days = points.length;

  // One post per window, so the same fortnight is not covered twice.
  const subjectRef = `market:${last.day}`;
  const seen = await recentlyFeatured("market_index", config.cooldownDays);
  if (seen.has(subjectRef)) {
    return { ok: false, reason: `The market index was already covered on ${last.day}` };
  }

  const claims: Claim[] = [
    {
      statement: `The tracked shirt market ${direction} ${Math.abs(pct).toFixed(1)}% over ${days} days`,
      value: Number(pct.toFixed(2)),
      source: `price_index_history.index_value (${first.day} to ${last.day})`,
      basis:
        `Index ${first.index_value.toFixed(2)} to ${last.index_value.toFixed(2)}, on a basket ` +
        `that held between ${Math.min(first.cohort_count, last.cohort_count)} and ` +
        `${Math.max(first.cohort_count, last.cohort_count)} comparable shirts`,
    },
    {
      statement: `${last.total_sales_90d} sales tracked in the trailing 90 days`,
      value: last.total_sales_90d,
      source: "price_index_history.total_sales_90d",
      basis: "Market-wide data aggregated by Kickio, not Kickio's own sales",
    },
  ];

  const candidate: RecipeCandidate = {
    subjectRef,
    headline: `The shirt market ${direction} ${Math.abs(pct).toFixed(1)}% over ${days} days`,
    sourceData: {
      subject: "The shirt market",
      label: "The shirt market",
      pct_change: Number(pct.toFixed(2)),
      change_window_days: days,
      cohort_count: last.cohort_count,
      total_sales: last.total_sales_90d,
      index_from: Number(first.index_value.toFixed(2)),
      index_to: Number(last.index_value.toFixed(2)),
      from_day: first.day,
      to_day: last.day,
      data_scope: "market-wide (third-party sales data aggregated by Kickio)",
      // The series IS the subject here, which is exactly what was not true on
      // the club cards.
      series: points,
      series_basis: `The tracked market index, ${first.day} to ${last.day}`,
      cohort_drift_pct: verdict.diagnostics.cohortDriftPct,
    },
    claims,
    images: [],
  };

  return { ok: true, candidate };
}

export const MARKET_INDEX_BRIEF = `**Market Index** - how the shirt market as a whole has moved.

This is the only post that speaks for the market rather than a club, an era or a
single shirt. The figure is an index: a basket of comparable shirts tracked
across the window, not an average of whatever sold.

Three hard rules:
- This is MARKET data Kickio aggregates from across the hobby. It is not
  Kickio's own sales volume. Never imply otherwise.
- An index movement is small by nature. Do not dress a 2% move up as a crash or
  a boom, and never call it a record - you have no history to compare it to.
- Give collectors something to do with it. A market that has drifted down is a
  buying observation; one that has drifted up says something about what they
  already own. Frame it as an observation, never as advice.`;
