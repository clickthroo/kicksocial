import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  bestShirtFor,
  coverFor,
  pickSix,
  revealText,
  seasonStart,
  shirtFitsSpell,
  type ShirtRow,
} from "./who-am-i.ts";
import { CAREERS, CLUB_COUNTRY, MIN_LOAN_APPS, spellCounts } from "./careers.ts";

const shirt = (team: string, season: string, type = "Home"): ShirtRow => ({
  id: `${team}-${season}`,
  slug: null,
  team,
  season,
  shirt_type: type,
  primary_image_url: "https://example/x.jpg",
});

describe("matching a shirt to a spell", () => {
  /**
   * The rule the whole post rests on. A 2019 Ajax shirt is not a 1994 Ajax
   * player's shirt, and the answer arrives in the comments within minutes.
   */
  test("a shirt from outside the spell is not his shirt", () => {
    const spell = { team: "Ajax", from: 1991, to: 1995 };
    assert.equal(shirtFitsSpell("1993-94", spell), true);
    assert.equal(shirtFitsSpell("1991-92", spell), true, "inclusive at the start");
    assert.equal(shirtFitsSpell("1995-96", spell), true, "inclusive at the end");
    assert.equal(shirtFitsSpell("1990-91", spell), false);
    assert.equal(shirtFitsSpell("1996-97", spell), false);
  });

  test("an unreadable season never matches", () => {
    assert.equal(shirtFitsSpell(null, { team: "Ajax", from: 1991, to: 1995 }), false);
    assert.equal(shirtFitsSpell("Unknown", { team: "Ajax", from: 1991, to: 1995 }), false);
    assert.equal(seasonStart("1993-94"), 1993);
    assert.equal(seasonStart("nonsense"), null);
  });

  /**
   * A player who was somewhere five years is remembered in the middle of it,
   * not in the season he arrived - which is also the shirt he is least likely
   * to have actually worn much.
   */
  test("picks from the middle of a long spell, not the edges", () => {
    const spell = { team: "Chelsea", from: 2000, to: 2005 };
    const picked = bestShirtFor(
      [shirt("Chelsea", "2000-01"), shirt("Chelsea", "2003-04"), shirt("Chelsea", "2005-06")],
      spell,
    );
    assert.equal(picked?.season, "2003-04");
  });

  test("prefers a home shirt when two sit equally close", () => {
    const spell = { team: "Chelsea", from: 2003, to: 2003 };
    const picked = bestShirtFor(
      [shirt("Chelsea", "2003-04", "Away"), shirt("Chelsea", "2003-04", "Home")],
      spell,
    );
    assert.equal(picked?.shirt_type, "Home");
  });

  test("no shirt in the window means no club, not a near miss", () => {
    assert.equal(bestShirtFor([shirt("Ajax", "2019-20")], { team: "Ajax", from: 1991, to: 1995 }), null);
  });
});

describe("covering a career", () => {
  const byTeam = (rows: ShirtRow[]) => {
    const map = new Map<string, ShirtRow[]>();
    for (const row of rows) map.set(row.team, [...(map.get(row.team) ?? []), row]);
    return map;
  };

  const career = {
    key: "test",
    display: "Test Player",
    nationality: "England",
    notes: [],
    spells: [
      { team: "Arsenal", from: 1997, to: 1998, england: "top" as const },
      { team: "Real Madrid", from: 1999, to: 1999 },
      { team: "Arsenal", from: 2005, to: 2006, england: "top" as const },
    ],
  };

  test("a club appears once however many times he went back", () => {
    const covered = coverFor(
      career,
      byTeam([shirt("Arsenal", "1997-98"), shirt("Arsenal", "2005-06"), shirt("Real Madrid", "1999-00")]),
    );
    assert.deepEqual(covered.map((c) => c.team), ["Arsenal", "Real Madrid"]);
  });

  /**
   * A spell we cannot cover must not block a later spell at the same club -
   * that would silently lose a club we do hold a shirt for.
   */
  test("a missed first spell does not rule out the second", () => {
    const covered = coverFor(career, byTeam([shirt("Arsenal", "2005-06")]));
    assert.deepEqual(covered.map((c) => c.season), ["2005-06"]);
  });

  test("comes back in career order", () => {
    const covered = coverFor(
      career,
      byTeam([shirt("Real Madrid", "1999-00"), shirt("Arsenal", "1997-98")]),
    );
    assert.deepEqual(covered.map((c) => c.team), ["Arsenal", "Real Madrid"]);
  });
});

