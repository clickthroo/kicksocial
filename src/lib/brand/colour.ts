/**
 * The colour checks the branding editor runs before it saves.
 *
 * Ported from the dataviz skill's validator (Machado, Oliveira & Fernandes 2009
 * CVD transforms at severity 1.0; Euclidean distance in OKLab x100) so the
 * numbers reported in the app are the same ones the README quotes rather than a
 * second, subtly different implementation.
 *
 * This exists because letting someone pick chart colours freely can silently
 * undo work that is invisible to the person doing the picking: the rising and
 * falling colours were chosen so a red-green colourblind reader can still tell
 * them apart, and nothing about a colour picker communicates that.
 */

/** Machado et al. (2009), severity 1.0, applied in linear RGB. */
const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const;

export type Deficiency = keyof typeof MACHADO;

/** Six-digit hex, with or without the hash. Nothing else. */
export function isHexColour(value: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(value.trim());
}

export function normaliseHex(value: string): string {
  return "#" + value.trim().replace(/^#/, "").toLowerCase();
}

function srgb(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, "");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function linear(hex: string): [number, number, number] {
  const [r, g, b] = srgb(hex);
  return [toLinear(r), toLinear(g), toLinear(b)];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = linear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function oklab([r, g, b]: [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function simulate(hex: string, kind: Deficiency): [number, number, number] {
  const [r, g, b] = linear(hex);
  const m = MACHADO[kind];
  const clamp = (c: number) => Math.max(0, Math.min(1, c));
  return [
    clamp(m[0][0] * r + m[0][1] * g + m[0][2] * b),
    clamp(m[1][0] * r + m[1][1] * g + m[1][2] * b),
    clamp(m[2][0] * r + m[2][1] * g + m[2][2] * b),
  ];
}

/** Euclidean distance in OKLab x100. Omit `kind` for normal vision. */
export function deltaE(a: string, b: string, kind?: Deficiency): number {
  const x = oklab(kind ? simulate(a, kind) : linear(a));
  const y = oklab(kind ? simulate(b, kind) : linear(b));
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Below this two colours are not reliably distinguishable. */
export const CVD_FLOOR = 8;
/** Below this a mark is hard to see against the card at all. */
export const CONTRAST_MIN = 3;

export interface ColourCheck {
  ok: boolean;
  level: "ok" | "warn" | "fail";
  message: string;
}

/**
 * Whether the rising/falling pair can still be told apart, and whether each is
 * visible on the card.
 *
 * A warning rather than a refusal: direction is also carried by an arrow and a
 * signed number, so colour is never the only cue, and this is the operator's
 * brand to set. But it should be set knowingly.
 */
export function checkDirectionPair(
  rising: string,
  falling: string,
  surface: string,
): ColourCheck[] {
  const checks: ColourCheck[] = [];

  const worstCvd = Math.min(
    deltaE(rising, falling, "protan"),
    deltaE(rising, falling, "deutan"),
  );
  const tritan = deltaE(rising, falling, "tritan");
  checks.push({
    ok: worstCvd >= CVD_FLOOR,
    level: worstCvd >= CVD_FLOOR ? "ok" : "warn",
    message:
      `Rising vs falling, colourblind readers: ΔE ${worstCvd.toFixed(1)} ` +
      `(red-green), ${tritan.toFixed(1)} (blue-yellow). ` +
      (worstCvd >= CVD_FLOOR
        ? "Distinguishable."
        : `Below ${CVD_FLOOR} — these will look like the same colour to a ` +
          "red-green colourblind reader. The arrow and the sign still carry direction."),
  });

  for (const [name, hex] of [
    ["Rising", rising],
    ["Falling", falling],
  ] as const) {
    const ratio = contrast(hex, surface);
    checks.push({
      ok: ratio >= CONTRAST_MIN,
      level: ratio >= CONTRAST_MIN ? "ok" : "warn",
      message:
        `${name} on the card: ${ratio.toFixed(1)}:1 contrast. ` +
        (ratio >= CONTRAST_MIN ? "Clearly visible." : `Below ${CONTRAST_MIN}:1 — faint against the background.`),
    });
  }

  return checks;
}
