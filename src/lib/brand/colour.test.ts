import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  contrast,
  deltaE,
  isHexColour,
  normaliseHex,
  checkDirectionPair,
  CVD_FLOOR,
} from "./colour.ts";

describe("hex input", () => {
  test("accepts what a colour picker produces, with or without the hash", () => {
    assert.ok(isHexColour("#2bd14a"));
    assert.ok(isHexColour("2bd14a"));
    assert.ok(isHexColour("  #2BD14A  "));
  });

  test("refuses anything that would poison the maths", () => {
    // Unguarded, parseInt turns these into NaN and every check passes silently.
    for (const bad of ["", "#fff", "#12345", "#1234567", "red", "#ggghhh", "rgb(1,2,3)"]) {
      assert.equal(isHexColour(bad), false, bad);
    }
  });

  test("normalises to lowercase with a hash, so stored values compare equal", () => {
    assert.equal(normaliseHex("2BD14A"), "#2bd14a");
    assert.equal(normaliseHex("#2bd14a"), "#2bd14a");
  });
});

describe("the maths matches the dataviz validator", () => {
  // These are the figures quoted in the README. A second implementation that
  // drifts from the first is worse than no check at all.
  test("reproduces the shipped rising/falling pair", () => {
    assert.equal(deltaE("#2bd14a", "#9085e9", "deutan").toFixed(1), "27.1");
    assert.equal(deltaE("#2bd14a", "#9085e9", "tritan").toFixed(1), "14.8");
    assert.equal(deltaE("#2bd14a", "#9085e9").toFixed(1), "35.5");
  });

  test("puts the old dark green against red below the floor", () => {
    // Why falling is purple rather than red. The exact figure depends which
    // red, so only the property is asserted.
    assert.ok(deltaE("#0ca30c", "#d92433", "deutan") < CVD_FLOOR);
  });

  test("contrast is symmetric and bounded", () => {
    assert.equal(contrast("#ffffff", "#000000").toFixed(0), "21");
    assert.equal(contrast("#000000", "#ffffff").toFixed(0), "21");
    assert.equal(contrast("#2bd14a", "#2bd14a").toFixed(0), "1");
  });
});

describe("the warning the editor shows", () => {
  const surface = "#14181d";

  test("passes the shipped pair", () => {
    const checks = checkDirectionPair("#2bd14a", "#9085e9", surface);
    assert.ok(checks.every((c) => c.ok), JSON.stringify(checks));
  });

  test("warns when rising and falling collapse for a colourblind reader", () => {
    const checks = checkDirectionPair("#0ca30c", "#d92433", surface);
    const cvd = checks[0];
    assert.equal(cvd.ok, false);
    assert.match(cvd.message, /red-green colourblind/);
  });

  test("warns when a colour is too faint against the card", () => {
    const checks = checkDirectionPair("#1a1e24", "#9085e9", surface);
    assert.ok(checks.some((c) => !c.ok && /contrast/.test(c.message)));
  });

  test("warns rather than refuses - direction is also an arrow and a sign", () => {
    // A check returning false is advisory; nothing here throws or blocks.
    const checks = checkDirectionPair("#0ca30c", "#d92433", surface);
    assert.ok(checks.every((c) => c.level === "ok" || c.level === "warn"));
  });

  test("the floor is the one the dataviz skill uses", () => {
    assert.equal(CVD_FLOOR, 8);
  });
});
