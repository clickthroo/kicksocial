import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CLASSIC_BEFORE_YEAR,
  MIN_PRICE_CENTS,
  isClassic,
  looksLikeImage,
  seasonStartYear,
} from "./classics.ts";

describe("reading the year off a season", () => {
  test("a normal season", () => {
    assert.equal(seasonStartYear("1993-94"), 1993);
  });

  test("a two-year kit", () => {
    assert.equal(seasonStartYear("1993-95"), 1993);
  });

  test("a single year", () => {
    assert.equal(seasonStartYear("1998"), 1998);
  });

  test("whitespace does not defeat it", () => {
    assert.equal(seasonStartYear("  1986-88 "), 1986);
  });

  test("nothing usable yields null rather than a guess", () => {
    // `products.season_end_year` is null on every active row, which is why the
    // year is read off the text at all. A row whose text is unparseable must
    // drop out rather than be treated as ancient.
    assert.equal(seasonStartYear(null), null);
    assert.equal(seasonStartYear(""), null);
    assert.equal(seasonStartYear("unknown"), null);
    assert.equal(seasonStartYear("90s"), null);
  });
});

describe("what counts as a classic", () => {
  test("the eighties and nineties do", () => {
    assert.equal(isClassic("1986-88"), true);
    assert.equal(isClassic("1999-00"), true);
  });

  test("2000 itself does not, because the line is before 2000", () => {
    // Off by one here would put a 2000-01 shirt in a post called Classics.
    assert.equal(isClassic("2000-01"), false);
    assert.equal(CLASSIC_BEFORE_YEAR, 2000);
  });

  test("modern shirts do not", () => {
    assert.equal(isClassic("2015-16"), false);
  });

  test("an unreadable season is refused rather than let through", () => {
    assert.equal(isClassic(null), false);
    assert.equal(isClassic("retro"), false);
  });
});

describe("the photograph has to be an image, not a page about one", () => {
  test("the usual formats pass", () => {
    for (const url of [
      "https://example.test/a.jpg",
      "https://example.test/a.jpeg",
      "https://example.test/a.png",
      "https://example.test/a.webp",
      "https://example.test/a.avif",
    ]) {
      assert.equal(looksLikeImage(url), true, url);
    }
  });

  test("a query string after the extension is fine", () => {
    // Signed URLs from an image host carry one, and refusing them would refuse
    // most licensed sources.
    assert.equal(looksLikeImage("https://example.test/a.jpg?token=abc&w=1200"), true);
  });

  test("a link to the page the image sits on is refused", () => {
    // The commonest mistake by far, and the one worth catching before a copy
    // generation is paid for.
    assert.equal(looksLikeImage("https://example.test/gallery/famous-goal"), false);
    assert.equal(looksLikeImage("https://example.test/photo.html"), false);
  });

  test("http is refused, not just non-images", () => {
    // The card is fetched server side and the asset ends up on social; an
    // insecure URL is both a mixed-content problem and a sign of a copy-paste
    // from somewhere it should not have come from.
    assert.equal(looksLikeImage("http://example.test/a.jpg"), false);
  });

  test("empty is refused", () => {
    assert.equal(looksLikeImage(""), false);
  });
});

describe("the price floor", () => {
  test("is high enough that a cheap shirt cannot be called a classic", () => {
    // 376 pre-2000 shirts are in stock and 252 clear this, measured
    // 2026-10-03. Low enough to have a shelf, high enough to mean something.
    assert.ok(MIN_PRICE_CENTS >= 10_000);
  });
});
