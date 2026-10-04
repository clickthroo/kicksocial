import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ERA_YEARS,
  MAX_PLAYERS,
  careerPlayers,
  gettySearchUrl,
  imageSearchUrl,
  mergePlayers,
  photoTerms,
  printedName,
  surnameKey,
} from "./era-players.ts";

describe("careers matched to a club and a season", () => {
  test("a spell that covers the season counts", () => {
    // Gascoigne was at Tottenham 1988-1991, so a 1989-90 shirt is his era.
    assert.ok(careerPlayers("Tottenham Hotspur", "1989-90").includes("Paul Gascoigne"));
  });

  test("a season outside the spell does not", () => {
    // The rule the whole feature rests on. Relax it and the picker starts
    // sending someone to look for a photograph that cannot exist.
    assert.ok(!careerPlayers("Tottenham Hotspur", "1996-97").includes("Paul Gascoigne"));
  });

  test("national sides count, because the catalogue holds them as teams", () => {
    // 15 of the dearest pre-2000 shirts in stock are England shirts, and an
    // international career lives outside `spells` - the omission that once cost
    // Who Am I eleven careers.
    assert.ok(careerPlayers("England", "1996-97").length > 0);
  });

  test("an unreadable season yields nothing rather than everything", () => {
    assert.deepEqual(careerPlayers("Liverpool", null), []);
    assert.deepEqual(careerPlayers("Liverpool", "retro"), []);
  });

  test("a club nobody on file played for yields nothing", () => {
    assert.deepEqual(careerPlayers("Wycombe Wanderers", "1990-91"), []);
  });
});

describe("reading a name off the printing on a shirt", () => {
  test("a plain surname passes", () => {
    assert.equal(printedName("Cantona", "Manchester United"), "Cantona");
  });

  test("a squad number is stripped, however it is written", () => {
    assert.equal(printedName("Beckham #7", "Manchester United"), "Beckham");
    assert.equal(printedName("Beckham 7", "Manchester United"), "Beckham");
  });

  test("the club typed in front of the name is stripped", () => {
    // Live in the catalogue: "Manchester United Cantona".
    assert.equal(printedName("Manchester United Cantona", "Manchester United"), "Cantona");
  });

  test("the club on its own is not a player", () => {
    // Live in the catalogue: a Yokohama F. Marinos shirt printed "Marinos".
    assert.equal(printedName("Marinos", "Yokohama F. Marinos"), null);
  });

  test("placeholders are refused", () => {
    for (const junk of ["Not Applicable", "Not Specified", "Unknown", "N/A", ",", ".", "  "]) {
      assert.equal(printedName(junk, "Liverpool"), null, junk);
    }
  });

  test("words describing the shirt are refused", () => {
    // These say something about the garment, not about a man who wore it, and
    // "Goalkeeper" in a list of players to search for reads as a mistake.
    for (const junk of ["Goalkeeper", "Player Issue", "Blank", "Away", "Squad"]) {
      assert.equal(printedName(junk, "Liverpool"), null, junk);
    }
  });

  test("a pasted title with entities in it is refused", () => {
    // `products.team` holds "&#x20;Parma&#x20;-&#x20;8&#x2F;10", so the same
    // paste reaches the name column. Decoding it would be guesswork.
    assert.equal(printedName("&#x20;Baggio&#x20;", "Juventus"), null);
  });

  test("accents and the punctuation inside a name survive", () => {
    assert.equal(printedName("Müller", "Bayern Munich"), "Müller");
    assert.equal(printedName("O'Neill", "Celtic"), "O'Neill");
    assert.equal(printedName("Le Tissier", "Southampton"), "Le Tissier");
  });

  test("a non-string is refused rather than coerced", () => {
    assert.equal(printedName(null, "Liverpool"), null);
    assert.equal(printedName(7, "Liverpool"), null);
  });
});

