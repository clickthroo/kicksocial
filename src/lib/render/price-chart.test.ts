import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { axisDates, labelAbove, labelAnchor, plotPoints, plotted, priceLineSvg } from "./price-chart.ts";

const BOX = { width: 800, height: 300, padX: 40, padY: 40 };

/** The mockup's own series, so the chart that was signed off is the test. */
const MOCKUP = [166.99, 237.99, 332.99, 237.99, 276.99, 230.99];

describe("where the points land", () => {
  test("first and last sit on the padding, not on the edge", () => {
    const pts = plotPoints(MOCKUP, BOX);
    assert.equal(pts[0].x, 40);
    assert.equal(pts[pts.length - 1].x, 760);
  });

  test("the dearest sale is at the top and the cheapest at the bottom", () => {
    const pts = plotPoints(MOCKUP, BOX);
    assert.equal(pts[2].y, 40, "332.99 should sit on the top padding");
    assert.equal(pts[0].y, 260, "166.99 should sit on the bottom padding");
  });

  /** Six sales at one price is a real shape, and dividing by its zero span
   *  would put every dot at NaN - a chart that renders as nothing at all. */
  test("a flat series draws a flat line rather than nothing", () => {
    const pts = plotPoints([200, 200, 200], BOX);
    assert.ok(pts.every((p) => Number.isFinite(p.y)));
    assert.equal(new Set(pts.map((p) => p.y)).size, 1);
  });

  test("one point and no points do not throw", () => {
    assert.equal(plotPoints([], BOX).length, 0);
    assert.equal(plotPoints([200], BOX)[0].x, 400);
  });
});

describe("which side the price is printed on", () => {
  /**
   * Checked against the approved mockup point by point. A label on the wrong
   * side lands inside the peak or the trough it belongs to, over the line.
   */
  test("matches the mockup: below at the lows, above everywhere else", () => {
    assert.deepEqual(labelAbove(MOCKUP), [false, true, true, false, true, false]);
  });

  test("a rise labels everything above except the first point", () => {
    assert.deepEqual(labelAbove([10, 20, 30]), [false, true, true]);
  });

  test("a flat run labels one way rather than alternating for no reason", () => {
    assert.deepEqual(labelAbove([50, 50, 50]), [false, false, false]);
  });
});

describe("the dates under the chart", () => {
  test("day and month while the sales share a year", () => {
    assert.deepEqual(
      axisDates(["2026-06-10T00:00:00Z", "2026-09-22T00:00:00Z"]),
      ["10 Jun", "22 Sep"],
    );
  });

  /**
   * The failure this prevents: three years of sales all labelled "10 Jun",
   * which reads as three sales in one week.
   */
  test("month and year once they do not", () => {
    assert.deepEqual(
      axisDates(["2024-06-10T00:00:00Z", "2026-06-11T00:00:00Z"]),
      ["Jun 24", "Jun 26"],
    );
  });

  test("an unreadable date is blank, not 'Invalid Date'", () => {
    assert.deepEqual(axisDates(["nonsense"]), [""]);
  });
});

describe("the drawn line", () => {
  const style = { colour: "#12a862", surface: "#f4f1ea", stroke: 5, dot: 10 };

  test("is a data URI with one dot per sale", () => {
    const uri = priceLineSvg(plotPoints(MOCKUP, BOX), BOX, style);
    assert.ok(uri?.startsWith("data:image/svg+xml;base64,"));
    const svg = Buffer.from(uri!.split(",")[1], "base64").toString();
    assert.equal(svg.match(/<circle/g)?.length, MOCKUP.length);
  });

  test("marks the latest sale by size, so colour is never the only cue", () => {
    const uri = priceLineSvg(plotPoints(MOCKUP, BOX), BOX, style)!;
    const svg = Buffer.from(uri.split(",")[1], "base64").toString();
    const radii = [...svg.matchAll(/r="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(radii[radii.length - 1] > radii[0]);
  });

  test("a single sale draws no line at all rather than a dot in space", () => {
    assert.equal(priceLineSvg(plotPoints([200], BOX), BOX, style), null);
  });
});

describe("keeping a label off the line it belongs to", () => {
  /**
   * The bug this exists for. A price label is a box about half the distance to
   * the next point wide, so on a steep climb the line goes straight through
   * the half of it that overhangs - "£184.99" was printed with the line
   * crossing it. Anchoring to the highest the line reaches under the label,
   * rather than to the dot, lifts it clear.
   */
  test("a label above a steep climb hangs off the climb, not the dot", () => {
    const pts = plotPoints([100, 200, 900], BOX);
    const anchor = labelAnchor(pts, 1, true, 0.5);
    assert.ok(anchor < pts[1].y, "should be lifted above its own point");
    assert.ok(anchor > pts[2].y, "but not all the way up to the next one");
  });

  test("a label below a dip is pushed under the dip", () => {
    const pts = plotPoints([900, 200, 100], BOX);
    const anchor = labelAnchor(pts, 1, false, 0.5);
    assert.ok(anchor > pts[1].y);
  });

  /** On a flat run there is nothing to clear, so the label stays put. */
  test("a flat line leaves the label on its own point", () => {
    const pts = plotPoints([200, 200, 200], BOX);
    assert.equal(labelAnchor(pts, 1, true, 0.5), pts[1].y);
  });

  test("a narrow label reaches less far, so it is lifted less", () => {
    const pts = plotPoints([100, 200, 900], BOX);
    const wide = labelAnchor(pts, 1, true, 0.5);
    const narrow = labelAnchor(pts, 1, true, 0.15);
    assert.ok(narrow > wide);
  });

  test("plotted carries the anchor for every point", () => {
    const marks = plotted(MOCKUP, BOX, 0.5);
    assert.equal(marks.length, MOCKUP.length);
    assert.ok(marks.every((m) => Number.isFinite(m.anchorY)));
  });
});