describe("choosing the six", () => {
  const club = (team: string, country: string, from: number, england = false) => ({
    team,
    country,
    season: `${from}-${String((from + 1) % 100).padStart(2, "0")}`,
    shirtType: "Home",
    from,
    to: from,
    england,
    loan: false,
    productId: team,
    slug: null,
    imageUrl: "https://example/x.jpg",
  });

  /**
   * A career across many countries is a far better puzzle than one across six
   * English clubs. Seven clubs covering five countries must come back as five
   * countries - not as the first six in career order, which would be three
   * English clubs and only three of the five.
   */
  test("prefers a country not already on the card", () => {
    const six = pickSix([
      club("Arsenal", "England", 1997, true),
      club("Chelsea", "England", 1999, true),
      club("Everton", "England", 2000, true),
      club("Real Madrid", "Spain", 2001),
      club("AC Milan", "Italy", 2003),
      club("Ajax", "Netherlands", 2005),
      club("Monaco", "France", 2007),
    ]);
    assert.equal(six.length, 6);
    assert.equal(new Set(six.map((c) => c.country)).size, 5, "every country available is on the card");
    assert.equal(six.filter((c) => c.country === "England").length, 2, "England does not crowd it out");
  });

  /**
   * The audience is English. A grid with nothing they recognise is not a
   * puzzle, it is a shrug - so one English club is forced in.
   */
  test("always keeps an English club when there is one", () => {
    const six = pickSix([
      club("Ajax", "Netherlands", 1991),
      club("AC Milan", "Italy", 1996),
      club("Real Madrid", "Spain", 1998),
      club("Monaco", "France", 2000),
      club("Besiktas", "Turkey", 2002),
      club("Celtic", "Scotland", 2004),
      club("Everton", "England", 2006, true),
    ]);
    assert.ok(six.some((c) => c.england), "an English club must survive the cut");
    assert.equal(six.length, 6);
  });

  test("comes back in career order whatever order it chose in", () => {
    const six = pickSix([
      club("Ajax", "Netherlands", 1991),
      club("AC Milan", "Italy", 1996),
      club("Everton", "England", 2006, true),
    ]);
    assert.deepEqual(six.map((c) => c.from), [1991, 1996, 2006]);
  });

  test("fewer than six comes back whole rather than padded", () => {
    const six = pickSix([club("Ajax", "Netherlands", 1991)]);
    assert.equal(six.length, 1);
  });
});

describe("the careers on file", () => {
  test("every club has a country, or the card cannot count them", () => {
    const missing = CAREERS.flatMap((c) => c.spells.map((s) => s.team)).filter(
      (team) => !CLUB_COUNTRY[team],
    );
    assert.deepEqual([...new Set(missing)], []);
  });

  /** A short loan is a cruel clue and reads as a mistake on the grid. */
  test("a loan counts only at twenty games", () => {
    assert.equal(spellCounts({ team: "x", from: 2000, to: 2000, loan: true, apps: MIN_LOAN_APPS }), true);
    assert.equal(spellCounts({ team: "x", from: 2000, to: 2000, loan: true, apps: 4 }), false);
    assert.equal(spellCounts({ team: "x", from: 2000, to: 2000, loan: true }), false);
    assert.equal(spellCounts({ team: "x", from: 2000, to: 2000 }), true, "a permanent spell always counts");
  });

  test("every loan on file records the appearances that earned it", () => {
    for (const career of CAREERS) {
      for (const spell of career.spells) {
        if (!spell.loan) continue;
        assert.ok(
          typeof spell.apps === "number",
          `${career.display}'s ${spell.team} loan has no appearance count`,
        );
      }
    }
  });

  test("every career has an English club at Championship level or better", () => {
    for (const career of CAREERS) {
      assert.ok(
        career.spells.some((s) => s.england !== undefined),
        `${career.display} has no qualifying English club`,
      );
    }
  });

  test("spells run forwards, and keys are unique", () => {
    const keys = new Set<string>();
    for (const career of CAREERS) {
      assert.equal(keys.has(career.key), false, `duplicate key ${career.key}`);
      keys.add(career.key);
      for (const spell of career.spells) {
        assert.ok(spell.to >= spell.from, `${career.display} at ${spell.team} ends before it starts`);
        assert.ok(spell.from > 1960 && spell.to < 2030, `${career.display} at ${spell.team} is out of range`);
      }
    }
  });
});

describe("the reveal", () => {
  const club = (team: string, country: string) => ({
    team,
    country,
    season: "2000-01",
    shirtType: "Home",
    from: 2000,
    to: 2000,
    england: country === "England",
    loan: false,
    productId: team,
    slug: null,
    imageUrl: "x",
  });

  /**
   * The only text in the whole post allowed to contain the name. Built in code
   * rather than written by the model, which is the simplest way to be sure the
   * model never writes it anywhere else.
   */
  test("names him, lists the clubs, and counts the countries", () => {
    const text = revealText(CAREERS[0], [
      club("Arsenal", "England"),
      club("Real Madrid", "Spain"),
      club("AC Milan", "Italy"),
    ]);
    assert.match(text, new RegExp(CAREERS[0].display));
    assert.match(text, /Arsenal, Real Madrid and AC Milan/);
    assert.match(text, /3 clubs, 3 countries/);
    assert.match(text, /kickio\.com/);
  });
});
