import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PERISHES, ageLabel, freshness, hasExpired, perishKind } from "./freshness.ts";

const NOW = Date.parse("2026-09-25T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("how old a draft reads as", () => {
  test("minutes, then hours, then days", () => {
    assert.equal(ageLabel(30_000), "just now");
    assert.equal(ageLabel(20 * 60_000), "20 min ago");
    assert.equal(ageLabel(5 * 3_600_000), "5h ago");
    assert.equal(ageLabel(26 * 3_600_000), "yesterday");
    assert.equal(ageLabel(4 * 86_400_000), "4 days ago");
  });

  /** Clock skew between the browser and the server must not print "-3h ago". */
  test("a draft from the future reads as just now, not as negative time", () => {
    assert.equal(ageLabel(-60_000), "just now");
  });
});

describe("whether the age is a problem", () => {
  /**
   * The case this exists for. A Grail of the Day points at a shirt that is for
   * sale; three days later it may not be, and the post would send collectors
   * to a dead page or quote a price that has moved.
   */
  test("a post about a live listing goes stale in days", () => {
    assert.equal(freshness(hoursAgo(2), "grail_of_the_day", NOW).state, "fresh");
    assert.equal(freshness(hoursAgo(30), "grail_of_the_day", NOW).state, "ageing");
    assert.equal(freshness(hoursAgo(80), "grail_of_the_day", NOW).state, "stale");
  });

  /**
   * A roundup is not wrong when it ages - its tense is. It gets longer before
   * it needs looking at, because nothing behind it can sell.
   */
  test("a post about a window lasts longer than one about a listing", () => {
    assert.equal(freshness(hoursAgo(30), "sold_this_week", NOW).state, "fresh");
    assert.equal(freshness(hoursAgo(100), "sold_this_week", NOW).state, "ageing");
    assert.equal(freshness(hoursAgo(200), "sold_this_week", NOW).state, "stale");
  });

  test("a completed sale never goes stale, because it already happened", () => {
    const old = freshness(hoursAgo(500), "grail_sale", NOW);
    assert.equal(old.state, "fresh");
    assert.equal(old.note, null);
    assert.equal(old.label, "21 days ago");
  });

  test("the note only appears once the age matters, and says why", () => {
    assert.equal(freshness(hoursAgo(1), "value_pick", NOW).note, null);
    assert.match(freshness(hoursAgo(90), "value_pick", NOW).note ?? "", /listing/i);
    assert.match(freshness(hoursAgo(300), "price_trends", NOW).note ?? "", /moved on/i);
  });

  /**
   * A recipe added later must not silently read as evergreen - the cautious
   * reading asks for a check that may not be needed rather than staying quiet
   * about one that is.
   */
  /**
   * The classification is a hand-written map, so the only thing that keeps it
   * honest is noticing when a recipe is added. Reading the keys out of the
   * registry's source does that without importing it - every recipe module
   * opens a Kickio connection, which has no business in a unit test.
   */
  test("every shipped recipe has been classified deliberately", () => {
    const registry = readFileSync(
      new URL("../recipes/index.ts", import.meta.url),
      "utf8",
    );
    const keys = [...registry.matchAll(/^\s{4}key: "([a-z_]+)",$/gm)].map((m) => m[1]);
    assert.ok(keys.length > 5, `only found ${keys.length} recipe keys - regex adrift?`);
    for (const key of keys) {
      assert.ok(key in PERISHES, `${key} is not classified in PERISHES`);
    }
  });

  /**
   * Two post kinds never appear in that registry because an admin drives them
   * from a form rather than a recipe run - and they are the two with a price
   * on the card, so they are the last ones that should go unclassified.
   */
  test("the hand-driven posts are classified too", () => {
    assert.equal(perishKind("kickio_drop"), "listing");
    assert.equal(perishKind("grail_sale"), "none");
    assert.equal(perishKind("price_history"), "window");
  });

  test("an unknown recipe is treated as a listing", () => {
    assert.equal(perishKind("something_new"), "listing");
    assert.equal(freshness(hoursAgo(80), "something_new", NOW).state, "stale");
  });

  test("an unreadable date is flagged, not treated as fresh", () => {
    const bad = freshness("not a date", "grail_of_the_day", NOW);
    assert.equal(bad.state, "ageing");
    assert.equal(bad.label, "date unknown");
    assert.ok(bad.note);
  });
});

describe("aging out of the queue altogether", () => {
  /**
   * The warning has to come before the sweep, and stay up for a while. A queue
   * that clears something it never flagged reads as the tool losing work.
   */
  test("a draft is warned about long before it is cleared", () => {
    assert.equal(freshness(hoursAgo(80), "grail_of_the_day", NOW).state, "stale");
    assert.equal(hasExpired(hoursAgo(80), "grail_of_the_day", NOW), false);
    assert.equal(hasExpired(hoursAgo(145), "grail_of_the_day", NOW), true);
  });

  test("and the warning says when that will be", () => {
    const note = freshness(hoursAgo(80), "grail_of_the_day", NOW).note ?? "";
    assert.match(note, /6 days old/);
    assert.match(freshness(hoursAgo(200), "sold_this_week", NOW).note ?? "", /14 days old/);
  });

  test("a roundup gets the longer run", () => {
    assert.equal(hasExpired(hoursAgo(200), "sold_this_week", NOW), false);
    assert.equal(hasExpired(hoursAgo(340), "sold_this_week", NOW), true);
  });

  test("a completed sale never ages out", () => {
    assert.equal(hasExpired(hoursAgo(5000), "grail_sale", NOW), false);
  });

  /** Throwing away a draft because its date will not parse is the wrong way
   *  round: an unreadable date is a reason to leave it alone. */
  test("an unreadable date is left in the queue, not swept", () => {
    assert.equal(hasExpired("not a date", "grail_of_the_day", NOW), false);
  });
});
