import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DROPZONE_CONFIG,
  DROPZONE_BRIEF,
  DROPZONE_KEY,
  isLive,
  onePerProduct,
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

  test("the window is one day, as asked", () => {
    assert.equal(DEFAULT_DROPZONE_CONFIG.windowDays, 1);
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

  test("it forbids calling the six a complete top six", () => {
    // Only photo-backed listings can go on the card.
    assert.match(DROPZONE_BRIEF, /never write "the six\s*\n?most expensive shirts listed yesterday"/i);
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
