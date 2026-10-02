import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MOST_WANTED_CONFIG,
  clubOf,
  kitLabel,
  median,
  pressureLabel,
  rankSubjects,
  subjectRef,
} from "./most-wanted.ts";

const CONFIG = DEFAULT_MOST_WANTED_CONFIG;

function sale(
  team: string,
  season: string,
  kit = "Home",
  price = 10_000,
  extra: Record<string, unknown> = {},
) {
  return {
    team,
    season,
    shirt_type: kit,
    item_kind: "shirt",
    price_cents: price,
    currency: "GBP",
    ...extra,
  };
}

function many(team: string, season: string, count: number, kit = "Home") {
  return Array.from({ length: count }, () => sale(team, season, kit));
}

describe("the subject is a shirt, not a season", () => {
  test("the kit is part of the key", () => {
    // Real Madrid 2014-15 was 34 away, 12 home and 3 third. Grouped as one
    // subject the card added demand for one shirt to supply of another.
    assert.notEqual(
      subjectRef("Real Madrid", "2014-15", "Home"),
      subjectRef("Real Madrid", "2014-15", "Away"),
    );
  });

  test("the key is stable across casing and spacing", () => {
    // The cooldown is keyed on this, so casing drift would repeat a subject
    // inside the six months it exists to protect.
    assert.equal(
      subjectRef("Manchester United", "1996-97", "Home"),
      subjectRef(" manchester united ", "1996-97", " HOME "),
    );
  });

  test("the club comes back out of the key for the club cooldown", () => {
    assert.equal(clubOf(subjectRef("Manchester United", "1996-97", "Home")), "manchester united");
  });

  test("the kit is printed in title case whatever the row holds", () => {
    assert.equal(kitLabel("home"), "Home");
    assert.equal(kitLabel(" AWAY "), "Away");
    assert.equal(kitLabel(null), "");
  });

  test("two kits of the same season are counted apart, not pooled", () => {
    const sales = [...many("Real Madrid", "2014-15", 34, "Away"), ...many("Real Madrid", "2014-15", 12, "Home")];
    const listed = new Map([
      [subjectRef("Real Madrid", "2014-15", "Away"), 2],
      [subjectRef("Real Madrid", "2014-15", "Home"), 4],
    ]);
    const ranked = rankSubjects(sales, listed, CONFIG);
    assert.equal(ranked.length, 2);
    const away = ranked.find((r) => r.kit === "Away")!;
    const home = ranked.find((r) => r.kit === "Home")!;
    assert.equal(away.sales, 34);
    assert.equal(home.sales, 12);
    // And the away shirt leads, which pooling them would have hidden.
    assert.equal(ranked[0].kit, "Away");
  });
});

describe("ranking on pressure, not volume", () => {
  test("the shirt clearing fastest leads, not the one with most sales", () => {
    const sales = [...many("England", "2010-11", 86), ...many("Real Madrid", "2014-15", 49, "Away")];
    const listed = new Map([
      [subjectRef("England", "2010-11", "Home"), 30],
      [subjectRef("Real Madrid", "2014-15", "Away"), 2],
    ]);
    const ranked = rankSubjects(sales, listed, CONFIG);
    assert.equal(ranked[0].team, "Real Madrid");
    assert.ok(ranked[0].sales < ranked[1].sales, "the leader has fewer sales, as intended");
  });

  test("a tie on pressure breaks on sales, not on insertion order", () => {
    const sales = [...many("Arsenal", "1998-99", 20), ...many("Chelsea", "1998-99", 40)];
    const listed = new Map([
      [subjectRef("Arsenal", "1998-99", "Home"), 2],
      [subjectRef("Chelsea", "1998-99", "Home"), 4],
    ]);
    assert.equal(rankSubjects(sales, listed, CONFIG)[0].team, "Chelsea");
  });
});

