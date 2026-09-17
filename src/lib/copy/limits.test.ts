import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PLATFORM_LIMITS, leadLength, willCollapse } from "./limits.ts";

describe("X Premium", () => {
  test("the post limit is Premium's, not the free 280", () => {
    assert.equal(PLATFORM_LIMITS.x.chars, 25_000);
  });

  test("but the lead is still 280 - that is what X shows before collapsing", () => {
    // Premium lifts the limit on writing, not on what a scrolling reader sees.
    assert.equal(PLATFORM_LIMITS.x.lead, 280);
  });

  test("hashtags are no longer rationed against the post body", () => {
    // On a free account every tag came out of the same 280 as the writing.
    assert.ok(PLATFORM_LIMITS.x.hashtags >= 15);
  });
});

describe("the lead", () => {
  test("a short post shows in full and is not marked as collapsing", () => {
    const short = "a".repeat(200);
    assert.equal(willCollapse(short), false);
    assert.equal(leadLength(short), 200);
  });

  test("exactly 280 still shows in full", () => {
    // Off by one here mislabels a post that is fine as truncated.
    assert.equal(willCollapse("a".repeat(280)), false);
  });

  test("281 collapses", () => {
    assert.equal(willCollapse("a".repeat(281)), true);
  });

  test("the lead never reports more than the limit", () => {
    assert.equal(leadLength("a".repeat(5_000)), 280);
  });
});

describe("hashtag counts are per network, not one number", () => {
  test("Instagram is at the platform's own cap", () => {
    assert.equal(PLATFORM_LIMITS.instagram.hashtags, 30);
  });

  test("every network gets a generous set", () => {
    for (const [network, limits] of Object.entries(PLATFORM_LIMITS)) {
      assert.ok(limits.hashtags >= 12, `${network} is stingy: ${limits.hashtags}`);
    }
  });
});
