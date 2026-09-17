import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyHistory, comboKey, type SelectionHistory } from "./history.ts";

const empty = (): SelectionHistory => ({
  subjects: new Set(),
  combos: new Set(),
  teams: new Set(),
});

const candidate = (
  subjectRef: string,
  team: string | null = "Arsenal",
  season: string | null = "1996-97",
  shirtType: string | null = "Home",
) => ({ subjectRef, team, season, shirtType });

describe("repeat prevention", () => {
  test("removes a subject that has been featured", () => {
    const history = empty();
    history.subjects.add("arsenal-1996-97-home");

    const { eligible, blockedAsRepeat } = applyHistory(
      [candidate("arsenal-1996-97-home"), candidate("chelsea-2020-21-home", "Chelsea", "2020-21")],
      history,
    );

    assert.deepEqual(eligible.map((c) => c.subjectRef), ["chelsea-2020-21-home"]);
    assert.equal(blockedAsRepeat, 1);
  });

  test("keys on the product, so a second listing of the same shirt is blocked", () => {
    // 52 products in the pool carry more than one listing. Keyed on the listing
    // id, the same shirt returns the next day under a different id.
    const history = empty();
    history.subjects.add("1996-98-arsenal-authentic-player-version-l-s-home-shirt");

    const { eligible } = applyHistory(
      [candidate("1996-98-arsenal-authentic-player-version-l-s-home-shirt")],
      history,
    );
    assert.deepEqual(eligible, []);
  });

  test("reports when everything is a repeat rather than posting one", () => {
    const history = empty();
    history.subjects.add("a");
    const { eligible, blockedAsRepeat } = applyHistory([candidate("a")], history);
    assert.equal(eligible.length, 0);
    assert.equal(blockedAsRepeat, 1);
  });
});

describe("variety preferences", () => {
  test("prefers a different shirt over the same team+season+type", () => {
    const history = empty();
    history.combos.add(comboKey("Chelsea", "2020-21", "Home")!);

    // Chelsea 2020-21 Home spans four distinct products - without this they
    // read as the same shirt posted repeatedly.
    const { eligible } = applyHistory(
      [
        candidate("chelsea-2020-21-home-b", "Chelsea", "2020-21", "Home"),
        candidate("arsenal-1996-97-home", "Arsenal", "1996-97", "Home"),
      ],
      history,
    );

    assert.equal(eligible[0].subjectRef, "arsenal-1996-97-home");
  });

  test("prefers a different club over a recently featured one", () => {
    const history = empty();
    history.teams.add("arsenal");

    const { eligible } = applyHistory(
      [
        candidate("arsenal-1998-99-away", "Arsenal", "1998-99", "Away"),
        candidate("napoli-1988-89-home", "Napoli", "1988-89", "Home"),
      ],
      history,
    );

    assert.equal(eligible[0].subjectRef, "napoli-1988-89-home");
  });

  test("ranks same-club above same-shirt when both are unavoidable", () => {
    const history = empty();
    history.teams.add("arsenal");
    history.combos.add(comboKey("Chelsea", "2020-21", "Home")!);

    const { eligible } = applyHistory(
      [
        candidate("chelsea-2020-21-home-c", "Chelsea", "2020-21", "Home"),
        candidate("arsenal-1998-99-away", "Arsenal", "1998-99", "Away"),
      ],
      history,
    );

    // Same club, different shirt beats effectively the same shirt again.
    assert.equal(eligible[0].subjectRef, "arsenal-1998-99-away");
  });

  test("variety never blocks a post - it only reorders", () => {
    // A thin day should still produce something rather than nothing.
    const history = empty();
    history.teams.add("arsenal");
    history.combos.add(comboKey("Arsenal", "1996-97", "Home")!);

    const { eligible } = applyHistory([candidate("arsenal-1996-97-home")], history);
    assert.equal(eligible.length, 1);
  });

  test("preserves score order within a tier", () => {
    const { eligible } = applyHistory(
      [candidate("first"), candidate("second"), candidate("third")],
      empty(),
    );
    assert.deepEqual(eligible.map((c) => c.subjectRef), ["first", "second", "third"]);
  });
});

describe("combo keys", () => {
  test("is case-insensitive and ignores shirt-type gaps", () => {
    assert.equal(comboKey("Arsenal", "1996-97", "Home"), comboKey("arsenal", "1996-97", "home"));
    assert.equal(comboKey("Arsenal", "1996-97", null), "arsenal|1996-97|");
  });

  test("is null when team or season is missing, so nothing is over-blocked", () => {
    assert.equal(comboKey(null, "1996-97", "Home"), null);
    assert.equal(comboKey("Arsenal", null, "Home"), null);
  });
});