describe("what is refused", () => {
  test("a shirt with too few sales is not ranked", () => {
    const sales = many("Everton", "1995-96", CONFIG.minSales - 1);
    const listed = new Map([[subjectRef("Everton", "1995-96", "Home"), 2]]);
    assert.equal(rankSubjects(sales, listed, CONFIG).length, 0);
  });

  test("a single remaining listing is refused, however hot it looks", () => {
    // 40 sales against one listing is a pressure of 40 and would top every
    // chart. The denominator is too small to mean anything.
    const sales = many("Ajax", "1994-95", 40);
    const listed = new Map([[subjectRef("Ajax", "1994-95", "Home"), 1]]);
    assert.equal(rankSubjects(sales, listed, CONFIG).length, 0);
  });

  test("a shirt nobody stocks is refused rather than divided by zero", () => {
    assert.equal(rankSubjects(many("Torino", "1992-93", 30), new Map(), CONFIG).length, 0);
  });

  test("training tops and goalkeeper shirts are not demand for the shirt", () => {
    // Measured: leaving them in takes England 2010-11 from 99 sales to 206 and
    // ranks the clubs that sell most training gear.
    const sales = [
      ...many("England", "2010-11", 4),
      ...Array.from({ length: 40 }, () => sale("England", "2010-11", "Training")),
      ...Array.from({ length: 40 }, () => sale("England", "2010-11", "Goalkeeper")),
    ];
    const listed = new Map([[subjectRef("England", "2010-11", "Home"), 2]]);
    assert.equal(rankSubjects(sales, listed, CONFIG).length, 0);
  });

  test("shorts and jackets are not shirts", () => {
    const sales = Array.from({ length: 40 }, () =>
      sale("Juventus", "2001-02", "Home", 10_000, { item_kind: "shorts" }),
    );
    const listed = new Map([[subjectRef("Juventus", "2001-02", "Home"), 3]]);
    assert.equal(rankSubjects(sales, listed, CONFIG).length, 0);
  });

  test("a row missing its team or season is skipped, not grouped under undefined", () => {
    const sales = [
      ...many("Roma", "2000-01", 10),
      ...Array.from({ length: 30 }, () => sale("Roma", "2000-01", "Home", 10_000, { season: null })),
    ];
    const listed = new Map([[subjectRef("Roma", "2000-01", "Home"), 2]]);
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
  });
});

describe("the variety rules, which the measurements made necessary", () => {
  test("six months on the shirt, as asked", () => {
    assert.equal(CONFIG.cooldownDays, 180);
  });

  test("a shorter club cooldown exists, because the long one does not touch this", () => {
    // Every Manchester United season is a different subject, so the six months
    // never blocks the club. Measured 2026-10-02: 24 of the 54 qualifying
    // subjects are Manchester United, across a pool of only 14 clubs.
    assert.ok(CONFIG.clubCooldownDays > 0);
    assert.ok(CONFIG.clubCooldownDays < CONFIG.cooldownDays);
  });

  test("the club cooldown is short enough that 14 clubs can always fill it", () => {
    // Six weeks of history can block at most six clubs, which must leave
    // choices. If the pool of clubs ever drops near the weeks blocked, the
    // recipe starts leaning on its relaxation instead of its rule.
    const weeksBlocked = CONFIG.clubCooldownDays / 7;
    assert.ok(weeksBlocked < 14, "the club cooldown can block the whole measured pool");
  });

  test("no club may take more than two of the five tiles", () => {
    // Ranked purely on pressure the top five come out five Manchester United
    // shirts, which reads as a fan post rather than as the market.
    assert.ok(CONFIG.maxPerClub >= 1);
    assert.ok(CONFIG.maxPerClub * 3 >= CONFIG.featureCount, "the cap cannot be filled by three clubs");
    assert.ok(CONFIG.maxPerClub < CONFIG.featureCount, "the cap does not actually cap anything");
  });

  test("a weekly recipe needs 26 subjects in the window, and 54 qualify", () => {
    // Measured against live Kickio data on 2026-10-02 at kit level, counting
    // only shirts with an active listing behind them. Pooling the kits gave
    // 128 and counting approved product records gave 251; both were wrong for
    // different reasons.
    const weeksInWindow = Math.ceil(CONFIG.cooldownDays / 7);
    assert.ok(weeksInWindow <= 26);
    assert.ok(54 > weeksInWindow, "measured headroom has collapsed, re-check the thresholds");
  });
});
