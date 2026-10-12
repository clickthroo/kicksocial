import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HERITAGE_CONFIG,
  HERITAGE_BRIEF,
  HERITAGE_KEY,
  isLive,
  seasonYear,
} from "./club-heritage.ts";
import { freshness, hasExpired, perishKind } from "../engine/freshness.ts";
import { stripEmDashes } from "../copy/dashes.ts";
import { isPrivateField } from "../copy/private.ts";

/** A listing that passes every check, so each test can break exactly one. */
const live = {
  product_id: "p1",
  price_cents: 12_900,
  currency: "GBP",
  size: "L",
  condition: "Very good",
  status: "active",
  deleted_at: null,
  removed_at: null,
  stock_quantity: 1,
  consecutive_gone_count: 0,
};

describe("reading the year off a season", () => {
  test("the ordinary forms all work", () => {
    assert.equal(seasonYear("1981-82"), 1981);
    assert.equal(seasonYear("1999-2000"), 1999);
    assert.equal(seasonYear("2014"), 2014);
    // Whitespace is normal in this column, and it is read, not matched.
    assert.equal(seasonYear(" 1986-87 "), 1986);
  });

  test("anything unreadable is null rather than a guess", () => {
    // `products.season_end_year` is null on every active row, so the year has
    // to come off the text. A shirt whose text says nothing is left out of the
    // post rather than dated by inference.
    assert.equal(seasonYear(null), null);
    assert.equal(seasonYear(undefined), null);
    assert.equal(seasonYear(""), null);
    assert.equal(seasonYear("Retro"), null);
    assert.equal(seasonYear("90s"), null);
    // Not a season, a date: a leading year is required, not a year anywhere.
    assert.equal(seasonYear("Early 1980s"), null);
  });

  test("an impossible year is refused, so it cannot lead the card", () => {
    // The six are ordered oldest first, so one bad year does not just add a
    // wrong tile - it takes the first one and sets the era the post opens on.
    assert.equal(seasonYear("0001-02"), null);
    assert.equal(seasonYear("1899-00"), null);
    assert.equal(seasonYear("2101-02"), null);
  });
});

describe("could a reader actually buy it", () => {
  test("the clean case passes", () => {
    assert.equal(isLive(live), true);
  });

  test("deleted, withdrawn or out of stock all fail", () => {
    assert.equal(isLive({ ...live, deleted_at: "2026-10-05T12:00:00Z" }), false);
    assert.equal(isLive({ ...live, removed_at: "2026-10-05T12:00:00Z" }), false);
    assert.equal(isLive({ ...live, stock_quantity: 0 }), false);
    assert.equal(isLive({ ...live, stock_quantity: null }), false);
  });

  test("a listing the stock checker could not find is refused", () => {
    assert.equal(isLive({ ...live, consecutive_gone_count: 1 }), false);
  });

  test("status is an allowlist, not a blocklist", () => {
    assert.equal(isLive({ ...live, status: "sold" }), false);
    assert.equal(isLive({ ...live, status: "draft" }), false);
    assert.equal(isLive({ ...live, status: null }), false);
    assert.equal(isLive({ ...live, status: "whatever-comes-next" }), false);
    assert.equal(isLive({ ...live, status: " Active " }), true);
  });

  test("no price is refused, because the card prints one", () => {
    assert.equal(isLive({ ...live, price_cents: 0 }), false);
    assert.equal(isLive({ ...live, price_cents: null }), false);
  });
});

describe("the shape of the post", () => {
  test("six, because the card is a 3x2 grid", () => {
    assert.equal(DEFAULT_HERITAGE_CONFIG.featureCount, 6);
  });

  test("a club waits a long time before coming round again", () => {
    // The six are the earlier end of what the club has, so they barely move
    // inside a short window: the same club again in a month would be very
    // nearly the same post.
    assert.ok(DEFAULT_HERITAGE_CONFIG.cooldownDays >= 90);
  });
});

