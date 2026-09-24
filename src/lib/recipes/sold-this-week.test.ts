import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { showableSales, weekKey } from "./sold-this-week.ts";

/** Minimal shape - `showableSales` only reads `product_id`. */
const sale = (id: string, product: string | null) => ({ id, product_id: product });

const photos = new Map([
  ["p-england", "england.jpg"],
  ["p-atletico", "atletico.jpg"],
  ["p-barca", "barca.jpg"],
]);

describe("choosing which sales the card can show", () => {
  /**
   * The bug this exists for. A popular shirt sells more than once in a week and
   * sales_history is one row per SALE, so the same Atletico Madrid 1999-00
   * appeared in two tiles at the same price - which reads as a rendering fault
   * rather than as two genuine sales.
   */
  test("never shows the same product twice", () => {
    const picked = showableSales(
      [
        sale("s1", "p-england"),
        sale("s2", "p-atletico"),
        sale("s3", "p-atletico"),
        sale("s4", "p-barca"),
      ],
      photos,
    );
    assert.deepEqual(picked.map((s) => s.id), ["s1", "s2", "s4"]);
  });

  /**
   * Callers pass sales ordered by price descending, so the FIRST row for a
   * product is its dearest sale that week. Keeping a later one would quietly
   * understate the shirt.
   */
  test("keeps the first occurrence, which is the dearest", () => {
    const picked = showableSales(
      [sale("dearest", "p-atletico"), sale("cheaper", "p-atletico")],
      photos,
    );
    assert.deepEqual(picked.map((s) => s.id), ["dearest"]);
  });

  test("drops sales with no photo, because the card is photo-led", () => {
    const picked = showableSales(
      [sale("s1", "p-england"), sale("s2", "p-no-photo"), sale("s3", "p-barca")],
      photos,
    );
    assert.deepEqual(picked.map((s) => s.id), ["s1", "s3"]);
  });

  /**
   * Market-wide records from outside Kickio have no product behind them at
   * all. Two of them are not "the same product" and must not collapse into one.
   */
  test("sales with no product at all are dropped, not treated as equal", () => {
    const picked = showableSales([sale("s1", null), sale("s2", null)], photos);
    assert.deepEqual(picked, []);
  });

  test("nothing showable is empty, not a throw", () => {
    assert.deepEqual(showableSales([], photos), []);
    assert.deepEqual(showableSales([sale("s1", "p-england")], new Map()), []);
  });

  /**
   * The photos array the template draws is index-aligned with `featured`, so
   * every sale that survives must have a photo to pair with. If this ever
   * failed, a real price would print under the wrong shirt.
   */
  test("every survivor has a photo, so the index alignment holds", () => {
    const picked = showableSales(
      [sale("s1", "p-england"), sale("s2", "p-no-photo"), sale("s3", "p-barca")],
      photos,
    );
    for (const s of picked) {
      assert.ok(s.product_id && photos.has(s.product_id), `${s.id} has no photo`);
    }
  });
});

describe("the week a roundup belongs to", () => {
  test("is stable across a week and changes between them", () => {
    const wed = weekKey(new Date("2026-09-23T12:00:00Z"));
    const fri = weekKey(new Date("2026-09-25T12:00:00Z"));
    const next = weekKey(new Date("2026-09-30T12:00:00Z"));
    assert.equal(wed, fri);
    assert.notEqual(fri, next);
    assert.match(wed, /^\d{4}-W\d{2}$/);
  });
});
