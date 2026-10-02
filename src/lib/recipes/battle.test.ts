import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canFight, framing, shortName, type Fighter } from "./battle.ts";

function shirt(over: Partial<Fighter> = {}): Fighter {
  return {
    productId: "a",
    title: "1993-95 Aston Villa Away Shirt",
    team: "Aston Villa",
    season: "1993-95",
    kit: "Away",
    manufacturer: "Asics",
    imageUrl: "https://example.test/villa.jpg",
    price: null,
    buyable: false,
    ...over,
  };
}

describe("who is allowed in the ring", () => {
  test("a match shirt with a photograph can fight", () => {
    assert.equal(canFight(shirt()), true);
  });

  test("no photograph, no fight", () => {
    // This card IS the two photographs. One missing is a broken image beside a
    // shirt, not a contest, so it is refused rather than drawn empty.
    assert.equal(canFight(shirt({ imageUrl: null })), false);
  });

  test("a training top is not a match shirt", () => {
    // Same allowlist as everywhere else. A training top against a match shirt
    // is not a fair fight and reads as a mistake.
    assert.equal(canFight(shirt({ kit: "Training" })), false);
    assert.equal(canFight(shirt({ kit: "Goalkeeper" })), false);
    assert.equal(canFight(shirt({ kit: "Polo" })), false);
  });

  test("home, away and third all qualify", () => {
    for (const kit of ["Home", "Away", "Third"]) {
      assert.equal(canFight(shirt({ kit })), true, `${kit} should be allowed`);
    }
  });

  test("a missing kit is refused rather than let through", () => {
    assert.equal(canFight(shirt({ kit: "" })), false);
  });
});

describe("naming a side", () => {
  test("season, club and kit, which is what the card and the copy use", () => {
    assert.equal(shortName(shirt()), "1993-95 Aston Villa Away");
  });

  test("falls back to the product title when the parts are missing", () => {
    // Better a long catalogue name than an empty corner label.
    const bare = shirt({ team: null, season: null, kit: "", title: "Mystery Shirt" });
    assert.equal(shortName(bare), "Mystery Shirt");
  });

  test("uses whichever parts exist", () => {
    assert.equal(shortName(shirt({ season: null })), "Aston Villa Away");
  });
});

describe("the framing line, which may never pick a winner", () => {
  test("two shirts from the same club", () => {
    const a = shirt({ team: "Arsenal" });
    const b = shirt({ team: "Arsenal", productId: "b" });
    assert.match(framing(a, b) ?? "", /Two Arsenal shirts/);
  });

  test("two shirts from the same season", () => {
    const a = shirt({ team: "Arsenal", season: "1998-99" });
    const b = shirt({ team: "Chelsea", season: "1998-99", productId: "b" });
    assert.equal(framing(a, b), "Same season, different badge");
  });

  test("two of the same kit type", () => {
    const a = shirt({ team: "Arsenal", season: "1998-99", kit: "Away" });
    const b = shirt({ team: "Chelsea", season: "2001-02", kit: "Away", productId: "b" });
    assert.equal(framing(a, b), "Away shirt against Away shirt");
  });

  test("an unrelated pair gets no line rather than an invented one", () => {
    // The card falls back to a neutral prompt. Reaching for a connection that
    // is not there would put a claim on the card nobody checked.
    const a = shirt({ team: "Arsenal", season: "1998-99", kit: "Home" });
    const b = shirt({ team: "Ajax", season: "1989-90", kit: "Away", productId: "b" });
    assert.equal(framing(a, b), null);
  });

  test("it never names a favourite, whatever the pairing", () => {
    // The question is which is better. A card that answers it kills the post,
    // so no branch of this function may lean either way.
    const pairs: Array<[Fighter, Fighter]> = [
      [shirt({ team: "Arsenal" }), shirt({ team: "Arsenal", productId: "b" })],
      [shirt({ season: "1998-99" }), shirt({ team: "Ajax", season: "1998-99", productId: "b" })],
      [shirt({ kit: "Away" }), shirt({ team: "Ajax", season: "1989-90", kit: "Away", productId: "b" })],
    ];
    for (const [a, b] of pairs) {
      const line = (framing(a, b) ?? "").toLowerCase();
      for (const word of ["better", "best", "wins", "beats", "favourite", "classic", "worse"]) {
        assert.ok(!line.includes(word), `framing leaned on "${word}": ${line}`);
      }
    }
  });
});

describe("the subject key makes a rematch a duplicate", () => {
  test("the same two shirts in either order produce the same key", () => {
    // The key is the two ids sorted, so picking Villa then Ajax and Ajax then
    // Villa are the same post, and the duplicate guard catches the second.
    const key = (l: string, r: string) => [l, r].sort().join("|vs|");
    assert.equal(key("villa", "ajax"), key("ajax", "villa"));
  });

  test("a different opponent is a different post", () => {
    const key = (l: string, r: string) => [l, r].sort().join("|vs|");
    assert.notEqual(key("villa", "ajax"), key("villa", "arsenal"));
  });
});
