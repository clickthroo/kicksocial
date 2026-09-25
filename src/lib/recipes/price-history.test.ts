import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_POINTS,
  MIN_SALES,
  chartSales,
  freshCount,
  isEligible,
  seasonLabel,
  shirtTitle,
} from "./price-history.ts";

const sale = (id: string, soldAt: string, price = 20_000) => ({
  id,
  sold_at: soldAt,
  price_cents: price,
});

describe("which sales the chart draws", () => {
  test("oldest first, so the line reads left to right", () => {
    const picked = chartSales([
      sale("c", "2026-03-01T00:00:00Z"),
      sale("a", "2026-01-01T00:00:00Z"),
      sale("b", "2026-02-01T00:00:00Z"),
    ]);
    assert.deepEqual(picked.map((s) => s.id), ["a", "b", "c"]);
  });

  /**
   * The cap is the card's, not the data's: every point wears its own price, and
   * past six the labels run into each other. A shirt with thirty sales shows
   * the most recent six - the six that are still about today's market.
   */
  test("keeps the most recent six when there are more", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      sale(`s${i}`, `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
    );
    const picked = chartSales(many);
    assert.equal(picked.length, MAX_POINTS);
    assert.equal(picked[picked.length - 1].id, "s29");
    assert.equal(picked[0].id, "s24");
  });

  /** A sale recorded with no price is a row, not a data point. */
  test("drops sales with no usable price", () => {
    const picked = chartSales([
      sale("ok", "2026-01-01T00:00:00Z", 15_000),
      sale("zero", "2026-01-02T00:00:00Z", 0),
      { id: "nan", sold_at: "2026-01-03T00:00:00Z", price_cents: Number.NaN },
    ]);
    assert.deepEqual(picked.map((s) => s.id), ["ok"]);
  });

  test("does not mutate what it was given", () => {
    const input = [sale("b", "2026-02-01T00:00:00Z"), sale("a", "2026-01-01T00:00:00Z")];
    chartSales(input);
    assert.deepEqual(input.map((s) => s.id), ["b", "a"]);
  });
});

describe("counting what is new since the last post", () => {
  /**
   * Counted against ids rather than a date deliberately. Kickio's sales data is
   * scraped, and a run started today routinely lands sales that happened months
   * ago - a date watermark would throw those away as "not fresh" when they are
   * exactly what changes the chart.
   */
  test("a sale that happened long ago still counts if the last post lacked it", () => {
    const seen = new Set(["a", "b"]);
    assert.equal(freshCount(["a", "b", "backfilled-from-2024"], seen), 1);
  });

  test("everything is new when the shirt has never been posted", () => {
    assert.equal(freshCount(["a", "b", "c"], new Set()), 3);
  });

  test("nothing is new when the last post had it all", () => {
    assert.equal(freshCount(["a", "b"], new Set(["a", "b", "c"])), 0);
  });
});

describe("whether a shirt can carry the post", () => {
  test("a shirt never posted needs six recorded sales", () => {
    assert.equal(isEligible(MIN_SALES, MIN_SALES, false), true);
    assert.equal(isEligible(MIN_SALES - 1, MIN_SALES - 1, false), false);
  });

  /**
   * The rule the whole feature turns on. Re-posting a shirt with one new sale
   * on the end is the same post again: same shape, nothing learned. Thirty
   * sales in total does not excuse five new ones.
   */
  test("a shirt posted before needs six the last post did not have", () => {
    assert.equal(isEligible(30, 5, true), false);
    assert.equal(isEligible(30, 6, true), true);
  });

  test("a long record does not carry a shirt back onto the list by itself", () => {
    assert.equal(isEligible(100, 0, true), false);
  });
});

describe("naming the shirt", () => {
  test("puts the player first where there is one", () => {
    assert.deepEqual(
      shirtTitle({ team: "Arsenal", season: "2005-06", shirt_type: "Away", player_name: "Henry 14" }),
      { lead: "Henry 14", main: "2005-06 Arsenal Away" },
    );
  });

  /** Kickio writes "Unknown" and "N/A" into these columns, and a card is a
   *  claim about a real object - so a placeholder is dropped, not printed. */
  test("drops placeholders rather than printing them as facts", () => {
    const { lead, main } = shirtTitle({
      team: "Arsenal",
      season: "Unknown",
      shirt_type: "Home",
      player_name: "N/A",
    });
    assert.equal(lead, null);
    assert.equal(main, "Arsenal Home");
  });

  test("never ends up with an empty name", () => {
    assert.equal(
      shirtTitle({ team: null, season: null, shirt_type: null, player_name: null }).main,
      "Football shirt",
    );
  });

  test("a season is written the way it is spoken", () => {
    assert.equal(seasonLabel("2005-06"), "2005/06");
    assert.equal(seasonLabel("1998-1999"), "1998/99");
    assert.equal(seasonLabel("Unknown"), null);
    assert.equal(seasonLabel(null), null);
  });
});
