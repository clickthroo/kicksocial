import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseRule,
  expandRule,
  slotKey,
  scopeLine,
  summariseSet,
  qualifies,
  subjectRefFor,
  DEFAULT_FEATURED_SET_CONFIG,
} from "./featured-set.ts";

const CONFIG = { ...DEFAULT_FEATURED_SET_CONFIG, seasonTo: 2026 };

const set = { id: "s1", slug: "juventus-home", name: "Juventus Home", kind: "generated", visibility: "public", rule: null };

const product = (year: number, type: string, over: Record<string, unknown> = {}) => ({
  id: `p-${year}-${type}`,
  team: "Juventus",
  season: `${year}-${String((year + 1) % 100).padStart(2, "0")}`,
  shirt_type: type,
  name: `${year} Juventus ${type}`,
  slug: `${year}-juventus-${type}`,
  primary_image_url: `https://img.example/${year}-${type}.jpg`,
  ...over,
});

describe("reading a set's rule", () => {
  test("accepts the plural form", () => {
    const rule = parseRule({ teams: ["Juventus"], season_from: 1980, shirt_types: ["Home", "Away"] })!;
    assert.deepEqual(rule.teams, ["Juventus"]);
    assert.deepEqual(rule.shirtTypes, ["Home", "Away"]);
    assert.equal(rule.seasonFrom, 1980);
  });

  test("accepts the singular form - Kickio writes both", () => {
    const rule = parseRule({ team: "Mexico", shirt_type: "Home", season_from: 2000 })!;
    assert.deepEqual(rule.teams, ["Mexico"]);
    assert.deepEqual(rule.shirtTypes, ["Home"]);
    assert.equal(rule.seasonFrom, 2000);
  });

  test("reads per-type overrides", () => {
    const rule = parseRule({
      teams: ["Juventus"],
      season_from: 1980,
      shirt_types: ["Home", "Away", "Third"],
      type_season_from: { third: 2000 },
    })!;
    assert.equal(rule.typeSeasonFrom.third, 2000);
  });

  test("refuses a rule with no team or no type rather than counting nothing", () => {
    assert.equal(parseRule(null), null);
    assert.equal(parseRule({ season_from: 1980 }), null);
    assert.equal(parseRule({ teams: ["Juventus"] }), null);
    assert.equal(parseRule({ shirt_types: ["Home"] }), null);
  });
});

describe("expanding a rule to slots", () => {
  // These three numbers are Kickio's own, taken from collector_profile
  // .sets_snapshot. Reproducing them is what licenses this recipe to print a
  // denominator at all: a post that disagrees with the page it links to is
  // worse than no post.
  test("Juventus Home is 47", () => {
    const rule = parseRule({ teams: ["Juventus"], season_from: 1980, shirt_types: ["Home"] })!;
    assert.equal(expandRule(rule, 2026).length, 47);
  });

  test("Juventus Home & Away is 94", () => {
    const rule = parseRule({ teams: ["Juventus"], season_from: 1980, shirt_types: ["Home", "Away"] })!;
    assert.equal(expandRule(rule, 2026).length, 94);
  });

  test("The Full Juventus Collection is 121, with Third counted from 2000", () => {
    const rule = parseRule({
      teams: ["Juventus"],
      season_from: 1980,
      shirt_types: ["Home", "Away", "Third"],
      type_season_from: { third: 2000 },
    })!;
    // 47 + 47 + 27, not 47 x 3.
    assert.equal(expandRule(rule, 2026).length, 121);
  });

  test("slot keys are case-stable", () => {
    assert.equal(slotKey("Juventus", "Home", 1995), slotKey(" juventus ", "HOME", 1995));
  });
});

describe("counting a set against Kickio", () => {
  const rule = parseRule({ teams: ["Juventus"], season_from: 2000, shirt_types: ["Home"] })!;
  // 2000..2026 = 27 slots.
  const held = Array.from({ length: 20 }, (_, i) => product(2000 + i, "Home"));

  test("covered counts catalogue, buyable counts listings", () => {
    // The distinction Featured Collection had to be corrected for: a shirt
    // page is not a shirt for sale.
    const buyable = new Set(held.slice(0, 12).map((p) => p.id));
    const summary = summariseSet(set, rule, held, buyable, CONFIG)!;
    assert.equal(summary.slots, 27);
    assert.equal(summary.covered, 20);
    assert.equal(summary.buyable, 12);
  });

  test("a season Kickio holds twice counts once", () => {
    const dupes = [product(2001, "Home"), product(2001, "Home", { id: "other" })];
    const summary = summariseSet(set, rule, dupes, new Set(["other"]), CONFIG)!;
    assert.equal(summary.covered, 1);
    assert.equal(summary.buyable, 1);
  });

  test("a season outside the rule is not counted", () => {
    const summary = summariseSet(set, rule, [product(1994, "Home")], new Set(), CONFIG)!;
    assert.equal(summary.covered, 0);
  });

  test("an unparseable season is skipped rather than guessed", () => {
    // Some products.season values do not start with a four-digit year, which
    // is why this parses instead of casting.
    const odd = [product(2001, "Home", { season: "19/20" }), product(2002, "Home", { season: null })];
    const summary = summariseSet(set, rule, odd, new Set(), CONFIG)!;
    assert.equal(summary.covered, 0);
  });

  test("gaps list the seasons Kickio has nothing for", () => {
    const summary = summariseSet(set, rule, [product(2000, "Home")], new Set(), CONFIG)!;
    assert.equal(summary.gaps.length, 26);
    assert.equal(summary.gaps[0], "2001 Home");
  });

  test("the grid shows only buyable shirts, oldest first", () => {
    const buyable = new Set([held[5].id, held[2].id, held[9].id]);
    const summary = summariseSet(set, rule, held, buyable, CONFIG)!;
    assert.deepEqual(
      summary.featured.map((f) => f.season?.slice(0, 4)),
      ["2002", "2005", "2009"],
    );
  });
});

describe("qualifying", () => {
  const rule = parseRule({ teams: ["Juventus"], season_from: 2000, shirt_types: ["Home"] })!;
  const held = Array.from({ length: 20 }, (_, i) => product(2000 + i, "Home"));

  test("a real set passes", () => {
    const buyable = new Set(held.map((p) => p.id));
    assert.equal(qualifies(summariseSet(set, rule, held, buyable, CONFIG)!, CONFIG).ok, true);
  });

  test("a set nobody is selling is refused", () => {
    // Full of shirt pages and nothing to buy: a fine page, a bad post.
    const verdict = qualifies(summariseSet(set, rule, held, new Set(), CONFIG)!, CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /0 of 27/);
  });

  test("a tiny set is refused", () => {
    const small = parseRule({ teams: ["Juventus"], season_from: 2024, shirt_types: ["Home"] })!;
    const verdict = qualifies(summariseSet(set, small, held, new Set(), CONFIG)!, CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /3 slots/);
  });
});

describe("the card's scope line", () => {
  test("says what the set actually covers", () => {
    const rule = parseRule({
      teams: ["Juventus"],
      season_from: 1980,
      shirt_types: ["Home", "Away", "Third"],
      type_season_from: { third: 2000 },
    })!;
    assert.equal(scopeLine(rule, 2026), "1980–2026 · Home, Away, Third");
  });
});

describe("subject refs", () => {
  test("case-folded, so one set cannot post twice under two spellings", () => {
    assert.equal(subjectRefFor(" Juventus-Home "), "set:juventus-home");
  });
});
