import { test } from "node:test";
import assert from "node:assert/strict";
import { stripEmDashes, stripEmDashesDeep } from "./dashes.ts";

const DASH = "\u2014";

test("a spaced em dash becomes a comma", () => {
  assert.equal(stripEmDashes(`a shirt ${DASH} and a story`), "a shirt, and a story");
});

test("an unspaced em dash becomes a comma", () => {
  assert.equal(stripEmDashes(`a shirt${DASH}and a story`), "a shirt, and a story");
});

test("it does not double up on punctuation that is already there", () => {
  assert.equal(stripEmDashes(`Sold, ${DASH} £95`), "Sold, £95");
  assert.equal(stripEmDashes(`Sold: ${DASH} £95`), "Sold: £95");
  assert.equal(stripEmDashes(`Sold. ${DASH} £95`), "Sold. £95");
  assert.equal(stripEmDashes(`(${DASH}£95)`), "(£95)");
});

test("a dash that opens a line or a string just goes", () => {
  assert.equal(stripEmDashes(`${DASH} it opens the string`), "it opens the string");
  assert.equal(stripEmDashes(`one\n${DASH} two`), "one\ntwo");
});

test("line breaks either side of the dash survive", () => {
  // A greedy \s* would eat the newline and glue two paragraphs together.
  assert.equal(stripEmDashes(`one ${DASH} two\n\nthree`), "one, two\n\nthree");
});

test("text without an em dash is returned unchanged, en dashes included", () => {
  const ranges = "1993-94, 1990–2010, kickio.com";
  assert.equal(stripEmDashes(ranges), ranges);
});

test("it walks a whole copy object and counts what it changed", () => {
  const copy = {
    alt: `A red shirt ${DASH} short sleeves`,
    x: { text: `Six clubs ${DASH} one career`, hashtags: ["footballshirt"] },
    tiktok: { beats: [`Guess who ${DASH} answer below`], cta: "kickio.com" },
    recorded_sales: 6,
    nothing: null,
  };
  const { value, replaced } = stripEmDashesDeep(copy);
  assert.equal(replaced, 3);
  assert.equal(value.alt, "A red shirt, short sleeves");
  assert.equal(value.x.text, "Six clubs, one career");
  assert.equal(value.tiktok.beats[0], "Guess who, answer below");
  assert.deepEqual(value.x.hashtags, ["footballshirt"]);
  assert.equal(value.recorded_sales, 6);
  assert.equal(value.nothing, null);
});

test("clean copy is left alone and counts zero", () => {
  const copy = { alt: "A red shirt, short sleeves", x: { text: "Six clubs, one career" } };
  const { value, replaced } = stripEmDashesDeep(copy);
  assert.equal(replaced, 0);
  assert.deepEqual(value, copy);
});
