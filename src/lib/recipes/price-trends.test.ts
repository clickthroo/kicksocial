import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  selectPublishable,
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
