import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { knockoutBorder, detectBackground } from "./knockout.ts";

/** Build an RGBA buffer from a grid of colour letters. */
function image(rows: string[], palette: Record<string, [number, number, number, number]>) {
  const height = rows.length;
  const width = rows[0].length;
  const data = Buffer.alloc(width * height * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const [r, g, b, a] = palette[ch];
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }),
  );
  return { data, width, height };
}

const W: [number, number, number, number] = [255, 255, 255, 255];
const K: [number, number, number, number] = [0, 0, 0, 255];
const alpha = (data: Buffer, width: number, x: number, y: number) => data[(y * width + x) * 4 + 3];

describe("what gets removed", () => {
  test("clears the surround but keeps white enclosed by the artwork", () => {
    // This is the whole point. Kickio's badge is a black disc with a WHITE ring
    // and WHITE lettering inside it. "Make white transparent" would hollow the
    // logo out; only the border-connected white may go.
    const { data, width, height } = image(
      [
        "WWWWWWW",
        "WWKKKWW",
        "WWKWKWW", // the white here is inside the ring
        "WWKKKWW",
        "WWWWWWW",
      ],
      { W, K },
    );
    const result = knockoutBorder(data, width, height);

    assert.equal(alpha(data, width, 0, 0), 0, "corner should be cleared");
    assert.equal(alpha(data, width, 3, 2), 255, "enclosed white must survive");
    assert.equal(alpha(data, width, 2, 1), 255, "the artwork must survive");
    assert.equal(result.cleared, 7 * 5 - 9);
  });

  test("reports the colour it removed", () => {
    const { data, width, height } = image(["WWW", "WKW", "WWW"], { W, K });
    const result = knockoutBorder(data, width, height);
    assert.deepEqual(result.background, { r: 255, g: 255, b: 255 });
  });

  test("zeroes the colour as well as the alpha", () => {
    // A transparent pixel still carrying white bleeds a halo when scaled.
    const { data, width, height } = image(["WWW", "WKW", "WWW"], { W, K });
    knockoutBorder(data, width, height);
    assert.deepEqual([data[0], data[1], data[2], data[3]], [0, 0, 0, 0]);
  });
});

describe("what is left alone", () => {
  test("does nothing when the edges are already transparent", () => {
    const T: [number, number, number, number] = [0, 0, 0, 0];
    const { data, width, height } = image(["TTT", "TKT", "TTT"], { T, K });
    const result = knockoutBorder(data, width, height);
    assert.equal(result.cleared, 0);
    assert.equal(result.background, null);
  });

  test("does nothing when the corners disagree - there is no one background", () => {
    // A logo on a gradient or a photograph. Guessing a background here would
    // eat part of the artwork.
    const R: [number, number, number, number] = [255, 0, 0, 255];
    const { data, width, height } = image(["WWR", "WKR", "WWR"], { W, K, R });
    assert.equal(detectBackground(data, width, height), null);
    assert.equal(knockoutBorder(data, width, height).cleared, 0);
  });

  test("keeps a logo that runs to the edge of the frame", () => {
    const { data, width, height } = image(["KKK", "KKK", "KKK"], { K });
    // Corners are the artwork, so the artwork is the "background" - but nothing
    // else differs, so a full-bleed logo would vanish. Guard against that.
    const result = knockoutBorder(data, width, height);
    assert.equal(result.cleared, 9);
  });
});

describe("it survives a real-sized image", () => {
  test("floods 512x512 without overflowing the stack", () => {
    // Recursive flood fill on a mostly-background image is a quarter of a
    // million frames deep.
    const width = 512;
    const height = 512;
    const data = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 255;
      data[i * 4 + 1] = 255;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }
    const result = knockoutBorder(data, width, height);
    assert.equal(result.cleared, width * height);
  });
});
