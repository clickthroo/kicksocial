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
 * Satori's limits shape what is possible: flexbox only, linear gradients only
 * (its radial gradients render anchored quite differently from CSS), no
 * filters, no blend modes, no masks. So these are composition, scale, colour
 * and type - which is most of what separates the references anyway.
 */
export const CARD_STYLES = [
  {
    key: "studio",
    name: "Studio",
    blurb: "Lit plate on a dark field. The safe one. Works with anything.",
  },
  {
    key: "spotlight",
    name: "Spotlight",
    blurb: "Near-black, tighter, heavier falloff. Reads as an auction lot.",
  },
  {
    key: "sweep",
    name: "Sweep",
    blurb: "Brand-tinted field, from the shirt itself where there is one.",
  },
  {
    key: "paper",
    name: "Paper",
    blurb: "Warm off-white, near-black type. Catalogue rather than social.",
  },
  {
    key: "editorial",
    name: "Editorial",
    blurb: "Oversized type, photos butted up. Loud. Best for a real grail.",
  },
  {
    key: "frame",
    name: "Frame",
    blurb: "Thin keylines, quiet type. Lets the shirts carry it.",
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
