import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_STYLES } from "./styles.ts";
import { styleFor } from "./card-style.ts";
import { DEFAULT_BRAND } from "../brand/settings.ts";

/**
 * The bug this file exists for.
 *
 * Six styles shipped that were six backgrounds and nothing else. On the Price
 * History card `sweep` rendered byte-for-byte identical to `studio`, because
 * it fell back to the dark palette whenever the draft carried no shirt colour,
 * which is every template but one. `spotlight` differed from `studio` by
 * eighty bytes of PNG. A style the reviewer cannot tell from another style is
 * not a style, it is a menu entry.
 */
const AXES = [
  "from", "to", "ink", "titleTone", "titleCase", "titleScale",
  "photo", "headRule", "accentOnField",
] as const;

function fingerprint(key: string): string {
  const s = styleFor(key as never, DEFAULT_BRAND);
  const chart = `${s.chart.stroke}/${s.chart.dots}/${s.chart.fill}/${s.chart.baseline}`;
  return AXES.map((a) => String(s[a])).join("|") + "|" + chart;
}

test("no two card styles render the same card", () => {
  const seen = new Map<string, string>();
  for (const { key } of CARD_STYLES) {
    const print = fingerprint(key);
    const clash = seen.get(print);
    assert.equal(clash, undefined, `${key} is identical to ${clash}`);
    seen.set(print, key);
  }
});

test("every style differs from the default on more than its background", () => {
  // Two near-black gradients are not a difference anyone can see, so each
  // style has to move at least one axis that is not `from` or `to`.
  const base = styleFor("studio" as never, DEFAULT_BRAND);
  for (const { key } of CARD_STYLES) {
    if (key === "studio") continue;
    const s = styleFor(key as never, DEFAULT_BRAND);
    const moved = AXES.filter((a) => a !== "from" && a !== "to").some(
      (a) => String(s[a]) !== String(base[a]),
    );
    const chartMoved =
      s.chart.stroke !== base.chart.stroke ||
      s.chart.dots !== base.chart.dots ||
      s.chart.fill !== base.chart.fill ||
      s.chart.baseline !== base.chart.baseline;
    assert.ok(moved || chartMoved, `${key} only changes the backdrop`);
  }
});

test("sweep tints even when the draft carries no shirt colour", () => {
  // The exact failure: no shirt colour used to mean "return the dark palette",
  // which made Sweep a second copy of Studio on every card but one.
  const sweep = styleFor("sweep" as never, DEFAULT_BRAND);
  const studio = styleFor("studio" as never, DEFAULT_BRAND);
  assert.notEqual(sweep.from, studio.from);
});

test("the tinted style never sets brand green on its own field", () => {
  assert.equal(styleFor("sweep" as never, DEFAULT_BRAND).accentOnField, false);
});
