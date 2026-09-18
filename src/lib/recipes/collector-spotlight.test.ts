import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  shapeOf,
  qualifies,
  DEFAULT_COLLECTOR_SPOTLIGHT_CONFIG as CONFIG,
} from "./collector-spotlight.ts";
import {
  measure,
  percentOf,
  qualifies as progressQualifies,
  DEFAULT_COLLECTOR_SET_PROGRESS_CONFIG,
} from "./collector-set-progress.ts";
import { parseRule } from "./featured-set.ts";

const shirt = (year: number, team: string, over: Record<string, unknown> = {}) => ({
  id: `p-${team}-${year}`,
  name: `${year} ${team} Home`,
  team,
  season: `${year}-${String((year + 1) % 100).padStart(2, "0")}`,
  shirt_type: "Home",
  primary_image_url: `https://img.example/${team}-${year}.jpg`,
  ...over,
});

const spread = () => [
  ...Array.from({ length: 8 }, (_, i) => shirt(1990 + i, "Everton")),
  ...Array.from({ length: 5 }, (_, i) => shirt(2005 + i, "Juventus")),
  ...Array.from({ length: 3 }, (_, i) => shirt(2015 + i, "Japan")),
];

describe("the shape of a collection", () => {
  test("counts shirts, span and clubs", () => {
    const shape = shapeOf(spread(), CONFIG)!;
    assert.equal(shape.shirts, 16);
    assert.equal(shape.earliest, 1990);
    assert.equal(shape.latest, 2017);
    assert.equal(shape.spanYears, 27);
    assert.equal(shape.clubs, 3);
  });

  test("names the club they cannot stop buying", () => {
    assert.deepEqual(shapeOf(spread(), CONFIG)!.topClub, { team: "Everton", shirts: 8 });
  });

  test("the grid reads oldest first, as a timeline", () => {
    const shape = shapeOf(spread(), CONFIG)!;
    assert.equal(shape.featured[0].season?.slice(0, 4), "1990");
  });

  test("shirts with no renderable photo still count", () => {
    // They own it. The renderer's limits are not a fact about the collection.
    const shape = shapeOf(
      [...spread(), shirt(1985, "Everton", { primary_image_url: null })],
      CONFIG,
    )!;
    assert.equal(shape.shirts, 17);
    assert.equal(shape.earliest, 1985);
  });

  test("returns null when no season can be parsed", () => {
    assert.equal(shapeOf([shirt(1990, "Everton", { season: "unknown" })], CONFIG), null);
  });
});

describe("qualifying a collection", () => {
  test("a real collection passes", () => {
    assert.equal(qualifies(shapeOf(spread(), CONFIG)!, CONFIG).ok, true);
  });

  test("three shirts is not a collection", () => {
    const shape = shapeOf(Array.from({ length: 4 }, (_, i) => shirt(1990 + i, "Everton")), CONFIG)!;
    assert.equal(qualifies(shape, CONFIG).ok, false);
  });

  test("one club and one era is a shelf, not a collection", () => {
    const narrow = Array.from({ length: 14 }, (_, i) =>
      shirt(2020 + (i % 5), "Everton", { id: `n-${i}` }),
    );
    const verdict = qualifies(shapeOf(narrow, CONFIG)!, CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /spans 4 years|only 1 clubs/);
  });
});

describe("progress through a set", () => {
  const set = { id: "s1", slug: "everton-home", name: "Everton Home", rule: null };
  const rule = parseRule({ teams: ["Everton"], season_from: 2000, shirt_types: ["Home"] })!;
  const config = { ...DEFAULT_COLLECTOR_SET_PROGRESS_CONFIG, seasonTo: 2026 };

  test("counts only shirts the set asks for", () => {
    const owned = [
      ...Array.from({ length: 10 }, (_, i) => shirt(2000 + i, "Everton")),
      // Right club, wrong era.
      shirt(1994, "Everton"),
      // Wrong club entirely.
      shirt(2004, "Juventus"),
    ];
    const progress = measure(set, rule, owned, config)!;
    assert.equal(progress.slots, 27);
    assert.equal(progress.filled, 10);
  });

  test("percent is floored, so 26 of 27 is never 100", () => {
    assert.equal(percentOf(26, 27), 96);
    assert.equal(percentOf(0, 27), 0);
    assert.equal(percentOf(27, 27), 100);
    // No set, no division by zero.
    assert.equal(percentOf(3, 0), 0);
  });

  test("names what they still need, oldest first", () => {
    const owned = Array.from({ length: 10 }, (_, i) => shirt(2001 + i, "Everton"));
    const progress = measure(set, rule, owned, config)!;
    assert.equal(progress.missing[0], "2000 Home");
  });

  test("owning the same season twice counts once", () => {
    const owned = [shirt(2000, "Everton"), shirt(2000, "Everton", { id: "dupe" })];
    assert.equal(measure(set, rule, owned, config)!.filled, 1);
  });

  test("a collector with almost none of a set is refused", () => {
    const owned = Array.from({ length: 2 }, (_, i) => shirt(2000 + i, "Everton"));
    const verdict = progressQualifies(measure(set, rule, owned, config)!, config);
    assert.equal(verdict.ok, false);
  });

  test("a collector well through a set passes", () => {
    const owned = Array.from({ length: 20 }, (_, i) => shirt(2000 + i, "Everton"));
    const progress = measure(set, rule, owned, config)!;
    assert.equal(progress.percent, 74);
    assert.equal(progressQualifies(progress, config).ok, true);
  });
});
