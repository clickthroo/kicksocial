import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./next-path.ts";

test("a path on this site is kept, query string and all", () => {
  assert.equal(safeNext("/who-am-i"), "/who-am-i");
  assert.equal(safeNext("/price-history?id=7"), "/price-history?id=7");
});

test("anything that could leave this site becomes the home page", () => {
  // An open redirect on a login page lends this domain's credibility to
  // somebody else's, which is most of what makes a phishing link work.
  for (const bad of [
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "http://example.com/x",
    "javascript:alert(1)",
    "",
    undefined,
    null,
    7,
    { toString: () => "/admin" },
  ]) {
    assert.equal(safeNext(bad), "/", JSON.stringify(String(bad)));
  }
});
