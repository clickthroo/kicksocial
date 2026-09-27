import { test } from "node:test";
import assert from "node:assert/strict";
import { noOrphan } from "./typography.ts";

const NBSP = " ";

test("a short last word is bound to the one before it", () => {
  // The real card: "#7" was landing on a line of its own.
  assert.equal(
    noOrphan("1993-94 Manchester United Away Shirt Cantona #7"),
    `1993-94 Manchester United Away Shirt Cantona${NBSP}#7`,
  );
});

test("a normal last word is left alone", () => {
  const title = "1986-88 Manchester United Third Shirt";
  assert.equal(noOrphan(title), title);
});

test("two words are left alone, because there is nothing to orphan", () => {
  assert.equal(noOrphan("England Third"), "England Third");
  assert.equal(noOrphan("Messi XL"), "Messi XL");
});

test("whitespace is normalised on every path, not just the rewriting one", () => {
  assert.equal(noOrphan("  Rangers FC Away  Shirt  "), "Rangers FC Away Shirt");
  assert.equal(noOrphan("  Rangers   FC  "), "Rangers FC");
});
