import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DROPZONE_CONFIG,
  DROPZONE_BRIEF,
  DROPZONE_KEY,
  isLive,
  onePerProduct,
  moreLine,
} from "./dropzone.ts";
import { freshness, hasExpired, perishKind } from "../engine/freshness.ts";
import { stripEmDashes } from "../copy/dashes.ts";

/** A listing that passes every check, so each test can break exactly one. */
const live = {
  id: "l1",
  product_id: "p1",
  created_at: "2026-10-05T10:00:00Z",
  title: "A shirt",
  size: "L",
  condition: "Mint",
  price_cents: 8900,
  currency: "GBP",
  images: [],
  status: "active",
  deleted_at: null,
  removed_at: null,
  stock_quantity: 1,
  consecutive_gone_count: 0,
};

describe("could a reader actually buy it", () => {
  test("the clean case passes", () => {
    assert.equal(isLive(live), true);
  });

  test("deleted, withdrawn or out of stock all fail", () => {
    // Each of these is a way a listing looks live in the database and is gone
    // in practice. The post is a promotion, so sending somebody to a dead page
    // is worse than not posting.
    assert.equal(isLive({ ...live, deleted_at: "2026-10-05T12:00:00Z" }), false);
    assert.equal(isLive({ ...live, removed_at: "2026-10-05T12:00:00Z" }), false);
    assert.equal(isLive({ ...live, stock_quantity: 0 }), false);
    assert.equal(isLive({ ...live, stock_quantity: null }), false);
  });

  test("a listing the stock checker could not find is refused", () => {
    assert.equal(isLive({ ...live, consecutive_gone_count: 1 }), false);
  });

  test("status is an allowlist, not a blocklist", () => {
    // The next odd value somebody adds to that column should be refused by
    // default rather than promoted by default.
    assert.equal(isLive({ ...live, status: "sold" }), false);
    assert.equal(isLive({ ...live, status: "pending" }), false);
    assert.equal(isLive({ ...live, status: "draft" }), false);
    assert.equal(isLive({ ...live, status: null }), false);
    assert.equal(isLive({ ...live, status: "whatever-comes-next" }), false);
  });

  test("case and whitespace on status do not defeat it", () => {
    assert.equal(isLive({ ...live, status: " Active " }), true);
  });

  test("no price and no product are both refused", () => {
    assert.equal(isLive({ ...live, price_cents: 0 }), false);
    assert.equal(isLive({ ...live, price_cents: null }), false);
    // No product means no page to link to, and this post is a link.
    assert.equal(isLive({ ...live, product_id: null }), false);
  });
});

describe("one tile per shirt", () => {
  test("a seller listing three of the same shirt takes one tile", () => {
    // Normal behaviour for a seller with stock, and without this it reads as a
    // rendering fault: the same shirt three times at three prices.
    const kept = onePerProduct([
      { product_id: "p1", id: "a" },
      { product_id: "p1", id: "b" },
      { product_id: "p2", id: "c" },
    ]);
    assert.deepEqual(kept.map((l) => l.id), ["a", "c"]);
  });

  test("the first kept is the dearest, because the input is price-ordered", () => {
    const kept = onePerProduct([
      { product_id: "p1", id: "dear" },
      { product_id: "p1", id: "cheap" },
    ]);
    assert.equal(kept[0]!.id, "dear");
  });

  test("a listing with no product is dropped rather than grouped under null", () => {
    const kept = onePerProduct([
      { product_id: null, id: "orphan" },
      { product_id: "p1", id: "fine" },
    ]);
    assert.deepEqual(kept.map((l) => l.id), ["fine"]);
  });

  test("an empty day yields an empty list", () => {
    assert.deepEqual(onePerProduct([]), []);
  });
});

describe("the shape of the post", () => {
  test("six, because the card is a 3x2 grid", () => {
    assert.equal(DEFAULT_DROPZONE_CONFIG.featureCount, 6);
  });

  test("the window is twenty-four hours and does not reach further", () => {
    // It used to widen when a day was thin, which kept the grid full and paid
    // for it in honesty: a post headed "just landed" could be showing a shirt
    // listed a week and a half earlier.
    assert.equal(DEFAULT_DROPZONE_CONFIG.windowDays, 1);
    assert.ok(!("maxWindowDays" in DEFAULT_DROPZONE_CONFIG));
  });

  test("three is enough for a snapshot, six is the most it shows", () => {
    // A snapshot of four is still a snapshot. Insisting on six is how a
    // 24-hour window ends up posting twice a fortnight: measured over the 14
    // days to 2026-10-05, new live photographed listings per day ran 4, 2, 2,
    // 70, 9, 0, 1, 1 and six days had none at all.
    assert.equal(DEFAULT_DROPZONE_CONFIG.minFeatured, 3);
    assert.equal(DEFAULT_DROPZONE_CONFIG.featureCount, 6);
    assert.ok(DEFAULT_DROPZONE_CONFIG.minFeatured < DEFAULT_DROPZONE_CONFIG.featureCount);
  });

  test("the price floor is low enough not to be what empties the grid", () => {
    // The post is "the dearest six that arrived". On a quiet day the sixth will
    // not be dear, and a floor that refuses it costs the whole post.
    assert.ok(DEFAULT_DROPZONE_CONFIG.minPriceCents <= 2_500);
  });
});

