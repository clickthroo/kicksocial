import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_YESTERDAY_SALES_CONFIG,
  YESTERDAY_SALES_BRIEF,
  YESTERDAY_SALES_KEY,
  detailLine,
  previousDay,
} from "./yesterday-sales.ts";
import { freshness, hasExpired, perishKind } from "../engine/freshness.ts";
import { stripEmDashes } from "../copy/dashes.ts";

describe("which day the post is about", () => {
  test("the whole of the previous UTC day, not the last 24 hours", () => {
    // A rolling 24 hours would put half of this morning in a post headed
    // "yesterday", and would cover a different slice depending on the minute
    // cron happened to fire.
    const day = previousDay(new Date("2026-10-05T09:14:00Z"));
    assert.equal(day.start, "2026-10-04T00:00:00.000Z");
    assert.equal(day.end, "2026-10-05T00:00:00.000Z");
    assert.equal(day.key, "2026-10-04");
  });

  test("the window is exactly 24 hours", () => {
    const day = previousDay(new Date("2026-03-29T06:00:00Z"));
    assert.equal(Date.parse(day.end) - Date.parse(day.start), 86_400_000);
  });

  test("a run just after midnight still means yesterday", () => {
    const day = previousDay(new Date("2026-10-05T00:03:00Z"));
    assert.equal(day.key, "2026-10-04");
  });

  test("a run just before midnight does not jump forward a day", () => {
    const day = previousDay(new Date("2026-10-05T23:59:59Z"));
    assert.equal(day.key, "2026-10-04");
  });

  test("it crosses a month boundary", () => {
    assert.equal(previousDay(new Date("2026-11-01T07:00:00Z")).key, "2026-10-31");
  });

  test("it crosses a year boundary", () => {
    assert.equal(previousDay(new Date("2027-01-01T07:00:00Z")).key, "2026-12-31");
  });

  test("the label is British and names the weekday", () => {
    // It is printed on the card and read in the copy, so it has to be a date a
    // person says out loud rather than an ISO string.
    assert.equal(previousDay(new Date("2026-10-05T09:00:00Z")).label, "Sunday 4 October");
  });

  test("the day is the subject, so a day can only be posted once", () => {
    // `post_drafts` has a unique guard on (recipe_key, subject_ref), so this is
    // what stops two runs on the same morning producing two posts.
    assert.match(previousDay(new Date("2026-10-05T09:00:00Z")).key, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("the line under each shirt", () => {
  test("condition and size together", () => {
    assert.equal(detailLine("Mint", "L"), "Mint · Size L");
  });

  test("either one on its own", () => {
    assert.equal(detailLine("Good", null), "Good");
    assert.equal(detailLine(null, "XL"), "Size XL");
  });

  test("placeholders are dropped rather than printed", () => {
    // Both columns are free text on a market record and both are often a
    // stand-in. A tile reading "Unknown · Size N/A" says nothing and takes the
    // space of something that would.
    assert.equal(detailLine("Unknown", "N/A"), "");
    assert.equal(detailLine("unknown", "L"), "Size L");
  });

  test("nothing known yields an empty line, not the word undefined", () => {
    assert.equal(detailLine(null, null), "");
  });
});

describe("the shape of the post", () => {
  test("six, because the card is a 3x2 grid", () => {
    assert.equal(DEFAULT_YESTERDAY_SALES_CONFIG.featureCount, 6);
  });

  test("the price floor is low enough that a quiet day still fills the grid", () => {
    // Measured over the 15 days to 2026-10-05, the photo-backed sales per day
    // ran as low as 3. The floor must not be what empties the grid.
    assert.ok(DEFAULT_YESTERDAY_SALES_CONFIG.minPriceCents <= 5_000);
  });
});

describe("how it ages, which is faster than anything else here", () => {
  test("it is classified, and not as a listing", () => {
    assert.equal(perishKind(YESTERDAY_SALES_KEY), "day");
  });

  test("a draft from this morning is fresh", () => {
    const made = new Date("2026-10-05T07:00:00Z").toISOString();
    assert.equal(freshness(made, YESTERDAY_SALES_KEY, Date.parse("2026-10-05T11:00:00Z")).state, "fresh");
  });

  test("by the next day it is not late, it is wrong", () => {
    // The card names a date. Posted 26 hours on, "yesterday" points at the
    // wrong day, and no amount of good copy survives that.
    const made = new Date("2026-10-05T07:00:00Z").toISOString();
    const state = freshness(made, YESTERDAY_SALES_KEY, Date.parse("2026-10-06T09:00:00Z"));
    assert.equal(state.state, "stale");
    assert.match(state.note ?? "", /no longer yesterday/);
  });

  test("it clears itself out inside two days", () => {
    const made = new Date("2026-10-05T07:00:00Z").toISOString();
    assert.equal(hasExpired(made, YESTERDAY_SALES_KEY, Date.parse("2026-10-06T12:00:00Z")), false);
    assert.equal(hasExpired(made, YESTERDAY_SALES_KEY, Date.parse("2026-10-07T12:00:00Z")), true);
  });

  test("it ages faster than a weekly roundup, which is the point of the new kind", () => {
    const made = new Date("2026-10-05T07:00:00Z").toISOString();
    const at = Date.parse("2026-10-06T09:00:00Z");
    assert.equal(freshness(made, YESTERDAY_SALES_KEY, at).state, "stale");
    assert.equal(freshness(made, "sold_this_week", at).state, "fresh");
  });
});

describe("the brief, which is where this post could go wrong", () => {
  test("it forbids claiming the sales happened on Kickio", () => {
    // Measured 2026-10-05: sales_history over 30 days is cfs 1,738, kickio 319,
    // shopify 162, ebay 125. Of the 319 "kickio" rows only 2 carry a listing_id
    // and none an external_url, and Kickio's own orders table holds 19 rows in
    // its whole history. Nothing here proves a sale happened on Kickio.
    assert.match(YESTERDAY_SALES_BRIEF, /NOT Kickio's own sales/);
    assert.match(YESTERDAY_SALES_BRIEF, /Never write "sold on Kickio"/);
  });

  test("it forbids calling the six a complete top six", () => {
    // Only photo-backed sales can go on the card, so the set is "the six we can
    // show" and never "the day's top six".
    assert.match(YESTERDAY_SALES_BRIEF, /never write "the top six"/i);
  });

  test("it asks for the listing invitation, which is the point of the post", () => {
    assert.match(YESTERDAY_SALES_BRIEF, /list on Kickio|List it on kickio|list/i);
    assert.match(YESTERDAY_SALES_BRIEF, /kickio\.com/);
  });

  test("it has no em dashes", () => {
    assert.equal(stripEmDashes(YESTERDAY_SALES_BRIEF), YESTERDAY_SALES_BRIEF);
  });
});