describe("collapsing two spellings of one player", () => {
  test("the surname is the key, unaccented", () => {
    assert.equal(surnameKey("Alan Shearer"), "shearer");
    assert.equal(surnameKey("Shearer"), "shearer");
    assert.equal(surnameKey("Jürgen Klinsmann"), "klinsmann");
  });

  test("a curated name wins over the printing, and appears once", () => {
    // The catalogue holds both "Shearer" and "Alan Shearer" for Newcastle 1995.
    // Showing both makes the list look like it does not know who he is.
    const merged = mergePlayers(
      ["Alan Shearer"],
      [
        { name: "Shearer", season: "1995-96" },
        { name: "Alan Shearer", season: "1996-97" },
      ],
      "1995-96",
    );
    assert.deepEqual(merged, [{ name: "Alan Shearer", source: "career" }]);
  });

  test("curated names come first, then the printing", () => {
    const merged = mergePlayers(
      ["Dennis Bergkamp"],
      [{ name: "Wright", season: "1993-94" }],
      "1993-94",
    );
    assert.deepEqual(merged.map((p) => p.source), ["career", "catalogue"]);
  });

  test("a printed name carries the season it was printed on", () => {
    // The admin has to be able to see that this is weaker evidence than a
    // dated career, and the season is what shows it.
    const merged = mergePlayers([], [{ name: "Batistuta", season: "1991-92" }], "1991-92");
    assert.deepEqual(merged, [
      { name: "Batistuta", source: "catalogue", season: "1991-92" },
    ]);
  });

  test("the nearest season is offered first", () => {
    const merged = mergePlayers(
      [],
      [
        { name: "Later", season: "1997-98" },
        { name: "Exact", season: "1995-96" },
      ],
      "1995-96",
    );
    assert.deepEqual(merged.map((p) => p.name), ["Exact", "Later"]);
  });

  test("the list is capped, because England 1996 is a phone book", () => {
    // Distinct surnames: the key is the last word with its digits stripped, so
    // "Player1" and "Player2" are one man as far as the list is concerned.
    const many = "abcdefghijklmnopqrstuvwxyz".split("").map((letter) => ({
      name: `Player${letter.toUpperCase()}${letter}son`,
      season: "1996-97",
    }));
    assert.equal(mergePlayers([], many, "1996-97").length, MAX_PLAYERS);
  });

  test("nothing known yields an empty list, not a row of blanks", () => {
    assert.deepEqual(mergePlayers([], [], "1991-92"), []);
  });

  test("the era window is two seasons either way", () => {
    // Stated here as well as in the module, because widening it is the easy
    // change that makes the list longer and wronger.
    assert.equal(ERA_YEARS, 2);
  });
});

describe("the search a name opens", () => {
  test("the player is quoted so the two words stay together", () => {
    const terms = photoTerms({
      player: "Alan Shearer",
      team: "Newcastle United",
      season: "1995-96",
      kit: "Home",
    });
    assert.equal(terms, '"Alan Shearer" Newcastle United 1995-96 home');
  });

  test("the word 'shirt' is never in it", () => {
    // Searching for a shirt returns shirts: product shots and resale listings.
    // What this post needs is a photograph of somebody playing.
    const terms = photoTerms({
      player: "Gabriel Batistuta",
      team: "Fiorentina",
      season: "1991-92",
      kit: "Away",
    });
    assert.ok(!/shirt|jersey/i.test(terms), terms);
  });

  test("it works with no player, for the kit on its own", () => {
    assert.equal(
      photoTerms({ team: "Crystal Palace", season: "1990-91", kit: "Home" }),
      "Crystal Palace 1990-91 home",
    );
  });

  test("missing parts are left out rather than printed as gaps", () => {
    assert.equal(photoTerms({ player: null, team: "Roma", season: null }), "Roma");
  });

  test("Google Images, and large ones", () => {
    // The card uses the photograph full-bleed at 1200px or more, so a
    // thumbnail is not a usable result.
    const url = imageSearchUrl('"Paul Gascoigne" Tottenham Hotspur 1989-90');
    assert.ok(url.startsWith("https://www.google.com/search?"));
    assert.ok(url.includes("tbm=isch"));
    assert.ok(url.includes("tbs=isz:l"));
    assert.ok(url.includes(encodeURIComponent('"Paul Gascoigne"')));
  });

  test("Getty searches the same thing without the quotation marks", () => {
    // Getty's own search narrows a quoted phrase to nothing on an archive this
    // old, so the quotes that help Google are dropped here.
    const url = gettySearchUrl('"Paul Gascoigne" Tottenham Hotspur 1989-90');
    assert.ok(url.startsWith("https://www.gettyimages.co.uk/"));
    assert.ok(!url.includes("%22"));
    assert.ok(url.includes("Gascoigne"));
  });

  test("both URLs encode their terms", () => {
    const terms = 'a&b "c" d';
    assert.ok(!imageSearchUrl(terms).includes("&b"));
    assert.ok(!gettySearchUrl(terms).includes("&b"));
  });
});
