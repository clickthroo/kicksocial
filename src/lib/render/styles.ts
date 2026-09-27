/**
 * Card styles. Every post has them.
 *
 * Deliberately separate from the template that draws them, and from the draft
 * that picks one, so the list can be shown in the dashboard without pulling the
 * renderer into a client bundle.
 *
 * Every style here works with Kickio's photography AS IT IS - a product shot on
 * its own background. None of them needs the shirt cut out. That work is worth
 * doing (it unlocks the shirt floating in a lit space, the hanging rail, the
 * long shadow), but it is a slower, riskier build, and the choice of look
 * should not have to wait for it.
 *
 * WHAT SEPARATES THEM. Not the backdrop. Six near-black backdrops produced six
 * cards nobody could tell apart, and on the Price History card two of them were
 * byte-for-byte identical. Each style now moves at least one of: headline
 * colour, headline case and scale, how the chart is drawn (weight, solid or
 * open marks, wash, baseline), whether the header is ruled, and how the photo
 * is presented. `styles.distinct.test.ts` fails if any two stop differing.
 *
 * Satori's limits shape what is possible: flexbox only, linear gradients only
 * (its radial gradients render anchored quite differently from CSS), no
 * filters, no blend modes, no masks. So these are composition, scale, colour
 * and type - which is most of what separates the references anyway.
 */
export const CARD_STYLES = [
  {
    key: "studio",
    name: "Studio",
    blurb: "Charcoal, green headline, solid chart. The safe one, works with anything.",
  },
  {
    key: "spotlight",
    name: "Spotlight",
    blurb: "Near-black, white headline, open marks. Green spent only on the live price.",
  },
  {
    key: "sweep",
    name: "Sweep",
    blurb: "Green field, taken from the shirt where there is one. Type and line in white.",
  },
  {
    key: "paper",
    name: "Paper",
    blurb: "Warm off-white and ruled. Catalogue page rather than social post.",
  },
  {
    key: "editorial",
    name: "Editorial",
    blurb: "Oversized caps, chart as a filled shape. Loud. Best for a real grail.",
  },
  {
    key: "frame",
    name: "Frame",
    blurb: "Hairlines and air. Quiet type, thin marks, nothing shouting.",
  },
] as const;

export type CardStyle = (typeof CARD_STYLES)[number]["key"];

export const DEFAULT_CARD_STYLE: CardStyle = "studio";

const KEYS = new Set(CARD_STYLES.map((s) => s.key as string));

/** Fail to the default rather than rendering nothing for an unknown value. */
export function asCardStyle(value: unknown): CardStyle {
  return typeof value === "string" && KEYS.has(value)
    ? (value as CardStyle)
    : DEFAULT_CARD_STYLE;
}

export function styleName(key: string): string {
  return CARD_STYLES.find((s) => s.key === key)?.name ?? key;
}
