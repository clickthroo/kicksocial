import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CLIENT_MAX_EDGE, fitWithin } from "./browser.ts";

describe("sizing a photograph down for upload", () => {
  test("a big landscape photo is capped on its width", () => {
    // 24 megapixels off a recent phone, which is 4x what the biggest card can
    // draw and several seconds of upload on a train.
    assert.deepEqual(fitWithin(6000, 4000), { width: 2400, height: 1600 });
  });

  test("a big portrait photo is capped on its height", () => {
    assert.deepEqual(fitWithin(3000, 4500), { width: 1600, height: 2400 });
  });

  test("the shape is kept", () => {
    const { width, height } = fitWithin(4000, 2250);
    assert.ok(Math.abs(width / height - 4000 / 2250) < 0.01);
  });

  test("a small image is left alone rather than blown up", () => {
    // Enlarging makes a bigger file carrying no more detail, and the card
    // blurs it either way.
    assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  });

  test("an image exactly at the cap is untouched", () => {
    assert.deepEqual(fitWithin(CLIENT_MAX_EDGE, 1000), { width: CLIENT_MAX_EDGE, height: 1000 });
  });

  test("a sliver never rounds away to nothing", () => {
    // A zero-width canvas throws, and the upload would fail on a file that is
    // merely an odd shape.
    const { width, height } = fitWithin(10000, 2);
    assert.ok(width >= 1 && height >= 1);
  });

  test("nonsense dimensions yield zero rather than NaN", () => {
    assert.deepEqual(fitWithin(0, 0), { width: 0, height: 0 });
    assert.deepEqual(fitWithin(-5, 100), { width: 0, height: 0 });
  });

  test("the cap is twice the biggest card, which is the point of it", () => {
    // The tallest card is 1080x1350. Storing more than double that is detail
    // thrown away on every render.
    assert.equal(CLIENT_MAX_EDGE, 2400);
    assert.ok(CLIENT_MAX_EDGE >= 1350 * 1.5);
  });
});
