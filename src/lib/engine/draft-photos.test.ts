import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { imagesOf, nextImages } from "./draft-photos.ts";

describe("reading the pictures off a draft", () => {
  test("a list of URLs comes back as it is", () => {
    assert.deepEqual(imagesOf({ images: ["a", "b"] }), ["a", "b"]);
  });

  test("a draft with no pictures is empty, not broken", () => {
    // Price Trends and Market Index are charts, so this is a normal draft
    // rather than a damaged one.
    assert.deepEqual(imagesOf({}), []);
    assert.deepEqual(imagesOf(null), []);
    assert.deepEqual(imagesOf({ images: "not-a-list" }), []);
  });

  test("anything in the list that is not a URL is dropped", () => {
    assert.deepEqual(imagesOf({ images: ["a", null, 7, "b"] }), ["a", "b"]);
  });
});

describe("putting a different picture on a draft", () => {
  const three = ["one.jpg", "two.jpg", "three.jpg"];

  test("a replace swaps in place and keeps the order", () => {
    // The grids read `images` by position, so order is not cosmetic.
    assert.deepEqual(nextImages(three, "new.jpg", 1), ["one.jpg", "new.jpg", "three.jpg"]);
  });

  test("the first and last both work", () => {
    assert.deepEqual(nextImages(three, "n", 0), ["n", "two.jpg", "three.jpg"]);
    assert.deepEqual(nextImages(three, "n", 2), ["one.jpg", "two.jpg", "n"]);
  });

  test("the list never changes length on a replace", () => {
    assert.equal(nextImages(three, "n", 1).length, three.length);
  });

  test("an index that is not there is refused, not appended", () => {
    // The whole reason this function exists. A six-tile grid handed a seventh
    // image is a layout built for six drawing seven.
    assert.throws(() => nextImages(three, "n", 3), /no photo 4/);
    assert.throws(() => nextImages(three, "n", -1));
    assert.throws(() => nextImages([], "n", 0));
  });

  test("a fractional index is refused rather than rounded", () => {
    assert.throws(() => nextImages(three, "n", 1.5));
  });

  test("append puts it on the end", () => {
    assert.deepEqual(nextImages(three, "n", "append"), [...three, "n"]);
  });

  test("append works on a draft that had none", () => {
    assert.deepEqual(nextImages([], "n", "append"), ["n"]);
  });

  test("the original list is not modified", () => {
    const original = [...three];
    nextImages(three, "n", 0);
    assert.deepEqual(three, original);
  });
});
