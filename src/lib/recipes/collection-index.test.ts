import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  median,
  valueAt,
  buildIndex,
  qualifies,
  subjectRefFor,
  DEFAULT_COLLECTION_INDEX_CONFIG as CONFIG,
  type SaleRow,
  type HoldingRow,
} from "./collection-index.ts";

const NOW = new Date("2026-09-19T00:00:00Z");
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const sale = (productId: string, price: number, daysAgo: number): SaleRow => ({
  product_id: productId,
  price_cents: price,
  sold_at: daysBefore(daysAgo),
});

const held = (productId: string, daysAgo: number): HoldingRow => ({
  user_id: "u1",
  product_id: productId,
  created_at: daysBefore(daysAgo),
});

/** n shirts, each held a year, each with one sale before the window and one now. */
const basket = (n: number, before: number, after: number) => {
  const holdings: HoldingRow[] = [];
  const sales = new Map<string, SaleRow[]>();
  for (let i = 0; i < n; i++) {
    const id = `p${i}`;
    holdings.push(held(id, 365));
    sales.set(id, [sale(id, before, 300), sale(id, after, 10)]);
  }
  return { holdings, sales };
};

describe("median", () => {
  test("odd, even, single, empty", () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 3);
    assert.equal(median([7]), 7);
    assert.equal(median([]), null);
  });

  test("ignores values that are not numbers", () => {
    assert.equal(median([1, Number.NaN, 3]), 2);
  });
});

describe("what a shirt was worth on a date", () => {
  test("one recorded sale is enough - that is the whole stock of evidence for most shirts", () => {
    assert.equal(valueAt([sale("p", 10_000, 30)], NOW), 10_000);
  });

  test("where more exist they are used, medianed to steady one odd sale", () => {
    const sales = [sale("p", 10_000, 30), sale("p", 12_000, 20), sale("p", 90_000, 10)];
    // The latest alone would say £900. The median of the last three says £120.
    assert.equal(valueAt(sales, NOW), 12_000);
  });

  test("only sales on or before the date count, so a later sale cannot leak backwards", () => {
    // This is the guard that makes both ends of the window comparable.
    const sales = [sale("p", 8_700, 10)];
    assert.equal(valueAt(sales, new Date(NOW.getTime() - 20 * 86_400_000)), null);
    assert.equal(valueAt(sales, NOW), 8_700);
  });

  test("no sales at all is null, never a guess", () => {
    assert.equal(valueAt([], NOW), null);
  });
});

describe("building the index", () => {
  test("rebases to 100 and reports the move", () => {
    const { holdings, sales } = basket(10, 10_000, 12_000);
    const index = buildIndex(holdings, sales, CONFIG, NOW)!;
    assert.equal(index.points[0].index, 100);
    assert.equal(index.points[index.points.length - 1].index, 120);
    assert.equal(index.pctChange, 20);
    assert.equal(index.basket, 10);
  });

  test("a shirt bought inside the window is excluded, so buying is never growth", () => {
    const { holdings, sales } = basket(10, 10_000, 10_000);
    const newId = "recent";
    holdings.push(held(newId, 5));
    sales.set(newId, [sale(newId, 500_000, 4)]);

    const index = buildIndex(holdings, sales, CONFIG, NOW)!;
    assert.equal(index.basket, 10);
    assert.equal(index.excludedTooNew, 1);
    // A £5,000 shirt arriving would have been a 500% "gain".
    assert.equal(index.pctChange, 0);
  });

  test("a shirt whose first sale lands mid-window is excluded", () => {
    // The bug that sank the stored total: £87 to £142.99 was a valuation
    // switching basis, not a market move. A shirt with no opening value has
    // no honest starting point, so it cannot be in the index.
    const { holdings, sales } = basket(10, 10_000, 10_000);
    const late = "late";
    holdings.push(held(late, 365));
    sales.set(late, [sale(late, 400_000, 5)]);

    const index = buildIndex(holdings, sales, CONFIG, NOW)!;
    assert.equal(index.basket, 10);
    assert.equal(index.excludedNoSale, 1);
    assert.equal(index.pctChange, 0);
  });

  test("the basket is identical at both ends", () => {
    const { holdings, sales } = basket(12, 5_000, 6_000);
    const index = buildIndex(holdings, sales, CONFIG, NOW)!;
    assert.equal(index.basket, 12);
    assert.equal(index.excludedNoSale, 0);
    assert.equal(index.excludedTooNew, 0);
  });

  test("falls as well as rises - the maths has no opinion", () => {
    const { holdings, sales } = basket(10, 20_000, 15_000);
    assert.equal(buildIndex(holdings, sales, CONFIG, NOW)!.pctChange, -25);
  });

  test("returns null when nothing is indexable", () => {
    assert.equal(buildIndex([held("p", 5)], new Map(), CONFIG, NOW), null);
  });

  test("draws the number of points asked for, oldest first", () => {
    const { holdings, sales } = basket(10, 10_000, 11_000);
    const index = buildIndex(holdings, sales, CONFIG, NOW)!;
    assert.equal(index.points.length, CONFIG.points);
    assert.ok(index.points[0].day < index.points[index.points.length - 1].day);
  });
});

describe("qualifying", () => {
  const index = (over: Record<string, unknown>) =>
    ({ basket: 10, pctChange: 20, from: "2026-03-21", ...over }) as never;

  test("a real gain on a real basket passes", () => {
    assert.equal(qualifies(index({}), CONFIG).ok, true);
  });

  test("one shirt moving is not an index", () => {
    const verdict = qualifies(index({ basket: 2 }), CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /only 2 shirts/);
  });

  test("a decline is refused, and the run log says so rather than hiding it", () => {
    const verdict = qualifies(index({ pctChange: -8 }), CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /-8% over the window, not up/);
  });

  test("a flat collection is not a story", () => {
    assert.equal(qualifies(index({ pctChange: 0 }), CONFIG).ok, false);
    assert.equal(qualifies(index({ pctChange: 1.2 }), CONFIG).ok, false);
  });
});

describe("subject refs", () => {
  test("carry the move, so a collection that grows again can come back", () => {
    const u = "11111111-1111-1111-1111-111111111111";
    assert.notEqual(subjectRefFor(u, 12.5), subjectRefFor(u, 18.2));
  });

  test("still parse as this collector, so one cooldown covers every collector post", () => {
    const u = "11111111-1111-1111-1111-111111111111";
    assert.ok(subjectRefFor(u, 12.5).startsWith(`collector:${u}:`));
  });
});

describe("stale sales do not set today's price", () => {
  test("a sale from three seasons ago is carried forward, not blended", () => {
    // Medianing a 300-day-old sale with last week's put half of the "today"
    // price on a price from three seasons ago. Recent trade wins; where there
    // is none, the last known price carries forward, as any index does.
    const sales = [sale("p", 10_000, 300), sale("p", 12_000, 10)];
    assert.equal(valueAt(sales, NOW), 12_000);
  });

  test("with nothing recent, the last known price stands", () => {
    const sales = [sale("p", 9_000, 400), sale("p", 10_000, 300)];
    assert.equal(valueAt(sales, NOW), 10_000);
  });

  test("several recent sales are still medianed", () => {
    const sales = [sale("p", 10_000, 60), sale("p", 12_000, 40), sale("p", 90_000, 20)];
    assert.equal(valueAt(sales, NOW), 12_000);
  });
});
