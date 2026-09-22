import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { salesAccess } from "./sales-access.ts";

describe("telling an unreadable table from a quiet market", () => {
  /** The actual run: 1,426 candidates, 0 sales, reported as a market fact. */
  test("zero sales against real candidates is a permissions fault", () => {
    const verdict = salesAccess(1426, 0);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.blind, true);
    assert.ok(verdict.blind);
    assert.match(verdict.reason, /cannot see Kickio's recorded sales/);
    assert.match(verdict.reason, /1426 live listings but 0 sales_history rows/);
  });

  test("the reason names the remedy, not just the symptom", () => {
    const verdict = salesAccess(1426, 0);
    assert.ok(verdict.blind);
    assert.match(verdict.reason, /kickio_content_reader/);
    assert.match(verdict.reason, /KICKIO_SUPABASE_PUBLISHABLE_KEY/);
    assert.match(verdict.reason, /unblocking-sold-this-week\.md/);
  });

  /**
   * Collection Index counts shirts, not listings. A reason read off a run log
   * has to say which, or it describes the wrong recipe's problem.
   */
  test("the subject is named by the caller", () => {
    const verdict = salesAccess(37, 0, "shirts in the shortlisted collections");
    assert.ok(verdict.blind);
    assert.match(verdict.reason, /37 shirts in the shortlisted collections but 0 sales_history rows/);
    assert.doesNotMatch(verdict.reason, /live listings/);
  });

  /**
   * Sold This Week asks for one week, so zero rows is genuinely ambiguous and
   * `salesAccess` cannot settle it from counts alone - which is exactly why
   * that recipe probes the table instead. Guarding the boundary here so the
   * two are not confused for each other later.
   */
  test("one week of nothing is not, by itself, evidence of blindness", () => {
    assert.deepEqual(salesAccess(0, 0), { ok: false, blind: false });
  });

  test("any sale at all means the table is readable", () => {
    assert.deepEqual(salesAccess(1426, 1), { ok: true, blind: false });
  });

  /** Nothing was asked for, so nothing coming back proves nothing. */
  test("no candidates is not evidence of blindness", () => {
    assert.deepEqual(salesAccess(0, 0), { ok: false, blind: false });
  });
});
