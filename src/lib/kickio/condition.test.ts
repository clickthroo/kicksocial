import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CONDITIONS,
  conditionRank,
  normaliseCondition,
  normaliseSize,
  shortCondition,
  sizeAndCondition,
} from "./condition.ts";

describe("reading a condition", () => {
  test("knows the grades in order, worst to best", () => {
    assert.ok(conditionRank("Fair")! < conditionRank("Very Good")!);
    assert.ok(conditionRank("Very Good")! < conditionRank("Mint")!);
    assert.ok(conditionRank("Mint")! < conditionRank("Brand New (With Tags)")!);
  });

  /** All four of these are in Kickio's data today. */
  test("recognises the misspellings that are actually in the data", () => {
    assert.equal(normaliseCondition("Excelllent"), "Excellent");
    assert.equal(normaliseCondition("Excellet"), "Excellent");
    assert.equal(normaliseCondition("Excelelnt"), "Excellent");
    assert.equal(normaliseCondition("Minit"), "Mint");
  });

  /**
   * Nothing is guessed. A value not in the table is unknown, and an unknown
   * condition takes no part in the reasoning rather than being ranked at a
   * guess - which would put a made-up grade into a claim.
   */
  test("anything unrecognised is unknown, never a near miss", () => {
    assert.equal(normaliseCondition("undefined"), null);
    assert.equal(normaliseCondition("Grail"), null);
    assert.equal(normaliseCondition(""), null);
    assert.equal(normaliseCondition(null), null);
    assert.equal(conditionRank("Pristine"), null);
  });

  test("is not fussy about case or stray spaces", () => {
    assert.equal(normaliseCondition("  very good "), "Very Good");
    assert.equal(normaliseCondition("BNWT"), "Brand New (With Tags)");
  });

  test("only the long one is shortened for the card", () => {
    assert.equal(shortCondition("Brand New (With Tags)"), "Brand New");
    assert.equal(shortCondition("Very Good"), "Very Good");
    assert.equal(shortCondition("nonsense"), null);
  });

  test("every grade survives a round trip", () => {
    for (const grade of CONDITIONS) {
      assert.equal(normaliseCondition(grade), grade);
      assert.ok(shortCondition(grade));
    }
  });
});

describe("reading a size", () => {
  test("accepts the sizes a shirt actually comes in", () => {
    assert.equal(normaliseSize("m"), "M");
    assert.equal(normaliseSize("XXL"), "XXL");
    assert.equal(normaliseSize("2XL"), "XXL");
    assert.equal(normaliseSize("xxxl"), "3XL");
  });

  /**
   * The failure this exists to stop. Kickio's size column carries shopify
   * variant titles, so "Manchester United" and "Default Title" are in there -
   * and a card printing a club name where the size goes is obviously broken.
   */
  test("refuses the junk that is really in that column", () => {
    for (const junk of ["Manchester United", "Inter Milan", "Default Title", "Not specified", "Germany"]) {
      assert.equal(normaliseSize(junk), null, `${junk} should not read as a size`);
    }
  });

  /** A listing that covered two sizes has no single size to print. */
  test("a multi-size listing is dropped rather than halved", () => {
    assert.equal(normaliseSize("M, L"), null);
    assert.equal(normaliseSize("L, XL"), null);
  });
});

describe("the line under a point on the card", () => {
  test("joins what it has", () => {
    assert.equal(sizeAndCondition("M", "Very Good"), "M · Very Good");
    assert.equal(sizeAndCondition("Default Title", "Very Good"), "Very Good");
    assert.equal(sizeAndCondition("XL", "who knows"), "XL");
  });

  test("is nothing at all when it knows nothing", () => {
    assert.equal(sizeAndCondition(null, null), null);
    assert.equal(sizeAndCondition("Liverpool", "undefined"), null);
  });
});
