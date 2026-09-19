import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseSize,
  normaliseCondition,
  variantKey,
  compare,
  discountPct,
  scarcityOf,
  scarcityLine,
  qualifies,
  subjectRefFor,
  DEFAULT_VALUE_PICK_CONFIG as CONFIG,
  type SaleRow,
} from "./value-pick.ts";

const NOW = new Date("2026-09-19T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const sale = (price: number, ago: number): SaleRow => ({
  product_id: "p1",
  listing_id: null,
  price_cents: price,
  size: "L",
  condition: "Very Good",
  sold_at: daysAgo(ago),
});

describe("matching identical shirts", () => {
  test("accepts the sizes both tables actually use", () => {
    for (const s of ["xs", " s ", "M", "l", "XL", "xxl", "3XL"]) {
      assert.ok(normaliseSize(s), s);
    }
  });

  test("refuses the junk in listings.size, because a near-match is a different shirt", () => {
    // `listings.size` also holds these, and the whole post rests on the two
    // shirts being identical.
    for (const s of ["Default Title", "M, L", "Not specified", "N/A", "Medium", "13-14 Years", null, ""]) {
      assert.equal(normaliseSize(s), null, String(s));
    }
  });

  test("condition matches case-insensitively", () => {
    assert.equal(normaliseCondition(" Very Good "), "very good");
    assert.equal(normaliseCondition(null), null);
  });

  test("the key is product, size and condition together", () => {
    assert.notEqual(variantKey("p1", "L", "very good"), variantKey("p1", "M", "very good"));
    assert.notEqual(variantKey("p1", "L", "very good"), variantKey("p1", "L", "good"));
  });
});

describe("what the shirt actually trades at", () => {
  test("uses the median, not the most recent sale", () => {
    // The 1990-91 England XL: last sale £325.99, the other £190.99. Anchoring
    // on the latest picks whichever number flatters the post.
    const c = compare([sale(32_599, 28), sale(19_099, 60)], CONFIG, NOW)!;
    assert.equal(c.medianCents, 25_849);
    assert.equal(c.lowestCents, 19_099);
    assert.equal(c.highestCents, 32_599);
    assert.equal(c.sales, 2);
  });

  test("ignores sales older than the window", () => {
    assert.equal(compare([sale(20_000, 400)], CONFIG, NOW), null);
    assert.equal(compare([sale(20_000, 400), sale(10_000, 10)], CONFIG, NOW)!.sales, 1);
  });

  test("reports the spread as a share of the median", () => {
    const c = compare([sale(10_000, 10), sale(20_000, 20)], CONFIG, NOW)!;
    assert.equal(c.medianCents, 15_000);
    assert.equal(c.spreadPct, 66.7);
  });

  test("no usable sales at all", () => {
    assert.equal(compare([], CONFIG, NOW), null);
  });
});

describe("the discount is on what a buyer pays", () => {
  test("straightforward", () => {
    assert.equal(discountPct(15_000, 25_000), 40);
    assert.equal(discountPct(25_000, 25_000), 0);
  });

  test("a price above the median is not a discount", () => {
    assert.ok(discountPct(30_000, 25_000) < 0);
  });
});

describe("the spread guard", () => {
  const wide = () => compare([sale(32_599, 28), sale(19_099, 60)], CONFIG, NOW)!;
  const tight = () => compare([sale(27_699, 16), sale(25_099, 30), sale(23_799, 44)], CONFIG, NOW)!;

  test("refuses when the shirt trades over a wider range than the discount claimed", () => {
    // £191 to £326 is a 52% spread. "25% below" is then a fact about which
    // sale you stood next to, not about this listing.
    const c = wide();
    const discount = discountPct(19_279, c.medianCents);
    const verdict = qualifies(c, discount, CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /spread against a \d+% discount/);
  });

  test("allows a real discount on a shirt that trades consistently", () => {
    const c = tight();
    const discount = discountPct(15_431, c.medianCents);
    assert.equal(qualifies(c, discount, CONFIG).ok, true);
  });

  test("one recorded sale is an anecdote, not a price", () => {
    const c = compare([sale(25_000, 10)], CONFIG, NOW)!;
    const verdict = qualifies(c, discountPct(10_000, c.medianCents), CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /only 1 recorded sale/);
  });

  test("a small discount is not a Value Pick", () => {
    const c = tight();
    const verdict = qualifies(c, discountPct(24_000, c.medianCents), CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /under the 20% bar/);
  });
});

describe("the one-off claim is graded, not asserted", () => {
  test("the only live listing of the product", () => {
    assert.equal(scarcityOf(1, 1), "only-on-kickio");
    assert.equal(scarcityLine("only-on-kickio", "L", "very good"), "The only one on Kickio.");
  });

  test("the only one in this size and condition, but not the only one", () => {
    // The 1990-91 England XL: one in XL Very Good, two listings of the product.
    assert.equal(scarcityOf(1, 2), "only-this-variant");
    assert.match(scarcityLine("only-this-variant", "XL", "very good")!, /only one on Kickio in XL, very good/);
  });

  test("two identical listings means no claim at all", () => {
    // The 1988-90 Netherlands L in Very Good has two live listings at the same
    // price. "A one-off" would simply be false.
    assert.equal(scarcityOf(2, 5), "several");
    assert.equal(scarcityLine("several", "L", "very good"), null);
  });
});

describe("subject refs", () => {
  test("one variant, posted once", () => {
    assert.equal(subjectRefFor("p1", "L", "very good"), "value:p1|L|very good");
    assert.notEqual(subjectRefFor("p1", "L", "very good"), subjectRefFor("p1", "M", "very good"));
  });
});
