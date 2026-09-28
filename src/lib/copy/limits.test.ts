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

  test("X is generous, because Premium means they cost the post nothing", () => {
    assert.ok(PLATFORM_LIMITS.x.hashtags >= 12);
  });

  test("TikTok is deliberately the small one", () => {
    // Not an oversight and not a stingier version of the same rule: 3-5
    // relevant tags is what reaches on TikTok, and a caption past about ten
    // reads as spam and is pushed less. This used to be 12, which was the
    // "more is better" assumption applied to the one network it is false on.
    assert.ok(PLATFORM_LIMITS.tiktok.hashtags >= 3 && PLATFORM_LIMITS.tiktok.hashtags <= 5);
  });
});

describe("TikTok's numbers", () => {
  test("the ceiling is the API's 2,200, not the app's 4,000", () => {
    // The app takes 4,000. TikTok's Direct Post API - the path an automated
    // publisher has to use - caps a caption at 2,200. A post written to 4,000
    // pastes by hand today and fails the day publishing is wired up.
    assert.equal(PLATFORM_LIMITS.tiktok.chars, 2_200);
  });

  test("the target is far below the ceiling, because the ceiling is not the goal", () => {
    // Captions in the 150-300 band out-reach longer ones. A model given only a
    // maximum writes to the maximum, so the band has to be stated.
    assert.ok(PLATFORM_LIMITS.tiktok.target <= 300);
    assert.ok(PLATFORM_LIMITS.tiktok.target < PLATFORM_LIMITS.tiktok.chars / 4);
  });

  test("the visible window is the tightest of the three", () => {
    // ~80-100 characters show before TikTok collapses the caption. 80 is the
    // conservative end, so a hook that fits works on the smallest of them.
    assert.equal(PLATFORM_LIMITS.tiktok.lead, 80);
    assert.ok(PLATFORM_LIMITS.tiktok.lead < PLATFORM_LIMITS.instagram.lead);
    assert.ok(PLATFORM_LIMITS.tiktok.lead < PLATFORM_LIMITS.x.lead);
  });

  test("the lead helpers work for TikTok, not only for X", () => {
    const caption = "a".repeat(120);
    assert.equal(willCollapse(caption, "tiktok"), true);
    assert.equal(leadLength(caption, "tiktok"), 80);
    // The same string is nowhere near X's fold.
    assert.equal(willCollapse(caption, "x"), false);
  });
});

describe("every network has a lead, because every network truncates", () => {
  test("each one states one, and none of them is the whole limit", () => {
    for (const [network, limits] of Object.entries(PLATFORM_LIMITS)) {
      assert.ok(limits.lead > 0, `${network} has no lead`);
      assert.ok(limits.lead < limits.chars, `${network}'s lead is its whole limit`);
    }
  });
});
