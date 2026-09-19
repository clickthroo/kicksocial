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
    assert.match(verdict.reason, /kickio-read-only-role\.sql/);
    assert.match(verdict.reason, /kickio_content_reader/);
  });

  test("any sale at all means the table is readable", () => {
    assert.deepEqual(salesAccess(1426, 1), { ok: true, blind: false });
  });

  /** Nothing was asked for, so nothing coming back proves nothing. */
  test("no candidates is not evidence of blindness", () => {
    assert.deepEqual(salesAccess(0, 0), { ok: false, blind: false });
  });
});
