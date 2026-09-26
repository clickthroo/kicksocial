import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  bestShirtFor,
  isMatchShirt,
  teammateNote,
  coverFor,
  pickSix,
  revealText,
  seasonStart,
  shirtFitsSpell,
  teamsFor,
  type ShirtRow,
} from "./who-am-i.ts";
import { CAREERS, CLUB_COUNTRY, MIN_LOAN_APPS, spellCounts, type Career } from "./careers.ts";

const shirt = (team: string, season: string, type = "Home", player: string | null = null): ShirtRow => ({
  id: `${team}-${season}${player ? `-${player}` : ""}`,
  slug: null,
  team,
  season,
  shirt_type: type,
  player_name: player,
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
    international: false,
    playerName: null,
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
    international: false,
    playerName: null,
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

describe("the one national-side tile", () => {
  const byTeam = (rows: ShirtRow[]) => {
    const map = new Map<string, ShirtRow[]>();
    for (const row of rows) map.set(row.team, [...(map.get(row.team) ?? []), row]);
    return map;
  };

  const career = {
    key: "test",
    display: "Test Player",
    nationality: "France",
    international: { team: "France", from: 1998, to: 2009 },
    notes: [],
    spells: [
      { team: "Arsenal", from: 1997, to: 1998, england: "top" as const },
      { team: "Chelsea", from: 2000, to: 2001, england: "top" as const },
    ],
  };

  const shirts = [
    shirt("Arsenal", "1997-98"),
    shirt("Chelsea", "2000-01"),
    shirt("France", "2002-03"),
  ];

  /**
   * Six era-correct CLUB shirts is a high bar against this shelf - most
   * careers cover five and stop. A national shirt is still a shirt he wore,
   * and it fills the last tile rather than replacing a club.
   */
  test("appears when the clubs cannot reach six", () => {
    const covered = coverFor(career, byTeam(shirts));
    assert.equal(covered.filter((c) => c.international).length, 1);
    // Last, not slotted in by date: it is the thread through the career rather
    // than a chapter between two clubs.
    assert.deepEqual(covered.map((c) => c.team), ["Arsenal", "Chelsea", "France"]);
  });

  /** A hint makes a puzzle answerable; two hints make it a caption. */
  test("never more than one, however short of six we are", () => {
    const covered = coverFor(career, byTeam([...shirts, shirt("France", "2006-07")]));
    assert.equal(covered.filter((c) => c.international).length, 1);
  });

  test("stays away entirely once six clubs are covered", () => {
    const wide = {
      ...career,
      spells: [
        { team: "Arsenal", from: 1997, to: 1998, england: "top" as const },
        { team: "Chelsea", from: 2000, to: 2001, england: "top" as const },
        { team: "Everton", from: 2002, to: 2003, england: "top" as const },
        { team: "Ajax", from: 2004, to: 2005 },
        { team: "AC Milan", from: 2006, to: 2007 },
        { team: "Roma", from: 2008, to: 2009 },
      ],
    };
    const covered = coverFor(
      wide,
      byTeam([
        shirt("Arsenal", "1997-98"),
        shirt("Chelsea", "2000-01"),
        shirt("Everton", "2002-03"),
        shirt("Ajax", "2004-05"),
        shirt("AC Milan", "2006-07"),
        shirt("Roma", "2008-09"),
        shirt("France", "2002-03"),
      ]),
    );
    assert.equal(covered.some((c) => c.international), false);
    assert.equal(covered.length, 6);
  });

  /** A national side is not an English club, whatever England's shirt says. */
  test("an England shirt does not satisfy the English-club rule", () => {
    const englishman = {
      ...career,
      international: { team: "England", from: 1998, to: 2009 },
      spells: [{ team: "Ajax", from: 1997, to: 1998 }],
    };
    const covered = coverFor(englishman, byTeam([shirt("Ajax", "1997-98"), shirt("England", "2002-03")]));
    assert.equal(covered.some((c) => c.england && !c.international), false);
  });

  test("a player with no international career simply falls short", () => {
    const uncapped = { ...career, international: undefined };
    const covered = coverFor(uncapped, byTeam(shirts));
    assert.equal(covered.length, 2);
  });
});

describe("what may appear on the grid", () => {
  const spell = { team: "Chelsea", from: 2003, to: 2003 };

  /**
   * A training top or a pair of socks in a row of match shirts does not read as
   * a clue, it reads as a mistake - and `shirt_type` carries both.
   */
  test("only home, away and third are match shirts", () => {
    for (const kind of ["Home", "Away", "Third", "home", " away "]) {
      assert.equal(isMatchShirt(kind), true, `${kind} should be allowed`);
    }
    for (const kind of [
      "Training",
      "Goalkeeper",
      "GK Home",
      "GK Away",
      "Fourth",
      "Pre-Match",
      "Track Jacket",
      "Jacket",
      "Cap",
      "Socks",
      "long sleeve",
      null,
      "",
    ]) {
      assert.equal(isMatchShirt(kind), false, `${kind} should be refused`);
    }
  });

  test("a goalkeeper shirt is never chosen, even when it is the only one", () => {
    assert.equal(bestShirtFor([shirt("Chelsea", "2003-04", "GK Home")], spell), null);
    assert.equal(bestShirtFor([shirt("Chelsea", "2003-04", "Training")], spell), null);
  });

  /**
   * A plain club shirt is the purer puzzle. A named one is not wrong - it is a
   * teammate, and the card says so - but it hands over a clue a blank shirt
   * does not, so it is the second choice.
   */
  test("prefers an unnamed shirt over a named one", () => {
    const picked = bestShirtFor(
      [shirt("Chelsea", "2003-04", "Home", "Lampard 8"), shirt("Chelsea", "2003-04", "Away")],
      spell,
    );
    assert.equal(picked?.player_name, null);
  });

  test("takes the named one when that is all there is", () => {
    const picked = bestShirtFor([shirt("Chelsea", "2003-04", "Home", "Lampard 8")], spell);
    assert.equal(picked?.player_name, "Lampard 8");
  });
});

describe("saying whose name is on the shirt", () => {
  const club = (team: string, playerName: string | null) => ({
    team,
    country: "England",
    season: "2003-04",
    shirtType: "Home",
    playerName,
    from: 2003,
    to: 2003,
    england: true,
    loan: false,
    international: false,
    productId: team,
    slug: null,
    imageUrl: "x",
  });

  /**
   * The point of the line. A "Möller 10" shirt among blank ones otherwise reads
   * as the answer being handed over, or as a mistake. It is neither - and
   * saying so turns the oddity into the best clue on the card.
   */
  test("names the count and makes clear it is not him", () => {
    assert.equal(teammateNote([club("Chelsea", null)]), null);
    assert.match(teammateNote([club("Chelsea", "Lampard 8")])!, /One of these carries a teammate's name/);
    assert.match(teammateNote([club("Chelsea", "Lampard 8")])!, /not mine/);
    assert.match(
      teammateNote([club("Chelsea", "Lampard 8"), club("Arsenal", "Henry 14")])!,
      /Two of these carry a teammate's name/,
    );
    assert.match(
      teammateNote([club("Chelsea", "Lampard 8"), club("Arsenal", "Henry 14")])!,
      /none of them mine/,
    );
  });
});

test("teamsFor includes the national side, which is where the sixth shirt comes from", () => {
  const career: Career = {
    key: "x", display: "X", nationality: "Denmark",
    international: { team: "Denmark", from: 1987, to: 1998 },
    spells: [
      { team: "Bayern Munich", from: 1989, to: 1991 },
      { team: "Fiorentina", from: 1992, to: 1993, england: undefined },
    ],
    notes: [],
  };
  // The bug this pins: building the list from `spells` alone never fetches
  // Denmark, so the national lever cannot fire and the career stops at five.
  assert.deepEqual(teamsFor(career), ["Bayern Munich", "Fiorentina", "Denmark"]);
});

test("teamsFor is just the clubs when there is no national side on file", () => {
  const career: Career = {
    key: "y", display: "Y", nationality: "England",
    spells: [{ team: "Arsenal", from: 1996, to: 1999, england: "top" }],
    notes: [],
  };
  assert.deepEqual(teamsFor(career), ["Arsenal"]);
});

test("every national side a career names is a team the loader will ask for", () => {
  for (const career of CAREERS) {
    if (!career.international) continue;
    assert.ok(
      teamsFor(career).includes(career.international.team),
      `${career.display}: ${career.international.team} would never be fetched`,
    );
  }
});
