import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MOST_WANTED_CONFIG,
  median,
  pressureLabel,
  rankSubjects,
  subjectRef,
} from "./most-wanted.ts";

const CONFIG = DEFAULT_MOST_WANTED_CONFIG;

function sale(team: string, season: string, price = 10_000, extra: Record<string, unknown> = {}) {
  return {
    team,
    season,
    shirt_type: "Home",
    item_kind: "shirt",
    price_cents: price,
    currency: "GBP",
    ...extra,
  };
}

function many(team: string, season: string, count: number, price = 10_000) {
  return Array.from({ length: count }, () => sale(team, season, price));
}

describe("the subject key", () => {
  test("is stable across casing and spacing", () => {
    // The cooldown is keyed on this. A subject that comes back as "manchester
    // united" after being posted as "Manchester United" would repeat inside
    // the six months the cooldown exists to protect.
    assert.equal(subjectRef("Manchester United", "1996-97"), subjectRef(" manchester united ", "1996-97"));
  });

  test("keeps different seasons apart", () => {
    assert.notEqual(subjectRef("Liverpool", "2018-19"), subjectRef("Liverpool", "2019-20"));
  });
});

describe("ranking on pressure, not volume", () => {
  test("the shirt clearing fastest leads, not the one with most sales", () => {
    // This is the whole point of the recipe. Ranked on raw volume the answer
    // would be the mass-produced shirt; ranked on sales per listing it is the
    // one you cannot get.
    const sales = [...many("England", "2010-11", 99), ...many("Real Madrid", "2014-15", 49)];
    const listed = new Map([
      [subjectRef("England", "2010-11"), 30],
      [subjectRef("Real Madrid", "2014-15"), 2],
    ]);
    const ranked = rankSubjects(sales, listed, CONFIG);
    assert.equal(ranked[0].team, "Real Madrid");
    assert.equal(ranked[1].team, "England");
    assert.ok(ranked[0].sales < ranked[1].sales, "the leader has fewer sales, as intended");
  });

  test("a tie on pressure breaks on sales, not on insertion order", () => {
    // Both clear at 10 per listing. Without the tie-break the leaderboard
    // reshuffles between runs for no reason a reader could see.
    const sales = [...many("Arsenal", "1998-99", 20), ...many("Chelsea", "1998-99", 40)];
    const listed = new Map([
      [subjectRef("Arsenal", "1998-99"), 2],
      [subjectRef("Chelsea", "1998-99"), 4],
    ]);
    const ranked = rankSubjects(sales, listed, CONFIG);
    assert.equal(ranked[0].team, "Chelsea");
  });
});

describe("what is refused", () => {
  test("a shirt with too few sales is not ranked", () => {
    const sales = many("Everton", "1995-96", CONFIG.minSales - 1);
    const listed = new Map([[subjectRef("Everton", "1995-96"), 2]]);
    assert.equal(rankSubjects(sales, listed, CONFIG).length, 0);
  });

  test("a single remaining listing is refused, however hot it looks", () => {
    // 40 sales against one listing is a pressure of 40 and would top every
    // chart. It is also one shirt away from being a post about nothing, and
    // the denominator is too small to mean anything.
    const sales = many("Ajax", "1994-95", 40);
    const listed = new Map([[subjectRef("Ajax", "1994-95"), 1]]);
    assert.equal(rankSubjects(sales, listed, CONFIG).length, 0);
  });

  test("a shirt nobody stocks is refused rather than divided by zero", () => {
    const sales = many("Torino", "1992-93", 30);
    assert.equal(rankSubjects(sales, new Map(), CONFIG).length, 0);
  });

  test("training tops and goalkeeper shirts do not count as demand for the shirt", () => {
    // Measured: leaving them in takes England 2010-11 from 99 sales to 206,
    // which ranks the clubs that sell most training gear rather than the
    // shirts collectors chase.
    const sales = [
      ...many("England", "2010-11", 4),
      ...Array.from({ length: 40 }, () =>
        sale("England", "2010-11", 10_000, { shirt_type: "Training" }),
      ),
      ...Array.from({ length: 40 }, () =>
        sale("England", "2010-11", 10_000, { shirt_type: "Goalkeeper" }),
      ),
    ];
    const listed = new Map([[subjectRef("England", "2010-11"), 2]]);
    // 4 match shirts, under the minimum, so nothing is ranked.
    assert.equal(rankSubjects(sales, listed, CONFIG).length, 0);
  });

  test("shorts and jackets are not shirts", () => {
    const sales = Array.from({ length: 40 }, () =>
      sale("Juventus", "2001-02", 10_000, { item_kind: "shorts" }),
    );
    const listed = new Map([[subjectRef("Juventus", "2001-02"), 3]]);
    assert.equal(rankSubjects(sales, listed, CONFIG).length, 0);
  });

  test("home, away and third all count", () => {
    const sales = [
      ...Array.from({ length: 4 }, () => sale("Inter", "1997-98", 10_000, { shirt_type: "Home" })),
      ...Array.from({ length: 3 }, () => sale("Inter", "1997-98", 10_000, { shirt_type: "Away" })),
      ...Array.from({ length: 3 }, () => sale("Inter", "1997-98", 10_000, { shirt_type: "third" })),
    ];
    const listed = new Map([[subjectRef("Inter", "1997-98"), 2]]);
    const ranked = rankSubjects(sales, listed, CONFIG);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].sales, 10);
  });

  test("a row missing its team or season is skipped, not grouped under undefined", () => {
    const sales = [
      ...many("Roma", "2000-01", 10),
      ...Array.from({ length: 30 }, () => sale("Roma", "2000-01", 10_000, { season: null })),
    ];
    const listed = new Map([[subjectRef("Roma", "2000-01"), 2]]);
    const ranked = rankSubjects(sales, listed, CONFIG);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].sales, 10);
  });
});

describe("the median price", () => {
  test("an odd count takes the middle", () => {
    assert.equal(median([100, 300, 200]), 200);
  });

  test("an even count averages the two middles", () => {
    assert.equal(median([100, 200, 300, 400]), 250);
  });

  test("an empty list is zero rather than NaN", () => {
    // NaN would reach formatPrice and print on a card.
    assert.equal(median([]), 0);
  });

  test("it is the median and not the mean, so one silly sale cannot move it", () => {
    assert.equal(median([1_000, 1_100, 1_200, 1_300, 900_000]), 1_200);
  });
});

describe("how the figure is written", () => {
  test("under ten keeps a decimal, because 4 and 4.5 are different stories", () => {
    assert.equal(pressureLabel(4.5), "4.5");
  });

  test("ten and over rounds, because 24.5 sales per listing is false precision", () => {
    assert.equal(pressureLabel(24.5), "25");
    assert.equal(pressureLabel(16.5), "17");
  });
});

describe("the six month cooldown is long enough to matter and short enough to survive", () => {
  test("it is six months", () => {
    assert.equal(DEFAULT_MOST_WANTED_CONFIG.cooldownDays, 180);
  });

  test("a weekly recipe needs about 26 subjects to fill it, and 251 qualify", () => {
    // Measured against live Kickio data on 2026-09-30. If this ratio ever gets
    // tight the recipe starts skipping, so the headroom is worth recording.
    const weeksInWindow = Math.ceil(DEFAULT_MOST_WANTED_CONFIG.cooldownDays / 7);
    assert.ok(weeksInWindow <= 26);
    assert.ok(251 > weeksInWindow * 5, "measured headroom has collapsed, re-check the thresholds");
  });
});
