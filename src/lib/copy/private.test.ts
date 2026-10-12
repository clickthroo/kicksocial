import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isPrivateField, privateFieldsIn, withoutPrivateFigures } from "./private.ts";
import { BRAND_VOICE } from "./brand-voice.ts";

describe("figures about the size of the business never reach the model", () => {
  test("inventory, volume, people and totals are all private", () => {
    for (const key of [
      "live_shirt_count",
      "total_listings",
      "total_sales",
      "total_sales_90d",
      "recorded_that_day",
      "collector_count",
      "total_value",
    ]) {
      assert.ok(isPrivateField(key), key);
    }
  });

  test("facts about the one shirt a post is about are not", () => {
    // A reader sees all of these on the shirt's own page, and a post that
    // cannot mention them has nothing to say.
    for (const key of ["price", "listings_count", "listing_line", "priceCents", "condition", "size"]) {
      assert.ok(!isPrivateField(key), key);
    }
  });

  test("the match is on the whole key, not a substring", () => {
    // `listings_count` is how many of ONE shirt are for sale. `total_listings`
    // is how big Kickio is. A substring rule would take both or neither.
    assert.ok(!isPrivateField("listings_count"));
    assert.ok(isPrivateField("total_listings"));
  });

  test("redaction removes the private keys and keeps everything else", () => {
    const before = {
      title: "1990-91 France Home Shirt",
      price: "£126.50",
      listings_count: 3,
      live_shirt_count: 1315,
      total_sales: 47,
    };
    assert.deepEqual(withoutPrivateFigures(before), {
      title: "1990-91 France Home Shirt",
      price: "£126.50",
      listings_count: 3,
    });
  });

  test("source data with nothing private comes back as the same object", () => {
    // The common case must allocate nothing: every post goes through this.
    const clean = { title: "a", price: "£1" };
    assert.equal(withoutPrivateFigures(clean), clean);
  });

  test("it reports what it took, so the filtering is not invisible", () => {
    // A recipe quietly having its data stripped is how a rule becomes
    // impossible to find: the next person wonders why a number they can see
    // in the code never appears in a post.
    assert.deepEqual(privateFieldsIn({ price: "£1", total_sales: 9 }), ["total_sales"]);
    assert.deepEqual(privateFieldsIn({ price: "£1" }), []);
  });

  test("case and stray whitespace do not get a key through", () => {
    assert.ok(isPrivateField("Total_Sales"));
    assert.ok(isPrivateField(" live_shirt_count "));
  });
});

describe("the rule is in the brand voice too, for the prose the filter cannot reach", () => {
  test("every brief inherits it", () => {
    // The filter guarantees the model is never GIVEN a number. The brief is
    // what stops it inventing one, or repeating one out of a claim.
    assert.match(BRAND_VOICE, /Kickio's own numbers are private/);
    assert.match(BRAND_VOICE, /NEVER publish a figure that describes the size of Kickio/);
  });

  test("it says the ban survives post types written later", () => {
    assert.match(BRAND_VOICE, /including ones written after this/i);
  });

  test("it still allows the facts about one shirt", () => {
    // Without this the model has nothing to write with.
    assert.match(BRAND_VOICE, /what a shirt\s*\n?costs/i);
  });

  test("it gives the wording to use instead of a count", () => {
    // Wrapped prose, so the phrase match has to survive a line break.
    assert.match(BRAND_VOICE, /"More on\s+kickio\.com"/);
  });
});

describe("the sample behind an index figure", () => {
  test("the cohort count is private, like every other count of what is tracked", () => {
    // It was printed on the index card as "38 comparable shirts · 79 sales".
    // The sale count had already gone, which left the card drawing "· sales"
    // with nothing in front of it; both are off the card now, and the key is
    // kept from the prompt so the model cannot put it back in words.
    assert.equal(isPrivateField("cohort_count"), true);
  });

  test("the price it describes survives, because a price is not a count", () => {
    assert.equal(isPrivateField("median_fair_price"), false);
    assert.equal(isPrivateField("pct_change"), false);
  });
});
