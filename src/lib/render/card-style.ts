/**
 * What each card style actually is.
 *
 * Split out of templates.tsx so it can be tested. Node's type stripping does
 * not read .tsx, so anything living beside JSX cannot be imported by a test -
 * which is how six styles shipped with two of them identical and nothing to
 * catch it.
 */
import type { Brand } from "../brand/settings.ts";
import type { CardStyle } from "./styles.ts";

export function hexToRgb(hex: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Blend two hex colours. `t` is how far to travel from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const pa = hexToRgb(a)?.split(",").map(Number);
  const pb = hexToRgb(b)?.split(",").map(Number);
  if (!pa || !pb) return a;
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The same colour at a given opacity, for the wash under a chart line.
 *
 * Returns null rather than a half-working colour when the input is not a plain
 * six-digit hex, because an `rgba(undefined)` in an SVG is a chart that does
 * not render at all rather than one that renders plainly.
 */
export function withAlpha(hex: string, alpha: number): string | null {
  const rgb = hexToRgb(hex);
  return rgb ? `rgba(${rgb},${alpha})` : null;
}

export const STUDIO = "#0b0c0e";
export const STUDIO_LIFT = "#1c1f24";
export const STUDIO_INK = "#f6f7f9";
export const STUDIO_MUTED = "#8b95a3";
export const PAPER = "#f2efe9";
export const PAPER_INK = "#14181d";
export const PAPER_MUTED = "#6f6b64";

export interface ChartLook {
  /** Multiplier on the line weight. */
  stroke: number;
  dots: "solid" | "open" | "none";
  /** Opacity of the wash under the line, 0 for none. */
  fill: number;
  baseline: boolean;
}

export interface Style {
  /** Top and bottom of the backdrop sweep. */
  from: string;
  to: string;
  ink: string;
  muted: string;
  accent: string;
  /** Border colour for the attribute chips and rules. */
  hairline: string;
  /**
   * How this style draws a price chart, and how it sets a headline.
   *
   * Added because the six styles were six backgrounds and nothing else: on the
   * Price History card, `sweep` rendered byte-for-byte identical to `studio`
   * and `spotlight` differed by eighty bytes of PNG. Background alone is not a
   * style when every background is near-black.
   */
  chart: ChartLook;
  /** Green headline, or the card's own ink. Half the difference at a glance. */
  titleTone: "accent" | "ink";
  /**
   * Whether brand green is readable against this card's field. False on the
   * tinted style, where the field is already green: green on green is not a
   * style, it is an unreadable line.
   */
  accentOnField: boolean;
  titleCase: "normal" | "upper";
  /** A hairline under the header block, for the styles built on rules. */
  headRule: boolean;
  /** Share of the portrait frame the photo takes. */
  stage: number;
  /** Inset around the photo. */
  inset: number;
  /**
   * How the photo is presented. This is what actually separates the styles -
   * palette alone produced six cards that looked like the same card, because
   * Kickio's photos carry their own pale background and that bright rectangle
   * dominates whatever is behind it.
   *
   *   plate  - rounded white panel, inset on the field
   *   round  - the same panel clipped to a circle
   *   bare   - no panel; on a light field the photo's own background disappears
   *   keyline- large, thin-bordered, poster-like
   *   bleed  - fills the frame, type over a scrim
   */
  photo: "plate" | "round" | "bare" | "keyline" | "bleed";
  /** Multiplier on the title size. */
  titleScale: number;
}

export function styleFor(key: CardStyle, brand: Brand, shirt?: { hex: string; deep: string }): Style {
  const dark: Style = {
    from: STUDIO_LIFT,
    to: STUDIO,
    ink: STUDIO_INK,
    muted: STUDIO_MUTED,
    accent: brand.accent,
    hairline: "rgba(246,247,249,0.3)",
    chart: { stroke: 1, dots: "solid", fill: 0, baseline: false },
    titleTone: "accent",
    accentOnField: true,
    titleCase: "normal",
    headRule: false,
    stage: 0.58,
    inset: 1,
    photo: "plate",
    titleScale: 1,
  };

  switch (key) {
    case "spotlight":
      // A lot under a light. The headline goes white so the green is spent
      // only on the one number that matters, and the chart steps back:
      // thinner, open dots, a faint wash to keep it from floating.
      return {
        ...dark,
        from: "#15181c",
        to: "#030406",
        stage: 0.5,
        inset: 1.2,
        photo: "round",
        titleTone: "ink",
        chart: { stroke: 0.8, dots: "open", fill: 0.1, baseline: false },
      };
    case "sweep":
      // Backdrop taken from the shirt where there is one. The photo is smaller
      // so the colour is actually visible rather than a border round a white
      // rectangle.
      //
      // WITHOUT A SHIRT COLOUR THIS USED TO RETURN `dark`, which made it the
      // same card as `studio` down to the byte on every template that does not
      // carry one - which is most of them. A brand tint is the fallback now,
      // so choosing Sweep always changes something.
      return {
        ...dark,
        from: shirt ? shirt.hex : mix(STUDIO_LIFT, brand.accentDeep, 0.42),
        to: shirt ? shirt.deep : mix(STUDIO, brand.accentDeep, 0.2),
        hairline: "rgba(255,255,255,0.42)",
        // Brand green neat is a mid green, and this field is now green. Every
        // other template spends `accent` on a badge fill, a "BUY IT NOW" and a
        // kickio.com - all of which vanished into the tint. Lifted halfway to
        // the card's ink, it reads as a pale mint against the field and still
        // works as a fill with dark type on it.
        accent: mix(brand.accent, STUDIO_INK, 0.5),
        stage: shirt ? 0.46 : 0.52,
        inset: 1.5,
        // Green on a green-tinted field is not a style, so type and line are
        // both the card's ink here.
        titleTone: "ink",
        accentOnField: false,
        chart: { stroke: 1.15, dots: "solid", fill: 0.14, baseline: false },
      };
    case "paper":
      // The one case where the photo needs no panel: on warm off-white its own
      // pale background blends instead of announcing itself.
      return {
        from: PAPER,
        to: PAPER,
        ink: PAPER_INK,
        muted: PAPER_MUTED,
        accent: brand.accentDeep,
        hairline: "rgba(20,24,29,0.55)",
        // A catalogue page is ruled. The header sits above a line and the plot
        // stands on one, which is what separates this from a dark card with
        // the colours swapped.
        chart: { stroke: 0.7, dots: "solid", fill: 0, baseline: true },
        titleTone: "accent",
        accentOnField: true,
        titleCase: "normal",
        headRule: true,
        stage: 0.52,
        inset: 1,
        photo: "bare",
        titleScale: 1,
      };
    case "editorial":
      // Loud. Oversized uppercase headline, and the chart is a filled shape
      // rather than a line with beads on it.
      return {
        ...dark,
        from: "#0d0f12",
        to: "#08090b",
        stage: 1,
        inset: 1,
        photo: "bleed",
        titleScale: 1.32,
        titleCase: "upper",
        chart: { stroke: 1.6, dots: "none", fill: 0.3, baseline: false },
      };
    case "frame":
      // Everything thin, and nothing coloured but the one live price. Hairline
      // stroke, open dots, a rule under the header and another under the plot.
      return {
        ...dark,
        from: "#0f1115",
        to: "#090a0d",
        stage: 0.62,
        inset: 1.1,
        photo: "keyline",
        titleScale: 0.82,
        titleTone: "ink",
        headRule: true,
        chart: { stroke: 0.45, dots: "open", fill: 0, baseline: true },
      };
    default:
      return dark;
  }
}
