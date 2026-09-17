import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  assessWindow,
  cohortDriftPct,
  trimWarmup,
  DEFAULT_MARKET_INDEX_CONFIG as CONFIG,
  type IndexPoint,
} from "./market-index.ts";

const point = (day: string, index_value: number, cohort_count: number): IndexPoint => ({
  day,
  index_value,
  cohort_count,
  total_sales_90d: cohort_count * 3,
});

/**
 * A quiet index: basket steady, price barely moving (-0.29% over 30 days).
 * Deliberately flat, so it exercises the noise threshold rather than the
 * publish path - an earlier version of this fixture drifted 2.9% and quietly
 * turned the "too small to be a story" test into a second publish test.
 */
const settled = (): IndexPoint[] =>
  Array.from({ length: 30 }, (_, i) =>
    point(`2026-09-${String(i + 1).padStart(2, "0")}`, 100 - i * 0.01, 1900 + (i % 5)),
  );

describe("the warm-up is not data", () => {
  test("drops the opening days when the basket was empty", () => {
    // The first row on record is cohort_count 0 at index 100.00. That 100 is
    // the definition of an index's first day, not a measurement - anchoring a
    // percentage to it invents a movement out of nothing.
    const points = [point("2026-06-13", 100, 0), point("2026-06-14", 99, 0), ...settled()];
    const trimmed = trimWarmup(points, CONFIG.warmupFloorPct);
    assert.equal(trimmed.length, 30);
    assert.equal(trimmed[0].cohort_count > 0, true);
  });

  test("drops days where the basket is far below the window's normal size", () => {
    const points = [point("2026-08-01", 100, 40), ...settled()];
    assert.equal(trimWarmup(points, CONFIG.warmupFloorPct).length, 30);
  });

  test("keeps everything when the index was already running", () => {
    assert.equal(trimWarmup(settled(), CONFIG.warmupFloorPct).length, 30);
  });

  test("returns nothing rather than throwing on an empty series", () => {
    assert.deepEqual(trimWarmup([], CONFIG.warmupFloorPct), []);
  });
});

describe("basket drift", () => {
  test("measures the spread across the window, not just the ends", () => {
    // A basket that balloons mid-window and comes back is not steady, even
    // though first and last agree.
    const points = [point("a", 100, 1000), point("b", 99, 2000), point("c", 98, 1000)];
    assert.equal(Math.round(cohortDriftPct(points)), 100);
  });

  test("a steady basket drifts barely at all", () => {
    assert.ok(cohortDriftPct(settled()) < 1);
  });
});

describe("what may be quoted", () => {
  test("refuses Kickio's real data today - the basket is still filling", () => {
    // Observed 2026-09-17: over 30 days the cohort ran 1,261 -> 2,036, +61.5%,
    // while the index moved -0.6%. That is tracking coverage growing, not the
    // market moving, and quoting it would be the mix-shift trap one level up.
    const points = Array.from({ length: 31 }, (_, i) =>
      point(`2026-08-${String(i + 1).padStart(2, "0")}`, 98.34 - i * 0.02, 1261 + i * 25),
    );
    const verdict = assessWindow(points, CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason ?? "", /basket behind the index changed/);
    assert.match(verdict.reason ?? "", /tracking coverage growing, not the market/);
  });

  test("publishes once the basket holds still and the move is real", () => {
    const points = Array.from({ length: 30 }, (_, i) =>
      point(`2026-09-${String(i + 1).padStart(2, "0")}`, 100 - i * 0.2, 1900 + (i % 7)),
    );
    const verdict = assessWindow(points, CONFIG);
    assert.equal(verdict.ok, true, verdict.reason);
    assert.ok(Math.abs(verdict.diagnostics.pctChange as number) >= CONFIG.minAbsPctChange);
  });

  test("refuses a move too small to be a story even on a steady basket", () => {
    const verdict = assessWindow(settled(), CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason ?? "", /below the .* threshold/);
  });

  test("refuses too few days to be a line", () => {
    const verdict = assessWindow(settled().slice(0, 5), CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason ?? "", /days of index history/);
  });

  test("always reports the numbers that decided it", () => {
    // A skip a reviewer cannot check is just as opaque as a wrong post.
    const verdict = assessWindow(settled(), CONFIG);
    assert.equal(typeof verdict.diagnostics.cohortDriftPct, "number");
    assert.equal(typeof verdict.diagnostics.pctChange, "number");
    assert.equal(typeof verdict.diagnostics.indexFrom, "number");
  });
});
