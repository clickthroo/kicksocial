import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isRenderable, needsTranscode } from "./photos.ts";

const SB = "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/product-images";

describe("what a card can draw", () => {
  test("jpg and png go straight through", () => {
    for (const url of [`${SB}/a.jpg`, `${SB}/b.jpeg`, `${SB}/c.png`]) {
      assert.equal(isRenderable(url), true, url);
      assert.equal(needsTranscode(url), false, url);
    }
  });

  test("WebP is renderable, but only after conversion", () => {
    // The distinction that matters: Satori must never be handed the URL
    // itself, because it draws WebP as an empty frame and raises no error.
    const url = `${SB}/scraped/ebay/389186049708/0.webp`;
    assert.equal(isRenderable(url), true);
    assert.equal(needsTranscode(url), true);
  });

  test("the other formats sharp can open are treated the same way", () => {
    for (const url of [`${SB}/a.avif`, `${SB}/b.tif`, `${SB}/c.tiff`, `${SB}/d.gif`]) {
      assert.equal(isRenderable(url), true, url);
      assert.equal(needsTranscode(url), true, url);
    }
  });

  test("an allowlist, so a page or a vector is not mistaken for a photograph", () => {
    // Negation would accept anything with a dot in it and push the failure to
    // render time, where it costs a fetch and a sharp error to learn the same
    // thing this line knows for free.
    for (const url of [`${SB}/a.svg`, `${SB}/b.pdf`, `${SB}/c.html`, `${SB}/d`, ""]) {
      assert.equal(isRenderable(url), false, url || "(empty)");
      assert.equal(needsTranscode(url), false, url || "(empty)");
    }
  });

  test("a query string after the extension does not hide the format", () => {
    assert.equal(needsTranscode(`${SB}/a.webp?width=800`), true);
    assert.equal(needsTranscode(`${SB}/a.jpg?width=800`), false);
    assert.equal(isRenderable(`${SB}/a.jpg?width=800`), true);
  });

  test("case does not matter - scrapers write .WEBP and .JPG", () => {
    assert.equal(needsTranscode(`${SB}/A.WEBP`), true);
    assert.equal(isRenderable(`${SB}/B.JPG`), true);
  });
});
