import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FORMATS, asFormat, TIKTOK_SAFE_BOTTOM, lineFits } from "./formats.ts";

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

describe("fitting a line of type to the space it has", () => {
  // The Battle card's hero: 1080 wide, 56 of padding each side.
  const AVAILABLE = 1080 - 56 * 2;

  test("a short line keeps the size it asked for", () => {
    // "Which one?" fitted at 132px, which is why nothing caught this until the
    // wording changed.
    assert.equal(lineFits("Which one?", AVAILABLE, 132), 132);
  });

  test("a longer line is brought down until it fits", () => {
    // "Which one wins?" at 132px is about 1,049px of a 968px frame. Satori
    // does not report that, it just wraps - and the hero block has a fixed
    // height, so the second line lands on the shirts.
    const size = lineFits("Which one wins?", AVAILABLE, 132);
    assert.ok(size < 132);
    assert.ok(size * "Which one wins?".length * 0.58 <= AVAILABLE);
  });

  test("it is still big enough to be a hero", () => {
    // Clamping is only worth doing if what survives is still the loudest thing
    // on the card. Below about 80px it stops being one.
    assert.ok(lineFits("Which one wins?", AVAILABLE, 132) >= 80);
  });

  test("the clamp is applied to the scaled size, not before it", () => {
    // The editorial look scales type up by 1.22. Passing the already-scaled
    // number in is what stops it carrying the line back over the edge.
    const scaled = Math.round(132 * 1.22);
    assert.ok(lineFits("Which one wins?", AVAILABLE, scaled) < scaled);
  });

  test("the wider 16:9 frame allows more", () => {
    const wide = 1200 - 44 * 2;
    assert.ok(lineFits("Which one wins?", wide, 132) >= lineFits("Which one wins?", AVAILABLE, 132));
  });

  test("it never returns zero or a negative size", () => {
    // A size of 0 renders nothing at all, which is worse than small type.
    assert.ok(lineFits("a".repeat(500), AVAILABLE, 132) >= 1);
  });

  test("empty text and a nonsense width fall back to the maximum", () => {
    assert.equal(lineFits("", AVAILABLE, 132), 132);
    assert.equal(lineFits("Which one wins?", 0, 132), 132);
  });
});
