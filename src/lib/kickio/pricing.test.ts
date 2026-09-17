import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buyerPriceCents,
  roundUpTo50Or99,
  formatPrice,
  DEFAULT_BUYER_FEE,
} from "./pricing.ts";

describe("buyer protection fee", () => {
  test("reproduces the price kickio.com shows", () => {
    // Observed on 2026-09-17: the 1996-98 Arsenal player-version page headlines
    // £346.99 for a listing whose price_cents is 33299. A post quoting £332.99
    // (or the £375.99 of the dearer listing) contradicts the page.
    assert.equal(buyerPriceCents(33_299), 34_699);
    assert.equal(formatPrice(buyerPriceCents(33_299)), "£346.99");
  });

  test("applies 4% plus 40p before rounding", () => {
    // 10000 * 1.04 = 10400, + 40 = 10440, rounds up to 10450.
    assert.equal(buyerPriceCents(10_000), 10_450);
  });

  test("passes the asking price through when the fee is disabled", () => {
    assert.equal(buyerPriceCents(33_299, { ...DEFAULT_BUYER_FEE, enabled: false }), 33_299);
  });

  test("honours settings that differ from the defaults", () => {
    const doubled = { ...DEFAULT_BUYER_FEE, percentBps: 800, fixedCents: 0 };
    // 10000 * 1.08 = 10800, already ends in 00 -> next is 10850.
    assert.equal(buyerPriceCents(10_000, doubled), 10_850);
  });
});

describe("up_50_or_99 rounding", () => {
  test("rounds up to the next .50 or .99", () => {
    assert.equal(roundUpTo50Or99(34_670.96), 34_699);
    assert.equal(roundUpTo50Or99(39_142.96), 39_150);
    assert.equal(roundUpTo50Or99(10_001), 10_050);
    assert.equal(roundUpTo50Or99(10_051), 10_099);
  });

  test("leaves an amount already ending in .50 or .99 alone", () => {
    assert.equal(roundUpTo50Or99(10_050), 10_050);
    assert.equal(roundUpTo50Or99(10_099), 10_099);
  });

  test("carries into the next pound past .99", () => {
    assert.equal(roundUpTo50Or99(10_099.5), 10_150);
  });

  test("never rounds down", () => {
    for (const cents of [1, 49, 50, 51, 98, 99, 100, 12_345, 99_999]) {
      assert.ok(roundUpTo50Or99(cents) >= cents, `${cents}`);
    }
  });
});

describe("price formatting", () => {
  test("drops decimals only for whole amounts", () => {
    // The brand voice asks for £945 rather than £945.00 - but £346.99 must not
    // become "£347", which overstates the price against the page.
    assert.equal(formatPrice(94_500), "£945");
    assert.equal(formatPrice(34_699), "£346.99");
    assert.equal(formatPrice(39_150), "£391.50");
  });

  test("handles other currencies", () => {
    assert.equal(formatPrice(10_000, "EUR"), "€100");
  });
});
