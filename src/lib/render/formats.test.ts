import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FORMATS, asFormat, TIKTOK_SAFE_BOTTOM } from "./formats.ts";

describe("output formats", () => {
  test("one per platform Kickio actually posts to", () => {
    // TikTok was a declared platform on five recipes with no size of its own,
    // so the only assets available were a 4:5 or a 16:9 - both letterboxed in
    // a full-screen 9:16 feed.
    assert.deepEqual(Object.keys(FORMATS).sort(), ["ig", "tiktok", "x"]);
  });

  test("the aspect ratios each platform expects", () => {
    const ratio = (f: keyof typeof FORMATS) => FORMATS[f].width / FORMATS[f].height;
    assert.ok(Math.abs(ratio("ig") - 4 / 5) < 0.01, "Instagram 4:5");
    assert.ok(Math.abs(ratio("x") - 16 / 9) < 0.01, "X 16:9");
    assert.ok(Math.abs(ratio("tiktok") - 9 / 16) < 0.01, "TikTok 9:16");
  });

  test("the TikTok safe area is a real share of the frame", () => {
    // TikTok draws its caption, username and buttons over the lower quarter.
    // Type set against the bottom edge ends up behind that chrome.
    const share = TIKTOK_SAFE_BOTTOM / FORMATS.tiktok.height;
    assert.ok(share > 0.12 && share < 0.25, `safe area is ${(share * 100).toFixed(0)}% of height`);
  });
});

describe("reading a format off a query string", () => {
  test("each key round-trips", () => {
    for (const key of Object.keys(FORMATS)) assert.equal(asFormat(key), key);
  });

  test("anything else falls to the portrait crop rather than 404ing", () => {
    for (const bad of ["", "IG", "square", null, undefined, 4, {}]) {
      assert.equal(asFormat(bad), "ig", String(bad));
    }
  });
});
