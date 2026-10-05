import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The stylesheet, checked rather than eyeballed.
 *
 * Colour is the one part of a design system where "it looks fine to me" is not
 * evidence: the person choosing the value is looking at a calibrated screen
 * indoors, and the person reading it is outside holding a phone. The light
 * palette shipped for months with the primary button's own label at 3.09:1,
 * every warning at 2.11:1 and every error at 3.36:1, and nothing caught it
 * because nothing was looking.
 *
 * So the ratios are computed from the stylesheet itself. A future tweak to a
 * hex value either clears the bar or fails here.
 */
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "globals.css"),
  "utf8",
);

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** The custom properties in force for a theme, read off the sheet. */
function palette(theme: "dark" | "light"): Record<string, string> {
  // The dark values are the root defaults; the light ones override them inside
  // the prefers-color-scheme block.
  const rootEnd = css.indexOf("@media (prefers-color-scheme: light)");
  const root = css.slice(0, rootEnd);
  const lightBlock = css.slice(rootEnd, css.indexOf("* { box-sizing"));
  const read = (text: string): Record<string, string> =>
    Object.fromEntries(
      [...text.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!]),
    );
  return theme === "dark" ? read(root) : { ...read(root), ...read(lightBlock) };
}

describe("colour contrast, in both themes", () => {
  for (const theme of ["dark", "light"] as const) {
    describe(theme, () => {
      const p = palette(theme);

      test("the palette was found at all", () => {
        // A silent parse failure here would make every assertion below vacuous.
        for (const key of ["bg", "surface", "surface-2", "text", "muted", "accent", "accent-ink", "danger", "warn", "control-border", "ring"]) {
          assert.ok(p[key], `--${key} missing from the ${theme} palette`);
        }
      });

      test("body text clears AA on every surface", () => {
        for (const bg of ["bg", "surface", "surface-2"]) {
          assert.ok(
            contrast(p.text!, p[bg]!) >= 4.5,
            `text on ${bg} is ${contrast(p.text!, p[bg]!).toFixed(2)}:1`,
          );
        }
      });

      test("muted text clears AA, because most of the tool is muted text", () => {
        // Hints, counts, timestamps, source lines, the shirt meta on every
        // picker row. If this fails the whole interface fails.
        for (const bg of ["bg", "surface", "surface-2"]) {
          assert.ok(
            contrast(p.muted!, p[bg]!) >= 4.5,
            `muted on ${bg} is ${contrast(p.muted!, p[bg]!).toFixed(2)}:1`,
          );
        }
      });

      test("the accent clears AA as text", () => {
        // It is a price, a verify link and a confirmed state, all at 13-14px.
        assert.ok(
          contrast(p.accent!, p.surface!) >= 4.5,
          `accent on surface is ${contrast(p.accent!, p.surface!).toFixed(2)}:1`,
        );
      });

      test("the label on the primary button clears AA against it", () => {
        // Approve is the single most important control in the tool, and in
        // light mode its own label used to sit at 3.09:1.
        assert.ok(
          contrast(p["accent-ink"]!, p.accent!) >= 4.5,
          `accent-ink on accent is ${contrast(p["accent-ink"]!, p.accent!).toFixed(2)}:1`,
        );
      });

      test("warnings and errors clear AA", () => {
        // These carry "this draft may be stale", "that is not an image file"
        // and "the credit belongs to the old photograph". A warning nobody can
        // read is worse than no warning, because it occupies the space one
        // would have had.
        for (const key of ["warn", "danger"]) {
          assert.ok(
            contrast(p[key]!, p.surface!) >= 4.5,
            `${key} on surface is ${contrast(p[key]!, p.surface!).toFixed(2)}:1`,
          );
        }
      });

      test("a form field's own outline clears 3:1 (WCAG 1.4.11)", () => {
        // An input is identified by nothing except its border. The card
        // hairline was doing this job at 1.29:1.
        for (const bg of ["surface", "surface-2"]) {
          assert.ok(
            contrast(p["control-border"]!, p[bg]!) >= 3,
            `control-border on ${bg} is ${contrast(p["control-border"]!, p[bg]!).toFixed(2)}:1`,
          );
        }
      });

      test("the focus ring is visible and is not the accent", () => {
        assert.ok(contrast(p.ring!, p.surface!) >= 3);
        assert.notEqual(
          p.ring,
          p.accent,
          "a focus ring the colour of the selected state cannot be told apart from one",
        );
      });
    });
  }
});

describe("the things that make it usable with a thumb", () => {
  test("there is a visible focus style", () => {
    // WCAG 2.4.7. Every custom background in this sheet paints over whatever
    // ring the browser would have drawn, so without this, tabbing moves an
    // invisible cursor.
    assert.match(css, /:focus-visible\s*\{[^}]*outline:/);
  });

  test("motion is dropped when the system asks for it", () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  });

  test("form fields are 16px, so iOS does not zoom the page on focus", () => {
    // The bug that threw the layout sideways mid-typing and left the right
    // edge of the form off screen.
    assert.match(css, /--field-size:\s*16px/);
    const fields = [...css.matchAll(/\.pub-url\s*\{([^}]*)\}/g)].map((m) => m[1]!);
    assert.ok(fields.length > 0);
    for (const rule of fields) {
      assert.match(rule, /font-size:\s*var\(--field-size\)/);
    }
  });

  test("no control is left below the 24px WCAG floor", () => {
    // Checked through the tokens rather than by measuring every rule: the
    // floor is only a floor if the values it is built from stay above it.
    const tap = /--tap:\s*(\d+)px/.exec(css);
    const sm = /--tap-sm:\s*(\d+)px/.exec(css);
    const xs = /--tap-xs:\s*(\d+)px/.exec(css);
    assert.ok(tap && sm && xs, "the tap scale is missing");
    assert.ok(Number(tap![1]) >= 44, "primary controls want 44px, per Apple's guidance");
    assert.ok(Number(sm![1]) >= 32);
    assert.ok(Number(xs![1]) >= 24, "WCAG 2.2 2.5.8 sets 24x24 as the absolute minimum");
  });

  test("nothing is typeset below 12px, bar the one documented exception", () => {
    // 10px and 11px were in use for status pills, timestamps, credits and
    // source lines, all of which are read at arm's length on a phone.
    //
    // The exception is `pre.raw`: a JSON dump inside a collapsed fold, scanned
    // rather than read, which scrolls sideways. Larger type there means more
    // scrolling and fewer keys visible at once. It is allowed to sit just
    // under, and named here so a second exception has to be argued for rather
    // than slipped in.
    const sizes = [...css.matchAll(/font-size:\s*([0-9.]+)px/g)].map((m) => Number(m[1]));
    const tooSmall = sizes.filter((s) => s < 11.5);
    assert.deepEqual(tooSmall, [], `found ${tooSmall.length} declarations below 11.5px`);
    assert.equal(sizes.filter((s) => s < 12).length, 1, "only pre.raw may sit under 12px");
  });
});
