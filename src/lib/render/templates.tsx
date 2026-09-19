/* eslint-disable @next/next/no-img-element */
/**
 * Visual templates, rendered to PNG by Satori (next/og) so they work on Vercel
 * without a headless browser.
 *
 * Principle from the brief: real photography first. The grail card puts the
 * seller's own shirt photo front and centre and lays type over it; nothing is
 * AI-generated. Only the chart-led templates draw their own visuals, because
 * there is no photograph of a price movement.
 *
 * Satori supports a subset of CSS: flexbox only (no grid), and every element
 * with more than one child needs an explicit `display: flex`.
 */
import type { PostDraft } from "../engine/types.ts";
import { asCardStyle, DEFAULT_CARD_STYLE, type CardStyle } from "./styles.ts";
import { DEFAULT_BRAND, type Brand } from "../brand/settings.ts";

/** Output sizes per platform. */
export const FORMATS = {
  ig: { width: 1080, height: 1350 },
  x: { width: 1200, height: 675 },
} as const;
export type FormatKey = keyof typeof FORMATS;

const INK = "#f4f6f8";
const INK_MUTED = "#98a2b0";
const SURFACE = "#14181d";
/**
 * Direction colours, validated for the dark surface with
 * scripts/validate_palette.js: deutan ΔE 25.6, tritan 10.2, both >= 3:1
 * contrast. Red/green was rejected - it measures deutan ΔE 4.1.
 * Colour is never the only cue: an arrow and a signed number carry it too.
 */


function Frame({
  format,
  children,
  background = SURFACE,
}: {
  format: FormatKey;
  children: React.ReactNode;
  background?: string;
}) {
  const { width, height } = FORMATS[format];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width,
        height,
        background,
        color: INK,
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {children}
    </div>
  );
}

/**
 * The logo where one has been embedded (scripts/embed-mark.mjs), the text
 * wordmark otherwise - so a card is never missing its attribution just because
 * the artwork has not been added yet.
 */
function BrandMark({
  size,
  brand,
  style,
}: {
  size: number;
  brand: Brand;
  style?: React.CSSProperties;
}) {
  if (brand.markDataUri) {
    return (
      <img
        src={brand.markDataUri}
        alt="Kickio"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain", ...style }}
      />
    );
  }
  return <Wordmark style={{ fontSize: Math.round(size * 0.55), ...style }} />;
}

function Wordmark({
  style,
  children,
}: {
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 26,
        fontWeight: 700,
        letterSpacing: 2,
        color: INK,
        opacity: 0.85,
        ...style,
      }}
    >
      {children ?? "KICKIO"}
    </div>
  );
}

/**
 * The brand lockup every card wears: the mark, bigger than it was, with the
 * address under it.
 *
 * Two of the seven templates carried no logo and no URL at all - Grail of the
 * Day and Sold This Week rendered only the text wordmark - so a post could go
 * out with nothing on it saying where to go. One component means that cannot
 * quietly become true again for a template added later.
 *
 * Stacked in portrait, inline in landscape. A stacked lockup on 16:9 eats the
 * header twice over and the photo grid pays for it; the frame decides, not the
 * template.
 *
 * When no logo has been uploaded the mark IS the word "KICKIO", so the address
 * replaces it rather than sitting beneath it - otherwise the card reads
 * "KICKIO / KICKIO.COM".
 */
/**
 * Relative luminance of a six-digit hex, 0..1. Null for anything else.
 *
 * sRGB coefficients, no gamma correction: this decides "light or dark
 * background", not a contrast ratio, and the extra precision would not change
 * a single answer.
 */
function luminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.split(",").map((n) => Number(n) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The logo is a single uploaded PNG, and it is white.
 *
 * On a dark card that is the whole point; on the light `paper` style it
 * disappears into the background, which is how the sale card has been rendering
 * since paper was added. Satori cannot recolour an image, so the mark gets a
 * dark plate to sit on instead - the logo stays the logo, and it stays visible.
 */
function BrandBadge({
  size,
  brand,
  surface,
}: {
  size: number;
  brand: Brand;
  surface: string;
}) {
  const light = (luminance(surface) ?? 0) > 0.5;
  if (!light) return <BrandMark size={size} brand={brand} />;
  const pad = Math.round(size * 0.12);
  return (
    <div
      style={{
        display: "flex",
        padding: pad,
        borderRadius: Math.round(size * 0.24),
        background: STUDIO,
      }}
    >
      <BrandMark size={size - pad * 2} brand={brand} />
    </div>
  );
}

function BrandLockup({
  format,
  brand,
  label,
  muted = INK_MUTED,
  surface = SURFACE,
}: {
  format: FormatKey;
  brand: Brand;
  label?: string;
  muted?: string;
  /** What the lockup is sitting on, so a white mark is never lost on it. */
  surface?: string;
}) {
  const portrait = format === "ig";
  const size = portrait ? 172 : 128;
  const urlSize = portrait ? 24 : 20;

  const url = (
    <div
      style={{
        display: "flex",
        fontSize: urlSize,
        fontWeight: 700,
        letterSpacing: 2.5,
        color: muted,
        ...(portrait ? { marginTop: 8 } : { marginLeft: 16 }),
      }}
    >
      KICKIO.COM
    </div>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      {brand.markDataUri ? (
        <div
          style={{
            display: "flex",
            flexDirection: portrait ? "column" : "row",
            alignItems: portrait ? "flex-start" : "center",
          }}
        >
          <BrandBadge size={size} brand={brand} surface={surface} />
          {url}
        </div>
      ) : (
        <Wordmark style={{ fontSize: Math.round(size * 0.42), letterSpacing: 3 }}>
          KICKIO.COM
        </Wordmark>
      )}
      {label ? (
        <div
          style={{
            display: "flex",
            fontSize: portrait ? 20 : 18,
            color: muted,
            letterSpacing: 2,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}

/** How much vertical room BrandLockup takes, for templates that size a grid. */
function lockupHeight(format: FormatKey): number {
  return format === "ig" ? 172 + 8 + 24 : 128;
}

/**
 * How the Grail card reads one of the six style keys.
 *
 * The keys are a shared vocabulary, not a shared layout. The sale card draws a
 * lit plate; this one is a full-bleed photograph with type over it, so "paper"
 * cannot mean the same pixels in both - it means the same INTENT. Four of the
 * six stay bleed and vary the light; `paper` and `frame` pull the photo in off
 * the edge, because at that point the backdrop is the point.
 *
 * Colours come from styleFor(), the same function the sale card uses, so a
 * style chosen on one template looks like itself on the other.
 */
interface GrailLook {
  /** Photo inset from the frame rather than filling it. */
  contained: boolean;
  /** Ink over the photo, and the chip fill that has to sit under it. */
  ink: string;
  chip: string;
  chipEdge: string;
  /** Scrim stops, top and bottom. */
  scrimTop: number;
  scrimBottom: number;
  /** The colour the scrim is made of - neutral, or taken from the shirt. */
  scrimRgb: string;
  titleScale: number;
  keyline: string | null;
}

function grailLook(key: CardStyle, palette: Style): GrailLook {
  const dark: GrailLook = {
    contained: false,
    ink: INK,
    chip: "rgba(255,255,255,0.16)",
    chipEdge: "rgba(255,255,255,0.22)",
    scrimTop: 0.72,
    scrimBottom: 0.88,
    scrimRgb: "10,12,15",
    titleScale: 1,
    keyline: null,
  };

  switch (key) {
    case "spotlight":
      // Heavier falloff both ends: the shirt sits in a pool of light.
      return { ...dark, scrimTop: 0.82, scrimBottom: 0.94 };
    case "sweep":
      // The scrim itself is taken from the shirt, so the whole card is tinted
      // by what is in the photograph rather than by a fixed black.
      return { ...dark, scrimRgb: hexToRgb(palette.to) ?? dark.scrimRgb, scrimTop: 0.78, scrimBottom: 0.9 };
    case "editorial":
      return { ...dark, scrimTop: 0.62, scrimBottom: 0.92, titleScale: 1.18 };
    case "frame":
      return {
        ...dark,
        contained: true,
        scrimTop: 0,
        scrimBottom: 0,
        keyline: palette.hairline,
        titleScale: 0.86,
      };
    case "paper":
      // The one light card. Chips and keyline have to flip with the ink, or
      // they vanish into the backdrop.
      return {
        contained: true,
        ink: palette.ink,
        chip: "rgba(20,24,29,0.09)",
        chipEdge: "rgba(20,24,29,0.16)",
        scrimTop: 0,
        scrimBottom: 0,
        scrimRgb: "10,12,15",
        titleScale: 0.94,
        keyline: null,
      };
    default:
      return dark;
  }
}

/** "#1c1f24" -> "28,31,36". Null for anything that is not a six-digit hex. */
function hexToRgb(hex: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Grail of the Day - the photo is the hero, type sits over a scrim. */
function GrailCard({
  draft,
  format,
  brand,
  style = DEFAULT_CARD_STYLE,
}: {
  draft: PostDraft;
  format: FormatKey;
  brand: Brand;
  style?: CardStyle;
}) {
  const d = draft.source_data as Record<string, unknown>;
  const images = Array.isArray(d.images) ? (d.images as string[]) : [];
  const photo = images[0];
  const signals = Array.isArray(d.rarity_signals) ? (d.rarity_signals as string[]) : [];
  const portrait = format === "ig";
  const shirt = d.shirt_colour as { hex: string; deep: string } | undefined;
  const palette = styleFor(style, brand, shirt);
  const look = grailLook(style, palette);
  const { width, height } = FORMATS[format];
  const pad = portrait ? 56 : 44;
  // A contained photo sits inside the padding and below the lockup, so the
  // backdrop it is placed on is visible - which is the whole point of the two
  // styles that use it.
  const inset = look.contained ? pad : 0;
  const photoTop = look.contained ? pad + lockupHeight(format) + (portrait ? 28 : 18) : 0;
  const photoH = look.contained ? height - photoTop - (portrait ? 330 : 210) : height;
  const photoW = width - inset * 2;

  return (
    <Frame format={format} background={palette.to}>
      {look.contained && <StudioField width={width} height={height} palette={palette} />}
      {photo ? (
        <img
          src={photo}
          alt=""
          width={photoW}
          height={photoH}
          style={{
            position: "absolute",
            top: photoTop,
            left: inset,
            width: photoW,
            height: photoH,
            objectFit: look.contained ? "contain" : "cover",
            ...(look.keyline ? { border: `1px solid ${look.keyline}` } : {}),
            ...(look.contained ? { borderRadius: 10 } : {}),
          }}
        />
      ) : (
        /* Recipes only produce drafts with renderable photography, so this is a
           fault, not a layout state. Say so plainly rather than shipping a card
           that merely looks dark. */
        /* Sized like the photo it stands in for, so a contained style still
           shows its backdrop rather than being painted over edge to edge. */
        <div
          style={{
            position: "absolute",
            top: photoTop,
            left: inset,
            width: photoW,
            height: photoH,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#2a1416",
            color: "#f2565a",
            fontSize: 34,
            fontWeight: 700,
            ...(look.contained ? { borderRadius: 10 } : {}),
          }}
        >
          No renderable photo — do not post
        </div>
      )}
      {/* Scrim: keeps type legible over any photograph. A contained photo does
          not need one - nothing is set over it. */}
      {!look.contained && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height,
            background:
              `linear-gradient(to bottom, rgba(${look.scrimRgb},${look.scrimTop}) 0%, ` +
              `rgba(${look.scrimRgb},0.12) 38%, rgba(${look.scrimRgb},${look.scrimBottom}) 100%)`,
            display: "flex",
          }}
        />
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: portrait ? 56 : 44,
          position: "relative",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <BrandLockup
            format={format}
            brand={brand}
            muted={look.ink}
            surface={look.contained ? palette.to : STUDIO}
          />
          <div
            style={{
              display: "flex",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 2,
              padding: "8px 16px",
              borderRadius: 999,
              color: look.ink,
              background: look.chip,
              border: `1px solid ${look.chipEdge}`,
            }}
          >
            GRAIL OF THE DAY
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {signals.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", marginBottom: 18 }}>
              {signals.slice(0, 3).map((s) => (
                <div
                  key={s}
                  style={{
                    display: "flex",
                    fontSize: 22,
                    fontWeight: 700,
                    padding: "7px 14px",
                    borderRadius: 8,
                    color: look.ink,
                    background: look.chip,
                    marginRight: 10,
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              display: "flex",
              fontSize: Math.round((portrait ? 60 : 46) * look.titleScale),
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -1,
              marginBottom: 14,
              color: look.ink,
            }}
          >
            {String(d.title ?? draft.headline ?? "")}
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                fontSize: portrait ? 52 : 42,
                fontWeight: 800,
                color: look.ink,
              }}
            >
              {String(d.price ?? "")}
            </div>
            {d.condition ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 24,
                  color: palette.muted,
                  marginLeft: 20,
                  paddingLeft: 20,
                  borderLeft: `2px solid ${palette.muted}`,
                }}
              >
                {String(d.condition)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/**
 * Build a sparkline as an SVG data URI. Satori renders `img` reliably; inline
 * SVG support is patchier, so this is the safer path.
 *
 * The series is supporting texture, not the message - the hero number is the
 * message. So: no axes, no gridlines, no per-point labels.
 */
function arrowDataUri(rising: boolean, colour: string, size: number): string {
  // A glyph (▲/▼) is not in Satori's bundled font and renders as tofu, so the
  // arrow is drawn. It is the non-colour cue for direction - it has to survive.
  const pts = rising ? `${size / 2},6 ${size - 6},${size - 8} 6,${size - 8}` : `6,8 ${size - 6},8 ${size / 2},${size - 6}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><polygon points="${pts}" fill="${colour}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function sparklineDataUri(series: number[], colour: string, w: number, h: number): string | null {
  if (series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pad = 10;

  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w - pad} ${h} L${pad} ${h} Z`;
  const [lastX, lastY] = pts[pts.length - 1];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="${colour}" stop-opacity="0.34"/>
<stop offset="100%" stop-color="${colour}" stop-opacity="0"/>
</linearGradient></defs>
<path d="${area}" fill="url(#g)"/>
<path d="${line}" fill="none" stroke="${colour}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="5.5" fill="${colour}" stroke="${SURFACE}" stroke-width="2.5"/>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Price Trends - a hero number, not a chart. Read on a phone in two seconds,
 * the figure is the story; the series is supporting texture beneath it.
 */
function TrendCard({ draft, format, brand }: { draft: PostDraft; format: FormatKey; brand: Brand }) {
  const d = draft.source_data as Record<string, unknown>;
  const pct = Number(d.pct_change ?? 0);
  const rising = pct >= 0;
  const colour = rising ? brand.rising : brand.falling;
  const portrait = format === "ig";

  const series = Array.isArray(d.series)
    ? (d.series as Array<{ index_value: number }>).map((p) => Number(p.index_value)).filter(Number.isFinite)
    : [];
  const montage = Array.isArray(d.images) ? (d.images as string[]) : [];
  const hasMontage = montage.length >= 3;
  // The strip has to come from somewhere: the chart gives up the height. 16:9
  // has far less to give than 4:5 - the first pass at these numbers pushed the
  // provenance line off the bottom of the landscape card.
  const thumb = portrait ? 220 : 98;
  const sparkW = portrait ? 960 : 1080;
  const sparkH = hasMontage ? (portrait ? 190 : 104) : portrait ? 300 : 210;
  const spark = sparklineDataUri(series, colour, sparkW, sparkH);

  return (
    <Frame format={format}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: portrait ? 56 : 44,
        }}
      >
        <BrandLockup format={format} brand={brand} label="MARKET TREND" />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 44 : 34,
              color: INK_MUTED,
              marginBottom: 8,
            }}
          >
            {String(d.subject ?? d.label ?? "")}
          </div>

          {/* Direction carried three ways: arrow, sign, and colour. */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <img
              src={arrowDataUri(rising, colour, portrait ? 92 : 72)}
              alt={rising ? "rising" : "falling"}
              width={portrait ? 92 : 72}
              height={portrait ? 92 : 72}
              style={{ marginRight: 18 }}
            />
            <div
              style={{
                display: "flex",
                fontSize: portrait ? 148 : 112,
                fontWeight: 800,
                color: colour,
                letterSpacing: -4,
              }}
            >
              {rising ? "+" : "−"}
              {Math.abs(pct).toFixed(1)}%
            </div>
          </div>

          <div style={{ display: "flex", fontSize: portrait ? 30 : 24, color: INK_MUTED, marginTop: 6 }}>
            over {String(d.change_window_days ?? 90)} days · like-for-like
          </div>
        </div>

        {spark && (
          <img src={spark} alt="" width={sparkW} height={sparkH} style={{ width: sparkW, height: sparkH }} />
        )}

        {montage.length >= 3 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex" }}>
              {montage.slice(0, 4).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  width={thumb}
                  height={thumb}
                  style={{
                    width: thumb,
                    height: thumb,
                    objectFit: "cover",
                    borderRadius: 8,
                    background: "#ffffff",
                    marginRight: i < 3 ? 10 : 0,
                  }}
                />
              ))}
            </div>
            {/* These are examples of the category, NOT the shirts behind the
                figure - which come from sales data the engine cannot read.
                Unlabelled beside a percentage they would read as the movers. */}
            <div style={{ display: "flex", fontSize: 19, color: INK_MUTED, marginTop: 10 }}>
              {String(d.montage_basis ?? "")}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 24, color: INK_MUTED }}>
            Median {String(d.median_fair_price ?? "")} · {String(d.cohort_count ?? "")} comparable shirts ·{" "}
            {String(d.total_sales ?? "")} sales
          </div>
          {/* Provenance matters: this is market data, not Kickio's own sales. */}
          <div style={{ display: "flex", fontSize: 20, color: INK_MUTED, opacity: 0.7, marginTop: 8 }}>
            Market-wide sales data tracked by Kickio
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** Sold This Week - a ranked list; the pattern is the story. */
function RoundupCard({ draft, format, brand }: { draft: PostDraft; format: FormatKey; brand: Brand }) {
  void brand;
  const d = draft.source_data as Record<string, unknown>;
  const featured = Array.isArray(d.featured)
    ? (d.featured as Array<Record<string, unknown>>).slice(0, format === "ig" ? 5 : 3)
    : [];
  const portrait = format === "ig";

  return (
    <Frame format={format}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: portrait ? 56 : 44,
        }}
      >
        <BrandLockup format={format} brand={brand} label="SOLD THIS WEEK" />

        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
          {featured.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: portrait ? "22px 0" : "14px 0",
                borderBottom: i < featured.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", maxWidth: "70%" }}>
                <div style={{ display: "flex", fontSize: portrait ? 34 : 27, fontWeight: 700 }}>
                  {String(s.team ?? "")} {String(s.season ?? "")}
                </div>
                <div style={{ display: "flex", fontSize: portrait ? 24 : 19, color: INK_MUTED, marginTop: 4 }}>
                  {[s.shirt_type, s.condition].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{ display: "flex", fontSize: portrait ? 42 : 32, fontWeight: 800 }}>
                {String(s.price ?? "")}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", fontSize: 20, color: INK_MUTED, opacity: 0.7 }}>
          Market-wide sales data tracked by Kickio
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------------- *
 * Grail Sale
 *
 * A dark studio treatment: the shirt lifted out of a near-black field, lit from
 * the centre, with the result set beneath it.
 *
 * The photography Kickio holds is flat product shots on plain backgrounds, and
 * that cannot be changed from here. What can be changed is the field it sits in
 * - so the shirt is shown whole on a vignette rather than cropped full-bleed,
 * which is what gives it the hung-in-a-studio feeling rather than the
 * catalogue-thumbnail one.
 *
 * `contain`, not `cover`, for the same reason: a sale is a record of a specific
 * shirt, and cropping the sleeves off it to fill a frame loses the thing the
 * post is about.
 * ------------------------------------------------------------------------- */

/** Near-black with a little warmth, so a maroon or navy shirt does not go flat. */
const STUDIO = "#0b0c0e";
const STUDIO_LIFT = "#1c1f24";
const STUDIO_INK = "#f6f7f9";
const STUDIO_MUTED = "#8b95a3";
const PAPER = "#f2efe9";
const PAPER_INK = "#14181d";
const PAPER_MUTED = "#6f6b64";

interface Style {
  /** Top and bottom of the backdrop sweep. */
  from: string;
  to: string;
  ink: string;
  muted: string;
  accent: string;
  /** Border colour for the attribute chips and rules. */
  hairline: string;
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

function styleFor(key: CardStyle, brand: Brand, shirt?: { hex: string; deep: string }): Style {
  const dark: Style = {
    from: STUDIO_LIFT,
    to: STUDIO,
    ink: STUDIO_INK,
    muted: STUDIO_MUTED,
    accent: brand.accent,
    hairline: "rgba(246,247,249,0.3)",
    stage: 0.58,
    inset: 1,
    photo: "plate",
    titleScale: 1,
  };

  switch (key) {
    case "spotlight":
      // Circular crop on near-black: the shirt reads as a lot under a light.
      return { ...dark, from: "#15181c", to: "#030406", stage: 0.5, inset: 1.2, photo: "round" };
    case "sweep":
      // Backdrop taken from the shirt. The photo is smaller so the colour is
      // actually visible rather than a border round a white rectangle.
      return shirt
        ? {
            ...dark,
            from: shirt.hex,
            to: shirt.deep,
            hairline: "rgba(255,255,255,0.42)",
            stage: 0.46,
            inset: 1.5,
          }
        : dark;
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
        stage: 0.52,
        inset: 1,
        photo: "bare",
        titleScale: 1,
      };
    case "editorial":
      return { ...dark, from: "#0d0f12", to: "#08090b", stage: 1, inset: 1, photo: "bleed", titleScale: 1.2 };
    case "frame":
      return { ...dark, from: "#0f1115", to: "#090a0d", stage: 0.62, inset: 1.1, photo: "keyline", titleScale: 0.82 };
    default:
      return dark;
  }
}

/**
 * Fallbacks only. The live values come from Settings -> Branding, so changing
 * them needs no deploy; these are what a card renders in if that read fails.
 */
const BRAND = DEFAULT_BRAND.accent;
const BRAND_DEEP = DEFAULT_BRAND.accentDeep;

/** Long product names are the norm, so the title sizes itself to fit. */
function titleSize(title: string, portrait: boolean): number {
  const base = portrait ? 56 : 38;
  if (title.length > 62) return Math.round(base * 0.68);
  if (title.length > 44) return Math.round(base * 0.8);
  if (title.length > 30) return Math.round(base * 0.9);
  return base;
}

/**
 * The status flag at the top of a single-item card.
 *
 * Two words, two meanings, one shape: SOLD closes a story, AVAILABLE opens
 * one. Keeping them in one component is what makes a Drop look like it came
 * from the same studio as a Sale rather than from a template someone cloned.
 */
function SoldBadge({
  scale = 1,
  accent,
  label = "SOLD",
}: {
  scale?: number;
  accent: string;
  label?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          fontSize: 19 * scale,
          fontWeight: 800,
          letterSpacing: 4 * scale,
          padding: `${8 * scale}px ${17 * scale}px`,
          background: accent,
          color: "#06210f",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function MissingPhoto({ width, height }: { width: number; height: number }) {
  /* Satori renders WebP as an empty frame with no error. A card with no photo is
     a fault, not a layout state, so it says so instead of looking merely dark. */
  return (
    <div
      style={{
        display: "flex",
        width,
        height,
        alignItems: "center",
        justifyContent: "center",
        background: "#2a1416",
        color: "#f2565a",
        fontSize: 30,
        fontWeight: 700,
        textAlign: "center",
        padding: 40,
      }}
    >
      No renderable photo — do not post
    </div>
  );
}

/**
 * The field behind the shirt.
 *
 * Linear, not radial. Satori accepts `radial-gradient` and then renders it
 * anchored and scaled quite differently from a browser - the first attempt at
 * this card came back with the fall-off pushed into one corner and the shirt
 * swallowed. Linear gradients are already proven here (the Grail card's scrim),
 * so the light is built from one.
 */
function StudioField({
  width,
  height,
  palette,
}: {
  width: number;
  height: number;
  palette: Style;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        display: "flex",
        width,
        height,
        background: `linear-gradient(to bottom, ${palette.from} 0%, ${palette.to} 72%, ${palette.to} 100%)`,
      }}
    />
  );
}

/**
 * One shirt, on a lit plate. Serves both single-item recipes.
 *
 * `mode` is the only difference: a Sale is a shirt that has gone and a Drop is
 * one you can buy. Same composition, same six styles, same lockup - which is
 * the point, because a Drop has to look as considered as a Sale and cloning
 * the component would have guaranteed the two drifted apart.
 */
function GrailSaleCard({
  draft,
  format,
  style,
  brand,
  mode = "sold",
}: {
  draft: PostDraft;
  format: FormatKey;
  style: CardStyle;
  brand: Brand;
  mode?: "sold" | "drop";
}) {
  const drop = mode === "drop";
  const d = draft.source_data as Record<string, unknown>;
  const images = Array.isArray(d.images) ? (d.images as string[]) : [];
  const photo = images[0];
  const signals = Array.isArray(d.rarity_signals) ? (d.rarity_signals as string[]) : [];
  const portrait = format === "ig";
  const { width, height } = FORMATS[format];
  const shirt = d.shirt_colour as { hex: string; deep: string } | undefined;
  const palette = styleFor(style, brand, shirt);

  const title = String(d.title ?? draft.headline ?? "");
  const price = String(d.price ?? "");
  // Season and club are already in the title; these add what it does not carry.
  const meta = [d.condition, d.size, d.printing].filter(Boolean).map(String);

  const stageHeight = portrait ? Math.round(height * palette.stage) : height;
  const stageWidth = portrait ? width : Math.round(width * 0.48);
  const pad = Math.round((portrait ? 56 : 46) * palette.inset);
  // Bleed fills its stage; everything else sits inside the inset.
  const bleed = palette.photo === "bleed";
  const photoW = bleed ? stageWidth : stageWidth - pad * 2;
  const photoH = bleed ? stageHeight : stageHeight - pad * 2;

  return (
    <Frame format={format} background={palette.to}>
      <StudioField width={width} height={height} palette={palette} />

      <div
        style={{
          display: "flex",
          flexDirection: bleed ? "column" : portrait ? "column" : "row",
          width,
          height,
          position: "relative",
        }}
      >

        <div
          style={{
            display: "flex",
            width: stageWidth,
            height: stageHeight,
            alignItems: "center",
            justifyContent: "center",
            ...(bleed ? {} : { padding: pad }),
          }}
        >
          {photo ? (
            /* Kickio's photography is catalogue shots on their own pale
               backgrounds, and nothing here can change that. Feathering that
               background into a dark field needs per-pixel work the renderer
               cannot do. So each style decides how to present the rectangle
               rather than pretending it is not there. */
            <img
              src={photo}
              alt=""
              width={photoW}
              height={photoH}
              style={{
                width: photoW,
                height: photoH,
                // The whole shirt, never a crop of it - a sale is a record of
                // one specific shirt, and cropping its sleeves off to fill a
                // frame loses the thing the post is about.
                objectFit: palette.photo === "bleed" ? "cover" : "contain",
                ...(palette.photo === "round"
                  ? { borderRadius: Math.round(Math.min(photoW, photoH) / 2), background: "#ffffff" }
                  : palette.photo === "keyline"
                    ? { borderRadius: 2, background: "#ffffff", border: `2px solid ${palette.hairline}` }
                    : palette.photo === "bare" || palette.photo === "bleed"
                      ? {}
                      : { borderRadius: 10, background: "#ffffff" }),
              }}
            />
          ) : (
            <MissingPhoto width={photoW} height={photoH} />
          )}
        </div>

        {bleed && (
          /* Type sits over the photograph here, so it needs a scrim or it is
             only as legible as whatever the shirt happens to be. It has to come
             AFTER the photo in the DOM: Satori paints in document order and
             honours z-index only partially, so the first attempt put the scrim
             behind the picture and left white type on a pale background. */
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              display: "flex",
              width,
              height,
              background:
                `linear-gradient(to bottom, rgba(8,9,11,0.5) 0%, rgba(8,9,11,0.04) 26%, ` +
                `rgba(8,9,11,0.8) 58%, rgba(8,9,11,0.97) 100%)`,
            }}
          />
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: bleed ? "flex-end" : portrait ? "flex-end" : "space-between",
            width: bleed ? width : portrait ? width : width - stageWidth,
            height: bleed ? height : portrait ? height - stageHeight : height,
            padding: pad,
            color: palette.ink,
            ...(bleed ? { position: "absolute", top: 0, left: 0 } : {}),
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: portrait ? 24 : 18,
              }}
            >
              <SoldBadge
                scale={portrait ? 1 : 0.85}
                accent={palette.accent}
                label={drop ? "AVAILABLE NOW" : "SOLD"}
              />
              {/* A Sale is dated; a Drop says whether the seller will haggle,
                  which is the more useful thing to know about one you can buy. */}
              {drop ? (
                d.accepts_offers === true ? (
                  <div style={{ display: "flex", fontSize: portrait ? 20 : 17, color: palette.muted }}>
                    Offers considered
                  </div>
                ) : null
              ) : d.sold_at ? (
                <div style={{ display: "flex", fontSize: portrait ? 20 : 17, color: palette.muted }}>
                  {String(d.sold_at)}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                fontSize: Math.round(titleSize(title, portrait) * palette.titleScale),
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: -1,
              }}
            >
              {title}
            </div>

            {meta.length > 0 && (
              <div
                style={{
                  display: "flex",
                  fontSize: portrait ? 22 : 18,
                  color: palette.muted,
                  marginTop: 12,
                }}
              >
                {meta.join("  ·  ")}
              </div>
            )}

            {signals.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", marginTop: portrait ? 18 : 14 }}>
                {signals.slice(0, 2).map((sig) => (
                  <div
                    key={sig}
                    style={{
                      display: "flex",
                      fontSize: portrait ? 18 : 15,
                      fontWeight: 700,
                      letterSpacing: 1,
                      padding: portrait ? "6px 12px" : "5px 10px",
                      marginRight: 9,
                      marginTop: 8,
                      border: `1px solid ${palette.hairline}`,
                      color: palette.ink,
                    }}
                  >
                    {sig.toUpperCase()}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: portrait ? 26 : 0 }}>
            <div
              style={{
                display: "flex",
                fontSize: portrait ? 24 : 20,
                fontWeight: 700,
                letterSpacing: 3,
                color: palette.accent,
                marginBottom: portrait ? 8 : 5,
              }}
            >
              {drop ? "BUY IT NOW" : "SOLD FOR"}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: portrait ? 96 : 72,
                fontWeight: 800,
                letterSpacing: -3,
                lineHeight: 1,
              }}
            >
              {price}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: portrait ? 30 : 22,
                paddingTop: portrait ? 20 : 15,
                borderTop: `1px solid ${palette.hairline}`,
              }}
            >
              <BrandBadge size={portrait ? 112 : 88} brand={brand} surface={palette.to} />
              <div
                style={{
                  display: "flex",
                  fontSize: portrait ? 19 : 16,
                  fontWeight: 600,
                  color: palette.accent,
                }}
              >
                kickio.com
              </div>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/**
 * `style` overrides what the draft carries, so the dashboard can preview a look
 * before anyone commits to it.
 */
/* ------------------------------------------------------------------------- *
 * Club Archive - a grid of one club's shirts across the decades.
 *
 * The photos ARE the post: nine badges of the same club, forty years apart,
 * does the work before any type lands. So the type stays out of the way - the
 * club, the span, and the counts, nothing else.
 * ------------------------------------------------------------------------- */

function ArchiveCard({
  draft,
  format,
  brand,
}: {
  draft: PostDraft;
  format: FormatKey;
  brand: Brand;
}) {
  const d = draft.source_data as Record<string, unknown>;
  const photos = Array.isArray(d.images) ? (d.images as string[]) : [];
  const portrait = format === "ig";
  const { width, height } = FORMATS[format];
  const pad = portrait ? 52 : 42;

  // 3x3 in portrait, 4x2 in landscape - the frame decides the grid, and a row
  // that cannot be filled is dropped rather than left half empty.
  const cols = portrait ? 3 : 4;
  const rows = portrait ? 3 : 2;
  const gap = 10;
  // Sized by BOTH axes. Width alone fits 16:9 four-across at 271px, which eats
  // the whole frame and pushed the club's name off the bottom edge - the grid
  // has to leave room for the header and the type block, not just the margins.
  const headerH = lockupHeight(format);
  const typeH = portrait ? 168 : 124;
  const gridH = height - pad * 2 - headerH - typeH;
  const cell = Math.min(
    Math.floor((width - pad * 2 - gap * (cols - 1)) / cols),
    Math.floor((gridH - gap * (rows - 1)) / rows),
  );
  const usable = photos.slice(0, Math.min(photos.length - (photos.length % cols), cols * rows));

  return (
    <Frame format={format} background={STUDIO}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width,
          height,
          padding: pad,
          background: `linear-gradient(to bottom, ${STUDIO_LIFT} 0%, ${STUDIO} 60%, #06070a 100%)`,
        }}
      >
        <BrandLockup
          format={format}
          brand={brand}
          label="ON KICKIO"
          muted={STUDIO_MUTED}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          {Array.from({ length: Math.ceil(usable.length / cols) }, (_, row) => (
            <div key={row} style={{ display: "flex", justifyContent: "center", marginBottom: gap }}>
              {usable.slice(row * cols, row * cols + cols).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  width={cell}
                  height={cell}
                  style={{
                    width: cell,
                    height: cell,
                    objectFit: "cover",
                    borderRadius: 8,
                    background: "#ffffff",
                    marginRight: i < cols - 1 ? gap : 0,
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 56 : 42,
              fontWeight: 800,
              letterSpacing: -1,
              color: STUDIO_INK,
            }}
          >
            {String(d.team ?? "")}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 30 : 24,
              fontWeight: 700,
              color: brand.accent,
              marginTop: 8,
            }}
          >
            {String(d.shirts ?? "")} shirts · {String(d.earliest ?? "")}–{String(d.latest ?? "")}
          </div>
          {/* Said on the card, not just in the caption: these are Kickio's
              holdings, not the club's kit history. */}
          <div style={{ display: "flex", fontSize: 19, color: STUDIO_MUTED, marginTop: 10 }}>
            {String(d.kit_types ?? "")} kit types listed
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------------------------
 * COLLECTION GRID - a curated Kickio list and how much of it is on the shelf.
 *
 * Same photo grid as the archive card, different type block, because the
 * subject is different: the archive says "this is what we hold", this says
 * "this is how much OF A NAMED LIST you can buy". The fraction is the whole
 * point, so it is set large and never reduced to its numerator - a card
 * reading "136 grails on Kickio" over nine photos would be the overclaim the
 * recipe spends its selection logic avoiding.
 *
 * "Buyable", not "listed". The numerator counts active LISTINGS, not shirt
 * records: 65 of the Grail List's slots have a page on Kickio and only 39 have
 * anything to buy. The card sends people shopping, so it quotes the number
 * they can act on.
 * ------------------------------------------------------------------------- */

function CollectionCard({
  draft,
  format,
  brand,
}: {
  draft: PostDraft;
  format: FormatKey;
  brand: Brand;
}) {
  const d = draft.source_data as Record<string, unknown>;
  const photos = Array.isArray(d.images) ? (d.images as string[]) : [];
  const portrait = format === "ig";
  const { width, height } = FORMATS[format];
  const pad = portrait ? 52 : 42;

  const cols = portrait ? 3 : 4;
  const rows = portrait ? 3 : 2;
  const gap = 10;
  const headerH = lockupHeight(format);
  // Taller than the archive card's: this one carries a third line, the hunt
  // list, and a line that does not fit is a line that pushes the fraction off
  // the bottom edge.
  const typeH = portrait ? 210 : 152;
  const gridH = height - pad * 2 - headerH - typeH;
  const cell = Math.min(
    Math.floor((width - pad * 2 - gap * (cols - 1)) / cols),
    Math.floor((gridH - gap * (rows - 1)) / rows),
  );
  const usable = photos.slice(0, Math.min(photos.length - (photos.length % cols), cols * rows));

  const hunting = Array.isArray(d.hunting) ? (d.hunting as string[]) : [];
  // Three names. Satori does not reflow gracefully, and a fourth pushes the
  // line past the frame on 16:9.
  const huntLine = hunting.slice(0, 3).join("  ·  ");

  return (
    <Frame format={format} background={STUDIO}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width,
          height,
          padding: pad,
          background: `linear-gradient(to bottom, ${STUDIO_LIFT} 0%, ${STUDIO} 60%, #06070a 100%)`,
        }}
      >
        <BrandLockup
          format={format}
          brand={brand}
          label="THE LIST"
          muted={STUDIO_MUTED}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          {Array.from({ length: Math.ceil(usable.length / cols) }, (_, row) => (
            <div key={row} style={{ display: "flex", justifyContent: "center", marginBottom: gap }}>
              {usable.slice(row * cols, row * cols + cols).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  width={cell}
                  height={cell}
                  style={{
                    width: cell,
                    height: cell,
                    objectFit: "cover",
                    borderRadius: 8,
                    background: "#ffffff",
                    marginRight: i < cols - 1 ? gap : 0,
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 52 : 40,
              fontWeight: 800,
              letterSpacing: -1,
              color: STUDIO_INK,
            }}
          >
            {String(d.collection ?? "")}
          </div>
          {/* The fraction, never the numerator alone - and the numerator is
              active listings, not shirt records. */}
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 30 : 24,
              fontWeight: 700,
              color: brand.accent,
              marginTop: 8,
            }}
          >
            {String(d.buyable ?? "")} of {String(d.slots ?? "")} to buy
          </div>
          {huntLine ? (
            <div style={{ display: "flex", fontSize: portrait ? 20 : 18, color: STUDIO_MUTED, marginTop: 12 }}>
              Still hunting: {huntLine}
            </div>
          ) : null}
        </div>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------------------------
 * COLLECTOR CARD - a person's collection, or their progress through a list.
 *
 * The name is set as a byline rather than a headline: the subject is the
 * shirts, and the collector is who assembled them. A card that leads with a
 * handle reads as an advert for a person; one that leads with the collection
 * reads as a collection, which is what people actually want to look at.
 *
 * NOTHING ABOUT MONEY APPEARS HERE and there is no field that could carry it -
 * the recipes do not put a value in source_data, and the scoped role is not
 * granted the columns that hold one.
 * ------------------------------------------------------------------------- */

function CollectorCard({
  draft,
  format,
  brand,
}: {
  draft: PostDraft;
  format: FormatKey;
  brand: Brand;
}) {
  const d = draft.source_data as Record<string, unknown>;
  const photos = Array.isArray(d.images) ? (d.images as string[]) : [];
  const portrait = format === "ig";
  const { width, height } = FORMATS[format];
  const pad = portrait ? 52 : 42;

  const cols = portrait ? 3 : 4;
  const rows = portrait ? 3 : 2;
  const gap = 10;
  const headerH = lockupHeight(format);
  const typeH = portrait ? 210 : 152;
  const gridH = height - pad * 2 - headerH - typeH;
  const cell = Math.min(
    Math.floor((width - pad * 2 - gap * (cols - 1)) / cols),
    Math.floor((gridH - gap * (rows - 1)) / rows),
  );
  const usable = photos.slice(0, Math.min(photos.length - (photos.length % cols), cols * rows));

  // Progress posts carry a set; whole-collection posts carry counts. Each
  // leads with the number that number is about: the set being chased, or the
  // size of the collection. Leading a spotlight with "31 clubs" buries the
  // 214 that makes anyone stop scrolling.
  const isProgress = d.percent !== undefined;
  const subject = isProgress
    ? String(d.collection ?? "")
    : `${String(d.shirts ?? "")} shirts`;
  const stat = isProgress
    ? `${String(d.filled ?? "")} of ${String(d.slots ?? "")} · ${String(d.percent ?? "")}%`
    : `${String(d.clubs ?? "")} clubs · ${String(d.earliest ?? "")}–${String(d.latest ?? "")}`;

  return (
    <Frame format={format} background={STUDIO}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width,
          height,
          padding: pad,
          background: `linear-gradient(to bottom, ${STUDIO_LIFT} 0%, ${STUDIO} 60%, #06070a 100%)`,
        }}
      >
        <BrandLockup
          format={format}
          brand={brand}
          label="COLLECTOR"
          muted={STUDIO_MUTED}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          {Array.from({ length: Math.ceil(usable.length / cols) }, (_, row) => (
            <div key={row} style={{ display: "flex", justifyContent: "center", marginBottom: gap }}>
              {usable.slice(row * cols, row * cols + cols).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  width={cell}
                  height={cell}
                  style={{
                    width: cell,
                    height: cell,
                    objectFit: "cover",
                    borderRadius: 8,
                    background: "#ffffff",
                    marginRight: i < cols - 1 ? gap : 0,
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Byline, not headline. Smaller than the numbers by design. */}
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 24 : 20,
              color: STUDIO_MUTED,
              letterSpacing: 1,
            }}
          >
            {String(d.collector ?? "")}
            {d.collector_title ? ` · ${String(d.collector_title)}` : ""}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 50 : 38,
              fontWeight: 800,
              letterSpacing: -1,
              color: STUDIO_INK,
              marginTop: 6,
            }}
          >
            {subject}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 30 : 24,
              fontWeight: 700,
              color: brand.accent,
              marginTop: 8,
            }}
          >
            {stat}
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function templateFor(
  draft: PostDraft,
  format: FormatKey,
  options: { style?: CardStyle; brand?: Brand } = {},
): React.ReactElement {
  const brand = options.brand ?? DEFAULT_BRAND;
  const style = options.style;
  const template =
    (draft.generation as { visual_template?: string })?.visual_template ?? "grail_card";

  switch (template) {
    case "trend_chart":
      return <TrendCard draft={draft} format={format} brand={brand} />;
    case "roundup_card":
      return <RoundupCard draft={draft} format={format} brand={brand} />;
    case "archive_grid":
      return <ArchiveCard draft={draft} format={format} brand={brand} />;
    case "collection_grid":
      return <CollectionCard draft={draft} format={format} brand={brand} />;
    case "collector_grid":
      return <CollectorCard draft={draft} format={format} brand={brand} />;
    case "grail_sale_card":
      return (
        <GrailSaleCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "drop_card":
      return (
        <GrailSaleCard
          draft={draft}
          format={format}
          brand={brand}
          mode="drop"
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    default:
      return (
        <GrailCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
  }
}
