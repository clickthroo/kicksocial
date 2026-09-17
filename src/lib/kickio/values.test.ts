import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cleanValue, cleanFacts } from "./values.ts";

describe("placeholder scrubbing", () => {
  test("drops the placeholders present in Kickio's data", () => {
    // Observed on active listings 2026-09-17: player_name "Unknown" (7) and ""
    // (27), manufacturer "Other" (12), size "N/A" (1). "Unknown" reached a card
    // as a badge reading "Unknown printing".
    for (const value of ["Unknown", "", "   ", "N/A", "Other", "None", "TBC", "-", "?"]) {
      assert.equal(cleanValue(value), null, `${JSON.stringify(value)} is not a fact`);
    }
  });

  test("is case- and whitespace-insensitive", () => {
    for (const value of ["UNKNOWN", " unknown ", "n/a", "N/a", "  Other  "]) {
      assert.equal(cleanValue(value), null, value);
    }
  });

  test("keeps real values, trimmed", () => {
    assert.equal(cleanValue("Beckham"), "Beckham");
    assert.equal(cleanValue("  Cantona "), "Cantona");
    assert.equal(cleanValue("J.S.Park"), "J.S.Park");
    assert.equal(cleanValue("Di Maria"), "Di Maria");
  });

  test("keeps values that merely contain a placeholder word", () => {
    // Only exact matches are placeholders - a real name must survive.
    assert.equal(cleanValue("Other Kit Co"), "Other Kit Co");
    assert.equal(cleanValue("Nakamura"), "Nakamura");
  });

  test("drops punctuation-only values", () => {
    assert.equal(cleanValue("—"), null);
    assert.equal(cleanValue("..."), null);
  });

  test("treats non-strings as absent", () => {
    assert.equal(cleanValue(null), null);
    assert.equal(cleanValue(undefined), null);
    assert.equal(cleanValue(42), null);
  });
});

describe("fact scrubbing", () => {
  test("removes placeholder keys entirely rather than nulling them", () => {
    const facts = cleanFacts({
      team: "Arsenal",
      player_name: "Unknown",
      manufacturer: "Other",
      season: "1996-97",
    });
    assert.deepEqual(facts, { team: "Arsenal", season: "1996-97" });
    assert.ok(!("player_name" in facts));
    assert.ok(!("manufacturer" in facts));
  });

  test("leaves non-string values alone", () => {
    const facts = cleanFacts({
      price_cents: 33_299,
      signals: ["Match issue"],
      boxed: false,
      missing: null,
    });
    assert.deepEqual(facts, { price_cents: 33_299, signals: ["Match issue"], boxed: false });
  });
});
