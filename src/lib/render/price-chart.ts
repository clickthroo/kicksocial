/**
 * Geometry and drawing for the Price History chart.
 *
 * Separate from templates.tsx for two reasons: the bare node test runner cannot
 * load `.tsx`, and where a label sits is the part most likely to be quietly
 * wrong - a price printed over the line it belongs to is not something a type
 * checker or a passing render will catch.
 *
 * The line and the dots are drawn as an SVG data URI in an `<img>`, the way
 * every other chart here is, because Satori renders images reliably and its
 * inline-SVG support is patchier. The TEXT is not in that SVG: resvg would
 * have to find a font of its own for it, and Satori is already holding the
 * right one. So the labels are laid out as absolutely positioned elements
 * against the same coordinates, which is why those coordinates are returned
 * rather than kept inside the drawing code.
 */

export interface Point {
  x: number;
  y: number;
}

export interface PlottedPoint extends Point {
  /** Where this point's price label goes. See `labelAbove`. */
  above: boolean;
  /**
   * The height the label hangs off, which is not always the dot's own.
   *
   * A label is a box roughly half the distance to the next point wide, so on a
   * steep leg the line climbs through the half of it that overhangs. Anchoring
   * to the highest (or, below, the lowest) the line reaches within that
   * overhang keeps the label clear of the line without pushing every label
   * miles from its dot. See `labelAnchor`.
   */
  anchorY: number;
}

export interface ChartBox {
  width: number;
  height: number;
  /** Room for the dot's ring and, above or below it, its price. */
  padX: number;
  padY: number;
}

/**
 * Point positions inside the box, left to right, oldest first.
 *
 * Evenly spaced rather than spaced by date. These are six sales, not a time
 * series sampled at intervals: spacing by date puts three of them on top of
 * each other whenever a shirt sells twice in a week, and the dates are printed
 * underneath anyway. It is a sequence of results, and it is drawn as one.
 */
export function plotPoints(values: readonly number[], box: ChartBox): Point[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const usableW = box.width - box.padX * 2;
  const usableH = box.height - box.padY * 2;

  return values.map((value, i) => ({
    x: values.length === 1 ? box.width / 2 : box.padX + (i / (values.length - 1)) * usableW,
    y: box.padY + (1 - (value - min) / span) * usableH,
  }));
}

/**
 * Which side of its dot each price is printed on.
 *
 * Below when the point is a low, above otherwise - so a label never lands
 * inside the V or the peak it belongs to, and the line stays unbroken. Flat
 * runs count as lows, which keeps a series that never moves reading as one row
 * of prices under one straight line rather than alternating for no reason.
 */
export function labelAbove(values: readonly number[]): boolean[] {
  return values.map((value, i) => {
    const before = i > 0 ? values[i - 1] : null;
    const after = i < values.length - 1 ? values[i + 1] : null;
    const isLow =
      (before === null || value <= before) && (after === null || value <= after);
    return !isLow;
  });
}

/**
 * How far the line has climbed or fallen by the label's own edge.
 *
 * `reach` is the label's half-width as a fraction of the gap between points -
 * so 0.5 means the label stops halfway to its neighbour. Straight-line
 * interpolation is exact here, because the chart draws straight segments.
 */
export function labelAnchor(
  points: readonly Point[],
  index: number,
  above: boolean,
  reach: number,
): number {
  const { y } = points[index];
  const edges = [y];
  const towards = (other: Point | undefined) => {
    if (other) edges.push(y + (other.y - y) * Math.min(reach, 1));
  };
  towards(points[index - 1]);
  towards(points[index + 1]);
  return above ? Math.min(...edges) : Math.max(...edges);
}

export function plotted(
  values: readonly number[],
  box: ChartBox,
  /** Label half-width as a fraction of the gap between two points. */
  reach = 0.5,
): PlottedPoint[] {
  const sides = labelAbove(values);
  const points = plotPoints(values, box);
  return points.map((p, i) => ({
    ...p,
    above: sides[i],
    anchorY: labelAnchor(points, i, sides[i], reach),
  }));
}

/**
 * Dates as they are read out loud: "10 Jun" within one year, "Jun 24" across
 * several. A chart spanning three years that labels every point "10 Jun" is
 * worse than useless - it implies they all happened in the same season.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function axisDates(soldAt: readonly string[]): string[] {
  const dates = soldAt.map((iso) => new Date(iso));
  const valid = dates.filter((d) => !Number.isNaN(d.getTime()));
  const sameYear = new Set(valid.map((d) => d.getUTCFullYear())).size <= 1;
  return dates.map((d) => {
    if (Number.isNaN(d.getTime())) return "";
    // Spelled out here rather than taken from `toLocaleString`, which gives
    // "Sept" for September under a current ICU and "Sep" under an older one -
    // so the same card would label itself differently depending on which Node
    // the render happened to run on.
    const month = MONTHS[d.getUTCMonth()];
    return sameYear
      ? `${d.getUTCDate()} ${month}`
      : `${month} ${String(d.getUTCFullYear()).slice(-2)}`;
  });
}

export interface LineStyle {
  colour: string;
  /** What the dots' rings are cut out of, so they read against the line. */
  surface: string;
  stroke: number;
  dot: number;
}

/**
 * The line and its dots, as a data URI.
 *
 * No axes and no gridlines on purpose: every value is printed beside its own
 * dot, so a scale to read them against would be furniture. The last dot is
 * drawn larger - it is the one the card calls "Latest", and it is marked by
 * size as well as by that word, never by colour alone.
 */
export function priceLineSvg(points: readonly Point[], box: ChartBox, style: LineStyle): string | null {
  if (points.length < 2) return null;

  const path = points
    .map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  const dots = points
    .map(({ x, y }, i) => {
      const last = i === points.length - 1;
      const r = last ? style.dot * 1.25 : style.dot;
      return (
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" ` +
        `fill="${style.colour}" stroke="${style.surface}" stroke-width="${(style.stroke * 1.4).toFixed(1)}"/>`
      );
    })
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" ` +
    `viewBox="0 0 ${box.width} ${box.height}">` +
    `<path d="${path}" fill="none" stroke="${style.colour}" stroke-width="${style.stroke}" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