describe("how it ages", () => {
  test("it perishes like a listing, not like a roundup", () => {
    // The shirts are forty years old. The prices beside them are today's, read
    // off live listings, and one selling makes a tile wrong.
    assert.equal(perishKind(HERITAGE_KEY), "listing");
  });

  test("a day-old draft asks to be checked before it goes out", () => {
    const made = new Date("2026-10-06T07:00:00Z").toISOString();
    const state = freshness(made, HERITAGE_KEY, Date.parse("2026-10-07T09:00:00Z"));
    assert.equal(state.state, "ageing");
    assert.match(state.note ?? "", /may have sold/i);
  });

  test("it clears itself out rather than going out a week late", () => {
    const made = new Date("2026-10-01T07:00:00Z").toISOString();
    assert.equal(hasExpired(made, HERITAGE_KEY, Date.parse("2026-10-08T12:00:00Z")), true);
  });
});

describe("the one thing the post must never say", () => {
  test("the brief forbids calling them the oldest, in any wording", () => {
    // This is the whole risk in the post. The six are chosen oldest first, and
    // "the six oldest Liverpool shirts we have" is a claim about the entire
    // catalogue: wrong the moment an older one is listed, wrong if one of
    // these sells, and wrong already if an older shirt carries a season string
    // nothing can read.
    assert.match(HERITAGE_BRIEF, /MUST NOT WRITE/);
    assert.match(HERITAGE_BRIEF, /the six oldest/i);
    assert.match(HERITAGE_BRIEF, /forbidden/i);
    assert.match(HERITAGE_BRIEF, /claim about the whole\s+catalogue/i);
  });

  test("it forbids the other superlatives too", () => {
    // "The rarest", "the pick of the collection" and "our most vintage" are
    // the same overclaim wearing a different word.
    assert.match(HERITAGE_BRIEF, /rarest/i);
    assert.match(HERITAGE_BRIEF, /most vintage/i);
    assert.match(HERITAGE_BRIEF, /Claiming a superlative is not/i);
  });

  test("it says what to write instead", () => {
    // A ban with no replacement is how a brief produces a post that avoids the
    // forbidden sentence by having nothing to say.
    assert.match(HERITAGE_BRIEF, /heritage\s+collection/i);
    assert.match(HERITAGE_BRIEF, /available now/i);
  });

  test("it refuses invented history", () => {
    // A collector reading a Kickio post knows this ground better than almost
    // anyone, and one wrong score costs more than a dull post.
    assert.match(HERITAGE_BRIEF, /Never invent a match, a\s+score, a transfer or a date/i);
  });

  test("the price must be the buyer's price", () => {
    assert.match(HERITAGE_BRIEF, /what a buyer pays/);
  });

  test("it sends people to the shirts", () => {
    assert.match(HERITAGE_BRIEF, /top_url/);
    assert.match(HERITAGE_BRIEF, /kickio_url/);
    assert.match(HERITAGE_BRIEF, /kickio\.com/);
  });

  test("it has no em dashes", () => {
    assert.equal(stripEmDashes(HERITAGE_BRIEF), HERITAGE_BRIEF);
  });
});

describe("Kickio's own figures stay out of it", () => {
  test("the keys the recipe hands over are not private ones", () => {
    // The post is about six shirts, so every figure in it belongs to one of
    // them. How many heritage shirts the club has on Kickio is a fact about
    // the business, and the recipe never passes it: `heritageClubs` counts for
    // the picker on screen, which is not a post.
    for (const key of ["team", "shirts", "span", "top_url", "card_title", "card_footer"]) {
      assert.equal(isPrivateField(key), false, key);
    }
  });

  test("the brief never asks for a count", () => {
    // Belt and braces with `private.ts`: the figure is not in the data, and
    // the brief does not invite the model to invent one.
    assert.ok(!/how many shirts/i.test(HERITAGE_BRIEF), HERITAGE_BRIEF.slice(0, 80));
  });
});