describe("how it ages", () => {
  test("it is classified as a day, not a listing", () => {
    // Both halves perish inside a day: the card names a date, and every shirt
    // on it is a live listing that can sell.
    assert.equal(perishKind(DROPZONE_KEY), "day");
  });

  test("by tomorrow it is wrong, not merely late", () => {
    const made = new Date("2026-10-06T07:00:00Z").toISOString();
    const state = freshness(made, DROPZONE_KEY, Date.parse("2026-10-07T09:00:00Z"));
    assert.equal(state.state, "stale");
  });

  test("it clears itself out inside two days", () => {
    const made = new Date("2026-10-06T07:00:00Z").toISOString();
    assert.equal(hasExpired(made, DROPZONE_KEY, Date.parse("2026-10-08T12:00:00Z")), true);
  });
});

describe("the brief", () => {
  test("it may say these are Kickio's own, unlike the sales post", () => {
    // The whole difference between the two posts. `listings` is Kickio's own
    // table, so "new on Kickio" is simply true here.
    assert.match(DROPZONE_BRIEF, /these are Kickio's own listings/i);
  });

  test("it forbids manufactured urgency", () => {
    // Nothing in the data says how fast a shirt sells, and urgency nobody can
    // stand behind is the fastest way to stop being believed.
    assert.match(DROPZONE_BRIEF, /No "won't last", no "going\s*\n?fast"/i);
  });

  test("it forbids making the grid read as a chart", () => {
    // Six tiles in price order read as a ranking unless the words say
    // otherwise, and this post is a snapshot of what arrived.
    // The brief is wrapped prose, so every phrase match has to survive a
// line break landing in the middle of it.
    assert.match(DROPZONE_BRIEF, /not a\s+ranking/i);
    assert.match(DROPZONE_BRIEF, /the six most\s+expensive/i);
    assert.match(DROPZONE_BRIEF, /snapshot/i);
  });

  test("it says the count varies, so the copy cannot lean on six", () => {
    assert.match(DROPZONE_BRIEF, /varies between three\s+and six/i);
  });

  test("it still lets the post say these landed yesterday", () => {
    // The whole point of going back to 24 hours.
    assert.match(DROPZONE_BRIEF, /listed\s+yesterday/i);
  });

  test("the price must be the buyer's price", () => {
    // listings.price_cents is what the seller gets. A card promoting a number
    // nobody can buy at is a complaint waiting to happen.
    assert.match(DROPZONE_BRIEF, /what a buyer pays, fee included/);
  });

  test("it sends people to the shirt", () => {
    assert.match(DROPZONE_BRIEF, /top_url/);
    assert.match(DROPZONE_BRIEF, /kickio\.com/);
  });

  test("it has no em dashes", () => {
    assert.equal(stripEmDashes(DROPZONE_BRIEF), DROPZONE_BRIEF);
  });
});


describe("it never claims a shirt is the dearest or the best", () => {
  test("the brief refuses superlatives outright", () => {
    // Price picks which shirts get a tile when more arrived than fit. That is
    // a selection rule, not a thing to say: the copy is not told which is
    // dearest and the card is not drawn in price order, so there is nothing
    // to base a superlative on.
    assert.match(DROPZONE_BRIEF, /NO SUPERLATIVES ABOUT ANY OF THEM/);
    assert.match(DROPZONE_BRIEF, /never ranked/i);
  });

  test("it requires a line saying there is more", () => {
    assert.match(DROPZONE_BRIEF, /SAY THERE IS MORE/);
    assert.match(DROPZONE_BRIEF, /count nothing/i);
  });
});

describe("the line that says there is more, without saying how much", () => {
  test("it counts nothing", () => {
    // It used to carry a rounded floor of everything buyable on Kickio. How
    // big the shop is is a figure about the business and those stay private.
    assert.ok(!/\d/.test(moreLine()), moreLine());
  });

  test("it still says it is a snapshot and still points at Kickio", () => {
    assert.match(moreLine(), /snapshot/i);
    assert.match(moreLine(), /kickio\.com/);
  });
});
