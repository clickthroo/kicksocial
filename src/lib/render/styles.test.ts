import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CARD_STYLES, asCardStyle, styleName, DEFAULT_CARD_STYLE } from "./styles.ts";

describe("choosing a style", () => {
  test("accepts every style it offers", () => {
    for (const style of CARD_STYLES) {
      assert.equal(asCardStyle(style.key), style.key);
    }
  });

  test("falls back to the default rather than rendering nothing", () => {
    // A style is cosmetic. A draft whose look was removed in a later release
    // should still render, not 500 on the way to review.
    for (const bad of ["neon", "", null, undefined, 7, {}]) {
      assert.equal(asCardStyle(bad), DEFAULT_CARD_STYLE);
    }
  });

  test("the default is one of the offered styles", () => {
    assert.ok(CARD_STYLES.some((s) => s.key === DEFAULT_CARD_STYLE));
  });
});

describe("the list itself", () => {
  test("keys are unique - the picker uses them as React keys and as the stored value", () => {
    const keys = CARD_STYLES.map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  test("every style has a name and a blurb, since both are shown", () => {
    for (const style of CARD_STYLES) {
      assert.ok(style.name.length > 0, style.key);
      assert.ok(style.blurb.length > 10, style.key);
    }
  });

  test("names an unknown key rather than throwing", () => {
    assert.equal(styleName("nope"), "nope");
    assert.equal(styleName("spotlight"), "Spotlight");
  });
});
