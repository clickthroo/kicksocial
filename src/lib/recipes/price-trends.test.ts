import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  selectPublishable,
  seriesAgreesWithHeadline,
  DEFAULT_PRICE_TRENDS_CONFIG as CONFIG,
} from "./price-trends.ts";

/**
 * The real rows observed in Kickio's price_index_aggregates on 2026-09-16.
 * These are the actual figures the recipe has to make a judgement about.
 */
const REAL_ROWS = [
  { scope: "era", key: "1990", label: "1990s shirts", cohort_count: 12, total_sales: 340,
    median_fair_price_cents: 25099, pct_change_90d: 8.58, change_window_days: 90,
    change_basis: "like_for_like", updated_at: "2026-09-16T00:00:00Z" },
  { scope: "era", key: "2000", label: "2000s shirts", cohort_count: 9, total_sales: 210,
    median_fair_price_cents: 6099, pct_change_90d: null, change_window_days: null,
    change_basis: null, updated_at: "2026-09-16T00:00:00Z" },
  { scope: "era", key: "2010", label: "2010s shirts", cohort_count: 11, total_sales: 190,
    median_fair_price_cents: 4499, pct_change_90d: 13.78, change_window_days: 90,
    change_basis: "like_for_like", updated_at: "2026-09-16T00:00:00Z" },
  { scope: "club", key: "arsenal", label: "Arsenal", cohort_count: 14, total_sales: 431,
    median_fair_price_cents: 33849, pct_change_90d: 17.69, change_window_days: 90,
    change_basis: "pooled", updated_at: "2026-09-16T00:00:00Z" },
  { scope: "club", key: "england", label: "England", cohort_count: 8, total_sales: 1838,
    median_fair_price_cents: 4949, pct_change_90d: -6.18, change_window_days: 90,
    change_basis: "like_for_like", updated_at: "2026-09-16T00:00:00Z" },
  { scope: "club", key: "germany", label: "Germany", cohort_count: 7, total_sales: 723,
    median_fair_price_cents: 6124, pct_change_90d: 34.51, change_window_days: 90,
    change_basis: "like_for_like", updated_at: "2026-09-16T00:00:00Z" },
];

describe("price trend publishing rules", () => {
  test("excludes the pooled Arsenal figure despite it being attractive", () => {
    const { publishable, rejected } = selectPublishable(REAL_ROWS, CONFIG);

    assert.ok(
      !publishable.some((r) => r.key === "arsenal"),
      "Arsenal +17.69% is pooled and must never reach a draft",
    );
    const why = rejected.find((r) => r.key === "club:arsenal");
    assert.match(why!.reason, /pooled/);
    assert.match(why!.reason, /mix-shift/);
  });

  test("publishes genuine like-for-like movements", () => {
    const { publishable } = selectPublishable(REAL_ROWS, CONFIG);
    const keys = publishable.map((r) => r.key).sort();
    assert.deepEqual(keys, ["1990", "2010", "england", "germany"]);
  });

  test("skips rows with no computed change", () => {
    const { rejected } = selectPublishable(REAL_ROWS, CONFIG);
    assert.match(rejected.find((r) => r.key === "era:2000")!.reason, /No change figure/);
  });

  test("suppresses movements too small to be a story", () => {
    const rows = [{ ...REAL_ROWS[0], pct_change_90d: 1.2 }];
    const { publishable, rejected } = selectPublishable(rows, CONFIG);
    assert.equal(publishable.length, 0);
    assert.match(rejected[0].reason, /below the 5% threshold/);
  });

  test("refuses implausible swings that indicate a data problem", () => {
    // The naive team-median approach produced figures like this; they are
    // mix-shift artefacts, not price movements.
    const rows = [{ ...REAL_ROWS[0], pct_change_90d: -420 }];
    const { publishable, rejected } = selectPublishable(rows, CONFIG);
    assert.equal(publishable.length, 0);
    assert.match(rejected[0].reason, /implausible/);
  });

  test("requires a large enough comparable cohort", () => {
    const rows = [{ ...REAL_ROWS[0], cohort_count: 2 }];
    const { publishable, rejected } = selectPublishable(rows, CONFIG);
    assert.equal(publishable.length, 0);
    assert.match(rejected[0].reason, /comparable items/);
  });
});

describe("a chart may never contradict its headline", () => {
  const series = (...values: number[]) => values.map((index_value) => ({ index_value }));

  test("rejects a falling series under a rising headline", () => {
    // The bug this exists to prevent: price_index_history is a single
    // market-wide index with no scope column, and it was drawn under every
    // subject. A card read "Germany +21.9% · like-for-like" over a line that
    // ran 100.00 -> 97.74. Picture and number pointed opposite ways.
    assert.equal(seriesAgreesWithHeadline(series(100, 99, 98, 97.74), 21.9), false);
  });

  test("rejects a rising series under a falling headline", () => {
    assert.equal(seriesAgreesWithHeadline(series(90, 95, 100), -12.4), false);
  });

  test("accepts a series that moves the way the headline says", () => {
    assert.equal(seriesAgreesWithHeadline(series(100, 108, 122), 21.9), true);
    assert.equal(seriesAgreesWithHeadline(series(122, 108, 100), -18.0), true);
  });

  test("judges on net movement, not on the wobbles in between", () => {
    // A real series is noisy. Only where it started and ended is a claim.
    assert.equal(seriesAgreesWithHeadline(series(100, 130, 95, 110, 122), 21.9), true);
  });

  test("refuses too few points to be a trend", () => {
    assert.equal(seriesAgreesWithHeadline(series(100, 122), 21.9), false);
    assert.equal(seriesAgreesWithHeadline(series(100), 21.9), false);
    assert.equal(seriesAgreesWithHeadline([], 21.9), false);
  });

  test("refuses a flat series - it contradicts nothing and shows nothing", () => {
    assert.equal(seriesAgreesWithHeadline(series(100, 100, 100), 21.9), false);
  });

  test("ignores non-numeric points rather than throwing", () => {
    const dirty = [{ index_value: 100 }, { index_value: Number.NaN }, { index_value: 122 }];
    assert.equal(seriesAgreesWithHeadline(dirty, 21.9), false);
  });
});
