import { test } from "node:test";
import assert from "node:assert/strict";
import { isNew, countNew, NEW_FOR_DAYS } from "./first-seen.ts";

const NOW = Date.parse("2026-09-26T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

test("a subject seen today is new", () => {
  assert.equal(isNew(daysAgo(0), NOW), true);
  assert.equal(isNew(daysAgo(NEW_FOR_DAYS - 1), NOW), true);
});

test("the badge comes off after the window", () => {
  assert.equal(isNew(daysAgo(NEW_FOR_DAYS), NOW), false);
  assert.equal(isNew(daysAgo(60), NOW), false);
});

test("no date means not new, rather than throwing or reading as ancient", () => {
  // This is the degraded path: if the engine DB cannot be read the page still
  // renders, it just stops claiming anything is new.
  assert.equal(isNew(null, NOW), false);
  assert.equal(isNew(undefined, NOW), false);
  assert.equal(isNew("not a date", NOW), false);
});

test("a date in the future reads as new, not as ancient", () => {
  // A clock skew between the database and the renderer would make a bare
  // `now - seen` negative, which is smaller than the window and so would pass
  // anyway. Pinned so a later rewrite does not turn it into a silent miss.
  assert.equal(isNew(new Date(NOW + 3_600_000).toISOString(), NOW), true);
});

test("countNew only counts refs that are actually on the list", () => {
  const seen = new Map([
    ["collymore", daysAgo(1)],
    ["nasri", daysAgo(2)],
    ["stam", daysAgo(400)],
    ["someone-who-dropped-off", daysAgo(1)],
  ]);
  assert.equal(countNew(seen, ["collymore", "nasri", "stam"], NOW), 2);
});

test("countNew is zero when nothing is known", () => {
  assert.equal(countNew(new Map(), ["collymore"], NOW), 0);
});
