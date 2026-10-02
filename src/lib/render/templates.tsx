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
import { noOrphan } from "./typography.ts";
import {
  styleFor,
  mix,
  hexToRgb,
  withAlpha,
  PAPER,
  PAPER_INK,
  STUDIO,
  STUDIO_INK,
  STUDIO_MUTED,
  type Style,
} from "./card-style.ts";
import { FORMATS, TIKTOK_SAFE_BOTTOM, asFormat, type FormatKey } from "./formats.ts";
import { axisDates, plotted, priceLineSvg, type ChartBox } from "./price-chart.ts";
import { DEFAULT_BRAND, type Brand } from "../brand/settings.ts";

export { FORMATS, asFormat, TIKTOK_SAFE_BOTTOM };
export type { FormatKey };

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
  ink = INK,
}: {
  format: FormatKey;
  children: React.ReactNode;
  background?: string;
  /**
   * Inherited by every piece of text that does not set its own colour.
   *
   * Worth a prop rather than a constant: this was fixed light, so the moment a
   * light style existed, any line that had not been given an explicit colour
   * became white on cream. Setting it here fixes the whole card at once
   * instead of hunting individual divs, and the next light style added gets it
   * for free.
   */
  ink?: string;
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
        color: ink,
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
  compact = false,
}: {
  format: FormatKey;
  brand: Brand;
  label?: string;
  muted?: string;
  /** What the lockup is sitting on, so a white mark is never lost on it. */
  surface?: string;
  /**
   * Half-height, for the cards that lead with a photograph.
   *
   * The full lockup is 172px of a 1350px card. On an information-led card that
   * is a masthead; above a product shot it is 13% of the frame taken off the
   * thing people came to look at. Compact costs about 6% and still reads.
   */
  compact?: boolean;
}) {
  const portrait = format !== "x";
  const size = compact ? (portrait ? 92 : 72) : portrait ? 172 : 128;
  const urlSize = compact ? (portrait ? 20 : 17) : portrait ? 24 : 20;

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
        // Fallback when the mark could not be fetched. It must still be legible
        // on whatever it lands on: Wordmark defaults to the dark-theme ink,
        // which on `paper` is near-white on cream - a card that ships with no
        // readable brand name at all, and looks fine in every check that does
        // not involve looking at it.
        <Wordmark
          style={{
            fontSize: Math.round(size * 0.42),
            letterSpacing: 3,
            // An unparseable surface falls back to the dark-theme ink, which is
            // what this did before - unknown should not change behaviour.
            color: (luminance(surface) ?? 0) > 0.5 ? PAPER_INK : INK,
          }}
        >
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
  return format !== "x" ? 172 + 8 + 24 : 128;
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

function sparklineDataUri(
  series: number[],
  colour: string,
  w: number,
  h: number,
  field: string = SURFACE,
): string | null {
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
<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="5.5" fill="${colour}" stroke="${field}" stroke-width="2.5"/>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Price Trends - a hero number, not a chart. Read on a phone in two seconds,
 * the figure is the story; the series is supporting texture beneath it.
 */
function TrendCard({
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
  const look = gridLook(style, brand);
  const d = draft.source_data as Record<string, unknown>;
  const pct = Number(d.pct_change ?? 0);
  const rising = pct >= 0;
  const colour = rising ? brand.rising : brand.falling;
  const portrait = format !== "x";

  const series = Array.isArray(d.series)
    ? (d.series as Array<{ index_value: number }>).map((p) => Number(p.index_value)).filter(Number.isFinite)
    : [];
  const montage = Array.isArray(d.images) ? (d.images as string[]) : [];
  const hasMontage = montage.length >= 3;
  const pad = portrait ? 56 : 44;
  const contentW = FORMATS[format].width - pad * 2;
  const gap = 12;
  // Shirts are portrait objects. Square tiles cropped the sleeves off them and
  // left the row short of the column, so in 4:5 and 9:16 the strip spans the
  // content width exactly and the tiles carry a portrait aspect. 16:9 has far
  // less height to give: the tiles stay small there and the strip sits left,
  // rather than pushing the provenance line off the bottom of the card.
  const thumbW = portrait ? Math.floor((contentW - gap * 3) / 4) : 96;
  const thumbH = Math.round(thumbW * 1.2);
  // The strip has to come from somewhere: the chart gives up the height.
  const sparkW = portrait ? contentW : 1080;
  const sparkH = hasMontage ? (portrait ? 190 : 104) : portrait ? 300 : 210;
  const spark = sparklineDataUri(series, colour, sparkW, sparkH, look.to);

  return (
    <Frame format={format} background={look.to} ink={look.ink}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: pad,
          paddingBottom: format === "tiktok" ? pad + TIKTOK_SAFE_BOTTOM : pad,
          background: `linear-gradient(to bottom, ${look.from} 0%, ${look.to} 62%, ${look.to} 100%)`,
        }}
      >
        <BrandLockup format={format} brand={brand} label="MARKET TREND" />

        {/*
          One composed middle block, rather than four siblings under
          space-between. There is no per-subject price series in Kickio (see
          the note on `subjectSeries` in recipes/price-trends.ts), so the
          sparkline never renders in production - and the outer space-between
          was dividing the height it left behind into dead bands above and
          below the shirt strip. The slack belongs to one block that centres
          what it holds and sets its own spacing.
        */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: portrait ? 44 : 34,
                color: look.muted,
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
                  fontSize: Math.round((portrait ? 148 : 112) * look.titleScale),
                  fontWeight: 800,
                  color: colour,
                  letterSpacing: -4,
                }}
              >
                {rising ? "+" : "−"}
                {Math.abs(pct).toFixed(1)}%
              </div>
            </div>

            <div style={{ display: "flex", fontSize: portrait ? 30 : 24, color: look.muted, marginTop: 6 }}>
              over {String(d.change_window_days ?? 90)} days · like-for-like
            </div>
          </div>

          {spark && (
            <img
              src={spark}
              alt=""
              width={sparkW}
              height={sparkH}
              style={{ width: sparkW, height: sparkH, marginTop: portrait ? 28 : 16 }}
            />
          )}

          {hasMontage && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: portrait ? 44 : 22,
              }}
            >
              <div style={{ display: "flex" }}>
                {montage.slice(0, 4).map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    width={thumbW}
                    height={thumbH}
                    style={{
                      width: thumbW,
                      height: thumbH,
                      objectFit: "cover",
                      borderRadius: 8,
                      background: "#ffffff",
                      marginRight: i < 3 ? gap : 0,
                    }}
                  />
                ))}
              </div>
              {/* These are examples of the category, NOT the shirts behind the
                  figure - which come from sales data the engine cannot read.
                  Unlabelled beside a percentage they would read as the movers. */}
              <div style={{ display: "flex", fontSize: 19, color: look.muted, marginTop: 10 }}>
                {String(d.montage_basis ?? "")}
              </div>
            </div>
          )}
        </div>

        {/* 16:9 has no slack for the middle block to absorb, so the sign-off
            keeps its own clearance rather than sitting on the caption. */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: portrait ? 0 : 22 }}>
          <div style={{ display: "flex", fontSize: 24, color: look.muted }}>
            Median {String(d.median_fair_price ?? "")} · {String(d.cohort_count ?? "")} comparable shirts ·{" "}
            {String(d.total_sales ?? "")} sales
          </div>
          {/* Provenance matters: this is market data, not Kickio's own sales. */}
          <div style={{ display: "flex", fontSize: 20, color: look.muted, opacity: 0.7, marginTop: 8 }}>
            Market-wide sales data tracked by Kickio
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** Sold This Week - a ranked list; the pattern is the story. */
function RoundupCard({
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
  const look = gridLook(style, brand);
  const d = draft.source_data as Record<string, unknown>;
  const portrait = format !== "x";

  // One hero plus a strip, rather than a list of names and numbers. A shirt is
  // the reason anyone stops scrolling; the price is the caption.
  const slots = 5;
  const all = Array.isArray(d.featured)
    ? (d.featured as Array<Record<string, unknown>>).slice(0, slots)
    : [];

  // Index-aligned with `featured` - the recipe only features sales it has a
  // photo for, precisely so this alignment holds. If it ever does not, a tile
  // draws without its picture rather than borrowing the next shirt's.
  const photos = Array.isArray(d.images) ? (d.images as unknown[]).map(String) : [];

  const hero = all[0];
  const rest = all.slice(1);

  const heroSize = portrait ? 470 : 172;
  // Tiles share the row rather than taking a fixed width, so the strip spans
  // the card in both shapes. At 1200x675 a fixed square left two thirds of the
  // width empty and pushed the footer into the captions.
  const tileHeight = portrait ? 210 : 132;

  // The IMAGE inside a tile still gets explicit width and height. Satori cannot
  // lay out an image whose size it cannot determine, and a photo that failed to
  // load has no size - so without these, one unreachable URL throws "Image size
  // cannot be determined" and takes down the whole card rather than leaving a
  // single blank tile. A missing photo must cost a tile, not a post.
  const tileImageWidth = portrait ? 200 : 240;

  return (
    <Frame format={format} background={look.to} ink={look.ink}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: portrait ? 56 : 44,
          paddingBottom: format === "tiktok" ? 56 + TIKTOK_SAFE_BOTTOM : portrait ? 56 : 44,
          background: `linear-gradient(to bottom, ${look.from} 0%, ${look.to} 62%, ${look.to} 100%)`,
        }}
      >
        <BrandLockup
          format={format}
          brand={brand}
          label="SOLD THIS WEEK"
          muted={look.muted}
          surface={look.to}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            justifyContent: "center",
            gap: portrait ? 30 : 18,
          }}
        >
          {hero && (
            <div style={{ display: "flex", alignItems: "center", gap: portrait ? 34 : 26 }}>
              <div
                style={{
                  display: "flex",
                  width: heroSize,
                  height: heroSize,
                  flexShrink: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  background: look.cellFill,
                  borderRadius: look.radius,
                  ...(look.cellBorder ? { border: `1px solid ${look.cellBorder}` } : {}),
                }}
              >
                {photos[0] && (
                  <img
                    src={photos[0]}
                    width={heroSize}
                    height={heroSize}
                    // `contain`: a sale is a record of one specific shirt, and
                    // cropping its sleeves off to fill a square loses the thing
                    // the post is about.
                    style={{ objectFit: "contain", borderRadius: look.radius }}
                  />
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
                <div
                  style={{
                    display: "flex",
                    fontSize: portrait ? 44 : 33,
                    fontWeight: 700,
                    lineHeight: 1.12,
                  }}
                >
                  {[hero.team, hero.season].filter(Boolean).join(" ")}
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: portrait ? 25 : 19,
                    color: look.muted,
                    marginTop: 8,
                  }}
                >
                  {[hero.shirt_type, hero.condition].filter(Boolean).join(" · ")}
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: portrait ? 76 : 54,
                    fontWeight: 800,
                    marginTop: portrait ? 20 : 12,
                    letterSpacing: -1,
                  }}
                >
                  {String(hero.price ?? "")}
                </div>
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div style={{ display: "flex", gap: look.gap + 6 }}>
              {rest.map((s, i) => (
                <div
                  key={i}
                  style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0 }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: "100%",
                      height: tileHeight,
                      alignItems: "center",
                      justifyContent: "center",
                      background: look.cellFill,
                      borderRadius: look.radius,
                      ...(look.cellBorder ? { border: `1px solid ${look.cellBorder}` } : {}),
                    }}
                  >
                    {photos[i + 1] && (
                      <img
                        src={photos[i + 1]}
                        width={tileImageWidth}
                        height={tileHeight}
                        style={{ objectFit: "contain", borderRadius: look.radius }}
                      />
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      fontSize: portrait ? 27 : 20,
                      fontWeight: 700,
                      marginTop: 12,
                    }}
                  >
                    {String(s.price ?? "")}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      fontSize: portrait ? 18 : 14,
                      color: look.muted,
                      marginTop: 2,
                    }}
                  >
                    {/* Stacked, always two lines. Joined on one line,
                        "Manchester United 1990-91" wrapped where "AC Milan
                        1988-89" did not, so a row of four captions sat at
                        three different heights. Truncating to fit would have
                        cost the season, which on a shirt is half the caption,
                        so the row is two lines for everyone instead. */}
                    {String(s.team ?? "")}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      fontSize: portrait ? 18 : 14,
                      color: look.muted,
                      opacity: 0.75,
                    }}
                  >
                    {String(s.season ?? "")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", fontSize: 20, color: look.muted, opacity: 0.7 }}>
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

/**
 * Fallbacks only. The live values come from Settings -> Branding, so changing
 * them needs no deploy; these are what a card renders in if that read fails.
 */
const BRAND = DEFAULT_BRAND.accent;
const BRAND_DEEP = DEFAULT_BRAND.accentDeep;

/** Long product names are the norm, so the title sizes itself to fit. */
/**
 * How the non-photo cards read the six style keys.
 *
 * The grids and the chart were the templates that had no styles at all - one
 * dark card each, take it or leave it. The photo keys mean nothing to a 3x3 of
 * thumbnails ("round" is not a thing a grid can be), so this is the same
 * vocabulary expressed in the parts a grid actually has: the field it sits on,
 * how the cells are cut, and how loud the type is.
 *
 * It reads from the SAME styleFor() palette as the single-item card, so
 * choosing Paper on a Club Archive and on a Grail gives two cards that look
 * like they came from the same place - which is the whole reason the keys are
 * shared rather than per-template.
 */
interface GridLook {
  from: string;
  to: string;
  ink: string;
  muted: string;
  accent: string;
  /** Corner radius on a grid cell. */
  radius: number;
  /** Gap between cells. Zero makes the grid read as one block. */
  gap: number;
  /** Drawn round each cell, for the styles that want a keyline. */
  cellBorder: string | null;
  /** What sits behind a photo with transparency. */
  cellFill: string;
  /** Multiplies the headline. */
  titleScale: number;
  /** Letter-spacing on the small caps label. */
  tracking: number;
}


function gridLook(key: CardStyle, brand: Brand): GridLook {
  const palette = styleFor(key, brand);
  const base: GridLook = {
    from: palette.from,
    to: palette.to,
    ink: palette.ink,
    muted: palette.muted,
    accent: palette.accent,
    radius: 8,
    gap: 10,
    cellBorder: null,
    cellFill: "#ffffff",
    titleScale: 1,
    tracking: 2,
  };

  switch (key) {
    case "spotlight":
      // Tighter and darker, cells almost touching: the set reads as one object
      // under a light rather than nine separate pictures.
      return { ...base, radius: 4, gap: 5, titleScale: 0.95 };
    case "sweep":
      // The field is brand-tinted rather than neutral, so the white product
      // shots sit in something rather than float on black.
      //
      // A THIRD OF THE WAY, NOT ALL OF IT. The first version used accentDeep
      // neat and produced a card the brand green could not be read on - the
      // Price Trends hero number is green, and green on green is not a style.
      // It also drowned the lockup. A tint keeps the identity and leaves the
      // foreground somewhere to stand.
      return {
        ...base,
        from: mix(palette.from, brand.accentDeep, 0.34),
        to: palette.to,
        cellBorder: "rgba(255,255,255,0.22)",
      };
    case "paper":
      // Light card. Cells get a hairline because a white photo on off-white
      // has no edge of its own, and without one the grid dissolves.
      return {
        ...base,
        radius: 2,
        gap: 12,
        cellBorder: "rgba(20,24,29,0.16)",
        titleScale: 0.94,
      };
    case "editorial":
      // A contact sheet: square, butted up, type doing the work.
      //
      // NOT ACTUALLY ZERO GAP. Kickio's product shots are cut out on white, so
      // nine of them touching read as one white rectangle with no shirts in it
      // - the grid disappeared entirely. Two pixels and a dark keyline give the
      // block its ruled-sheet look and keep nine things visibly nine.
      return {
        ...base,
        radius: 0,
        gap: 2,
        cellBorder: "rgba(6,7,10,0.9)",
        titleScale: 1.22,
        tracking: 4,
      };
    case "frame":
      // Everything thin. Wide gaps, hairline cells, quiet type - the shirts
      // are the loudest thing on the card by a distance.
      return {
        ...base,
        radius: 0,
        gap: 16,
        cellBorder: palette.hairline,
        cellFill: "#ffffff",
        titleScale: 0.84,
        tracking: 3,
      };
    default:
      return base;
  }
}

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
      No renderable photo. Do not post
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
/**
 * The masthead band on a photo-led card, as a fixed height.
 *
 * Fixed rather than natural, because the stage below it has to be told how
 * tall it is and Satori gives no metrics back. A guessed reserve against a
 * natural height was out by enough to push the sign-off off the bottom edge;
 * pinning the band makes the subtraction exact instead of approximate. Sized
 * for the taller case, a configured logo mark over the url, so the wordmark
 * fallback gains air rather than the mark overflowing.
 */
const MASTHEAD_H = { portrait: 152, landscape: 112 };

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
  mode?: "sold" | "drop" | "grail" | "value";
}) {
  // Grail of the Day used to have its own layout - a full-bleed photo with
  // type over a scrim - and its own reading of the six style keys, which meant
  // "paper" was a different card on each template and the daily post was the
  // least considered of the three. It renders here now. The bleed look is not
  // lost: `editorial` is exactly that, and it is one option rather than the
  // only one.
  const available = mode !== "sold";
  const d = draft.source_data as Record<string, unknown>;
  // The eyebrow names the post; the badge states what is true of this one item.
  // Grail has no second fact to state - it is simply a shirt for sale - so it
  // carries no badge rather than repeating its own eyebrow back at the reader.
  const eyebrow =
    mode === "sold"
      ? "GRAIL SALE"
      : mode === "grail"
        ? "GRAIL OF THE DAY"
        : mode === "value"
          ? "VALUE PICK"
          : "KICKIO DROP";
  const badge =
    mode === "sold"
      ? "SOLD"
      : mode === "grail"
        ? null
        : mode === "value"
          ? `${String(d.discount_pct ?? "")}% BELOW`
          : "AVAILABLE NOW";
  const images = Array.isArray(d.images) ? (d.images as string[]) : [];
  const photo = images[0];
  const signals = Array.isArray(d.rarity_signals) ? (d.rarity_signals as string[]) : [];
  const portrait = format !== "x";
  const { width, height } = FORMATS[format];
  const shirt = d.shirt_colour as { hex: string; deep: string } | undefined;
  const palette = styleFor(style, brand, shirt);

  // "... Away Shirt Cantona #7" was wrapping with "#7" alone on line two.
  const title = noOrphan(String(d.title ?? draft.headline ?? ""));
  const price = String(d.price ?? "");
  // Season and club are already in the title; these add what it does not carry.
  const meta = [d.condition, d.size, d.printing].filter(Boolean).map(String);

  const pad = Math.round((portrait ? 56 : 46) * palette.inset);
  // Bleed fills its stage; everything else sits inside the inset.
  const bleed = palette.photo === "bleed";

  // Every card in the set now opens with the same thing: the lockup on the
  // left, the post type on the right. These four used to carry the mark at the
  // foot instead, so a feed of Kickio posts read as two designers rather than
  // one.
  const mastheadH = portrait ? MASTHEAD_H.portrait : MASTHEAD_H.landscape;
  const masthead = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        height: mastheadH,
        padding: `0 ${pad}px`,
        // Spans whatever it is dropped into. In a column it already would; in
        // the row the bleed style wraps it in, it would otherwise shrink to
        // its contents and the lockup's space-between would have nothing to
        // spread across.
        flexGrow: 1,
      }}
    >
      <BrandLockup
        format={format}
        brand={brand}
        label={eyebrow}
        muted={palette.muted}
        surface={palette.to}
        compact
      />
    </div>
  );
  // Only the portrait, non-bleed case puts it above the photograph, so only
  // that case has to give the photograph less room. `editorial` bleeds to the
  // top edge by design and keeps it; landscape has the photo beside the type,
  // so the masthead opens the column it belongs to.
  const mastheadOverStage = portrait && !bleed;
  const stageHeight = portrait
    ? Math.round(height * palette.stage) - (mastheadOverStage ? mastheadH : 0)
    : height;
  const stageWidth = portrait ? width : Math.round(width * 0.48);
  const photoW = bleed ? stageWidth : stageWidth - pad * 2;
  const photoH = bleed ? stageHeight : stageHeight - pad * 2;

  return (
    <Frame format={format} background={palette.to} ink={palette.ink}>
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
        {mastheadOverStage && masthead}

        {/* The bleed style paints the photograph edge to edge and sets the
            type over it, so the masthead is pinned to the top rather than
            given a band of its own. Placed before the photo in the DOM it
            would be painted under it: Satori paints in document order, so it
            goes after the scrim, further down. */}

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

        {bleed && (
          <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width }}>
            {masthead}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: bleed ? "flex-end" : portrait ? "flex-end" : "space-between",
            width: bleed ? width : portrait ? width : width - stageWidth,
            // The masthead band is a third row in portrait, so the column that
            // fills the rest has to subtract it as well as the stage. Without
            // that this box was a band too tall, and since it bottom-aligns its
            // contents, the overflow went off the bottom edge and took the
            // sign-off with it.
            height: bleed
              ? height
              : portrait
                ? height - stageHeight - (mastheadOverStage ? mastheadH : 0)
                : height,
            padding: pad,
            color: palette.ink,
            ...(bleed ? { position: "absolute", top: 0, left: 0 } : {}),
          }}
        >
          {/* Landscape keeps the photo beside the type, so the masthead opens
              the column it belongs to. The bleed style is handled separately:
              its column bottom-aligns everything over a full-frame photograph,
              so a masthead placed here would sit just above the title rather
              than at the top of the card. */}
          {!mastheadOverStage && !bleed && masthead}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: portrait ? 24 : 18,
              }}
            >
              {badge ? (
                <SoldBadge scale={portrait ? 1 : 0.85} accent={palette.accent} label={badge} />
              ) : (
                // Keeps the date and "Offers considered" on the right where
                // they belong when there is no badge to push them there.
                <div style={{ display: "flex" }} />
              )}
              {/* A Sale is dated; a Drop says whether the seller will haggle,
                  which is the more useful thing to know about one you can buy. */}
              {available ? (
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
              {mode === "value" ? "USUALLY " + String(d.typical_price ?? "") : available ? "BUY IT NOW" : "SOLD FOR"}
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
              {/* The mark moved to the masthead, so the foot is a sign-off
                  rather than a second logo. The condition and size are already
                  set under the title, so nothing goes on the left. */}
              <div style={{ display: "flex" }} />
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
  style = DEFAULT_CARD_STYLE,
}: {
  draft: PostDraft;
  format: FormatKey;
  brand: Brand;
  style?: CardStyle;
}) {
  const look = gridLook(style, brand);
  const d = draft.source_data as Record<string, unknown>;
  const photos = Array.isArray(d.images) ? (d.images as string[]) : [];
  const portrait = format !== "x";
  const { width, height } = FORMATS[format];
  const pad = portrait ? 52 : 42;

  // 3x3 in portrait, 4x2 in landscape - the frame decides the grid, and a row
  // that cannot be filled is dropped rather than left half empty.
  const cols = portrait ? 3 : 4;
  const maxRows = format === "tiktok" ? 4 : portrait ? 3 : 2;
  const gap = look.gap;
  // Sized by BOTH axes. Width alone fits 16:9 four-across at 271px, which eats
  // the whole frame and pushed the club's name off the bottom edge - the grid
  // has to leave room for the header and the type block, not just the margins.
  const headerH = lockupHeight(format);
  // 9:16 is a screen and a half taller than 4:5, and the grid cannot grow to
  // fill it without turning square photos into slabs. The type block takes
  // the extra room instead, which is how a tall frame is meant to be laid out.
  const typeH = format === "tiktok" ? 200 : portrait ? 168 : 124;
  // The safe area is not available height, so the grid must not size into it.
  const gridH =
    height - pad * 2 - headerH - typeH - (format === "tiktok" ? TIKTOK_SAFE_BOTTOM : 0);
  const usable = photos.slice(0, Math.min(photos.length - (photos.length % cols), cols * maxRows));
  // Sized by the rows that will be DRAWN, not the most the frame could hold.
  // Reserving four rows for three rows of photos left a band of empty card in
  // the middle and shrank every cell to pay for it.
  const rows = Math.max(1, Math.ceil(usable.length / cols));
  const cell = Math.min(
    Math.floor((width - pad * 2 - gap * (cols - 1)) / cols),
    Math.floor((gridH - gap * (rows - 1)) / rows),
  );

  return (
    <Frame format={format} background={look.to} ink={look.ink}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width,
          height,
          padding: pad,
          paddingBottom: format === "tiktok" ? pad + TIKTOK_SAFE_BOTTOM : pad,
          background: `linear-gradient(to bottom, ${look.from} 0%, ${look.to} 62%, ${look.to} 100%)`,
        }}
      >
        <BrandLockup
          format={format}
          brand={brand}
          label="CLUB ARCHIVE"
          muted={look.muted}
          surface={look.to}
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
                    borderRadius: look.radius,
                    background: look.cellFill,
                    marginRight: i < cols - 1 ? gap : 0,
                    ...(look.cellBorder ? { border: `1px solid ${look.cellBorder}` } : {}),
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
              fontSize: Math.round((portrait ? 56 : 42) * look.titleScale),
              fontWeight: 800,
              letterSpacing: -1,
              color: look.ink,
            }}
          >
            {String(d.team ?? "")}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 30 : 24,
              fontWeight: 700,
              color: look.accent,
              marginTop: 8,
            }}
          >
            {String(d.shirts ?? "")} shirts · {String(d.earliest ?? "")}–{String(d.latest ?? "")}
          </div>
          {/* Said on the card, not just in the caption: these are Kickio's
              holdings, not the club's kit history. */}
          <div style={{ display: "flex", fontSize: 19, color: look.muted, marginTop: 10 }}>
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
  style = DEFAULT_CARD_STYLE,
}: {
  draft: PostDraft;
  format: FormatKey;
  brand: Brand;
  style?: CardStyle;
}) {
  const look = gridLook(style, brand);
  const d = draft.source_data as Record<string, unknown>;
  const photos = Array.isArray(d.images) ? (d.images as string[]) : [];
  const portrait = format !== "x";
  const { width, height } = FORMATS[format];
  const pad = portrait ? 52 : 42;

  const cols = portrait ? 3 : 4;
  const maxRows = format === "tiktok" ? 4 : portrait ? 3 : 2;
  const gap = look.gap;
  const headerH = lockupHeight(format);
  // Taller than the archive card's: this one carries a third line, the hunt
  // list, and a line that does not fit is a line that pushes the fraction off
  // the bottom edge.
  // 9:16 is a screen and a half taller than 4:5, and the grid cannot grow to
  // fill it without turning square photos into slabs. The type block takes
  // the extra room instead, which is how a tall frame is meant to be laid out.
  const typeH = format === "tiktok" ? 250 : portrait ? 210 : 152;
  // The safe area is not available height, so the grid must not size into it.
  const gridH =
    height - pad * 2 - headerH - typeH - (format === "tiktok" ? TIKTOK_SAFE_BOTTOM : 0);
  const usable = photos.slice(0, Math.min(photos.length - (photos.length % cols), cols * maxRows));
  // Sized by the rows that will be DRAWN, not the most the frame could hold.
  // Reserving four rows for three rows of photos left a band of empty card in
  // the middle and shrank every cell to pay for it.
  const rows = Math.max(1, Math.ceil(usable.length / cols));
  const cell = Math.min(
    Math.floor((width - pad * 2 - gap * (cols - 1)) / cols),
    Math.floor((gridH - gap * (rows - 1)) / rows),
  );

  const hunting = Array.isArray(d.hunting) ? (d.hunting as string[]) : [];
  // Three names. Satori does not reflow gracefully, and a fourth pushes the
  // line past the frame on 16:9.
  const huntLine = hunting.slice(0, 3).join("  ·  ");

  return (
    <Frame format={format} background={look.to} ink={look.ink}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width,
          height,
          padding: pad,
          paddingBottom: format === "tiktok" ? pad + TIKTOK_SAFE_BOTTOM : pad,
          background: `linear-gradient(to bottom, ${look.from} 0%, ${look.to} 62%, ${look.to} 100%)`,
        }}
      >
        <BrandLockup
          format={format}
          brand={brand}
          label="GRAIL LIST"
          muted={look.muted}
          surface={look.to}
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
                    borderRadius: look.radius,
                    background: look.cellFill,
                    marginRight: i < cols - 1 ? gap : 0,
                    ...(look.cellBorder ? { border: `1px solid ${look.cellBorder}` } : {}),
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
              fontSize: Math.round((portrait ? 52 : 40) * look.titleScale),
              fontWeight: 800,
              letterSpacing: -1,
              color: look.ink,
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
              color: look.accent,
              marginTop: 8,
            }}
          >
            {String(d.buyable ?? "")} of {String(d.slots ?? "")} to buy
          </div>
          {huntLine ? (
            <div style={{ display: "flex", fontSize: portrait ? 20 : 18, color: look.muted, marginTop: 12 }}>
              Still hunting: {huntLine}
            </div>
          ) : null}
        </div>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------------------------
 * LEGEND CARD - several famous-player shirts, buyable now, named on the tile.
 *
 * A sibling of CollectionCard rather than a variant of it: that card's
 * headline is a fixed "X of Y to buy" fraction specific to a collection_sets
 * rule, which legend_shelf has no equivalent of - there is no denominator,
 * just a set of names. The grid math (cell sizing, row budget) follows the
 * same shape because it is already tuned per format; what differs is that the
 * name is not incidental here, it is why the tile is worth a second look, so
 * every photo carries its own label instead of sitting in an unlabelled wall
 * of thumbnails.
 * ------------------------------------------------------------------------- */

function LegendCard({
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
  const look = gridLook(style, brand);
  const d = draft.source_data as Record<string, unknown>;
  const photos = Array.isArray(d.images) ? (d.images as string[]) : [];
  const legends = Array.isArray(d.legends)
    ? (d.legends as Array<{ name?: unknown }>)
    : [];
  const portrait = format !== "x";
  const { width, height } = FORMATS[format];
  const pad = portrait ? 52 : 42;

  // Fewer, bigger tiles than the plain collection grid: a name label at this
  // size needs a cell it can actually sit on legibly, not a thumbnail.
  const cols = portrait ? 2 : 3;
  const maxRows = 3;
  const gap = look.gap;
  const headerH = lockupHeight(format);
  const typeH = format === "tiktok" ? 210 : portrait ? 180 : 140;
  const gridH =
    height - pad * 2 - headerH - typeH - (format === "tiktok" ? TIKTOK_SAFE_BOTTOM : 0);
  const usable = photos.slice(0, Math.min(photos.length, cols * maxRows));
  const rows = Math.max(1, Math.ceil(usable.length / cols));
  const cell = Math.min(
    Math.floor((width - pad * 2 - gap * (cols - 1)) / cols),
    Math.floor((gridH - gap * (rows - 1)) / rows),
  );
  const nameFontSize = Math.round(cell * 0.085);

  return (
    <Frame format={format} background={look.to} ink={look.ink}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width,
          height,
          padding: pad,
          paddingBottom: format === "tiktok" ? pad + TIKTOK_SAFE_BOTTOM : pad,
          background: `linear-gradient(to bottom, ${look.from} 0%, ${look.to} 62%, ${look.to} 100%)`,
        }}
      >
        <BrandLockup
          format={format}
          brand={brand}
          label="ON KICKIO NOW"
          muted={look.muted}
          surface={look.to}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} style={{ display: "flex", justifyContent: "center", marginBottom: gap }}>
              {usable.slice(row * cols, row * cols + cols).map((src, i) => {
                const entry = legends[row * cols + i];
                const name = typeof entry?.name === "string" ? entry.name : "";
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      position: "relative",
                      width: cell,
                      height: cell,
                      marginRight: i < cols - 1 ? gap : 0,
                    }}
                  >
                    <img
                      src={src}
                      alt=""
                      width={cell}
                      height={cell}
                      style={{
                        width: cell,
                        height: cell,
                        objectFit: "cover",
                        borderRadius: look.radius,
                        background: look.cellFill,
                        ...(look.cellBorder ? { border: `1px solid ${look.cellBorder}` } : {}),
                      }}
                    />
                    {name ? (
                      <div
                        style={{
                          display: "flex",
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          padding: "10px 12px",
                          background: "linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))",
                          borderBottomLeftRadius: look.radius,
                          borderBottomRightRadius: look.radius,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            fontSize: nameFontSize,
                            fontWeight: 700,
                            color: "#ffffff",
                          }}
                        >
                          {name}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: Math.round((portrait ? 46 : 36) * look.titleScale),
              fontWeight: 800,
              letterSpacing: -1,
              color: look.ink,
            }}
          >
            {String(d.headline_text ?? "Names you know")}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 24 : 20,
              fontWeight: 600,
              color: look.accent,
              marginTop: 8,
            }}
          >
            Buyable now
          </div>
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
  style = DEFAULT_CARD_STYLE,
}: {
  draft: PostDraft;
  format: FormatKey;
  brand: Brand;
  style?: CardStyle;
}) {
  const look = gridLook(style, brand);
  const d = draft.source_data as Record<string, unknown>;
  const photos = Array.isArray(d.images) ? (d.images as string[]) : [];
  const portrait = format !== "x";
  const { width, height } = FORMATS[format];
  const pad = portrait ? 52 : 42;

  const cols = portrait ? 3 : 4;
  const maxRows = format === "tiktok" ? 4 : portrait ? 3 : 2;
  const gap = look.gap;
  const headerH = lockupHeight(format);
  // 9:16 is a screen and a half taller than 4:5, and the grid cannot grow to
  // fill it without turning square photos into slabs. The type block takes
  // the extra room instead, which is how a tall frame is meant to be laid out.
  const typeH = format === "tiktok" ? 250 : portrait ? 210 : 152;
  // The safe area is not available height, so the grid must not size into it.
  const gridH =
    height - pad * 2 - headerH - typeH - (format === "tiktok" ? TIKTOK_SAFE_BOTTOM : 0);
  const usable = photos.slice(0, Math.min(photos.length - (photos.length % cols), cols * maxRows));
  // Sized by the rows that will be DRAWN, not the most the frame could hold.
  // Reserving four rows for three rows of photos left a band of empty card in
  // the middle and shrank every cell to pay for it.
  const rows = Math.max(1, Math.ceil(usable.length / cols));
  const cell = Math.min(
    Math.floor((width - pad * 2 - gap * (cols - 1)) / cols),
    Math.floor((gridH - gap * (rows - 1)) / rows),
  );

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
    <Frame format={format} background={look.to} ink={look.ink}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width,
          height,
          padding: pad,
          paddingBottom: format === "tiktok" ? pad + TIKTOK_SAFE_BOTTOM : pad,
          background: `linear-gradient(to bottom, ${look.from} 0%, ${look.to} 62%, ${look.to} 100%)`,
        }}
      >
        <BrandLockup
          format={format}
          brand={brand}
          label="COLLECTOR SPOTLIGHT"
          muted={look.muted}
          surface={look.to}
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
                    borderRadius: look.radius,
                    background: look.cellFill,
                    marginRight: i < cols - 1 ? gap : 0,
                    ...(look.cellBorder ? { border: `1px solid ${look.cellBorder}` } : {}),
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
              color: look.muted,
              letterSpacing: 1,
            }}
          >
            {String(d.collector ?? "")}
            {d.collector_title ? ` · ${String(d.collector_title)}` : ""}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: Math.round((portrait ? 50 : 38) * look.titleScale),
              fontWeight: 800,
              letterSpacing: -1,
              color: look.ink,
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
              color: look.accent,
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

/* ---------------------------------------------------------------------------
 * INDEX CHART - a collection revalued, drawn like a market chart.
 *
 * Rebased to 100 and labelled as an index, because that is what it is. There
 * is no field on this card that can hold a currency amount, which is
 * deliberate: the post is about a movement, and a named person's possessions
 * should never appear beside a valuation.
 *
 * The axis is labelled 100 at the left rather than left bare, so a reader can
 * see the rebasing rather than having to infer it.
 * ------------------------------------------------------------------------- */

function IndexCard({
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
  const look = gridLook(style, brand);
  const d = draft.source_data as Record<string, unknown>;
  const pct = Number(d.pct_change ?? 0);
  const rising = pct >= 0;
  const colour = rising ? brand.rising : brand.falling;
  const portrait = format !== "x";
  const { width, height } = FORMATS[format];
  const pad = portrait ? 56 : 44;

  const series = Array.isArray(d.series)
    ? (d.series as Array<{ index: number }>).map((p) => Number(p.index)).filter(Number.isFinite)
    : [];

  // Every size the layout maths below depends on, named once so the sums and
  // the JSX cannot drift apart. Satori returns no text metrics, so a block's
  // height has to be computed from what it is set in rather than measured.
  const collectorSize = portrait ? 26 : 21;
  const figureSize = Math.round((portrait ? 130 : 100) * look.titleScale);
  const arrowSize = portrait ? 76 : 60;
  const basketSize = portrait ? 27 : 22;
  const scaleSize = portrait ? 20 : 17;
  const sourceSize = portrait ? 23 : 19;
  const disclaimerSize = portrait ? 20 : 17;
  const LINE = 1.2;

  const heroH =
    collectorSize * LINE + 10 + Math.max(arrowSize, figureSize * LINE) + 4 + basketSize * LINE;
  const footerH = sourceSize * LINE + 6 + disclaimerSize * LINE;
  const scaleH = scaleSize * LINE + 6;
  const headerH = lockupHeight(format);
  // The gap between the figure and the line that shows it. They are one idea,
  // so it is smaller than the band around the pair.
  const heroToChart = portrait ? 34 : 20;

  // Everything the chart and its breathing space have to share.
  const room =
    height -
    pad * 2 -
    (format === "tiktok" ? TIKTOK_SAFE_BOTTOM : 0) -
    headerH -
    heroH -
    heroToChart -
    scaleH -
    footerH;

  // Air above the hero and below the chart: deliberate and equal, rather than
  // whatever is left over. Capped at a share of what there is, so that a style
  // with a larger title (`bold` sets titleScale to 1.22, which adds 26px to
  // the figure on 16:9) eats the band before it eats the chart, and never the
  // frame.
  const band = Math.max(0, Math.min(format === "tiktok" ? 120 : portrait ? 84 : 26, Math.round(room * 0.2)));

  const chartW = width - pad * 2;
  // THE CHART TAKES THE SLACK. It used to be a fixed 360 (420 on 9:16, 250 on
  // 16:9) under `space-between`, which failed in both directions: 4:5 had
  // 350px left over and divided it into three dead bands, so the figure sat as
  // far from its own line as it did from the masthead; 16:9 came out 51px
  // OVER the column, so the chart ran under the sign-off and off the bottom
  // edge. Sized from what is actually left, the way the grid cards size their
  // cells, neither can happen.
  const chartH = Math.max(90, Math.round(room - band * 2));
  const spark = sparklineDataUri(series, colour, chartW, chartH, look.to);

  return (
    <Frame format={format} background={look.to} ink={look.ink}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width,
          height,
          padding: pad,
          paddingBottom: format === "tiktok" ? pad + TIKTOK_SAFE_BOTTOM : pad,
          background: `linear-gradient(to bottom, ${look.from} 0%, ${look.to} 62%, ${look.to} 100%)`,
        }}
      >
        <BrandLockup
          format={format}
          brand={brand}
          label="COLLECTION INDEX"
          muted={look.muted}
          surface={look.to}
        />

        {/* The figure and the line that shows it are one idea, so they are one
            block with the slack around the pair rather than four siblings
            under space-between with the slack between them. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: collectorSize,
                color: look.muted,
                letterSpacing: 1,
              }}
            >
              {String(d.collector ?? "")}
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
              <img
                src={arrowDataUri(rising, colour, arrowSize)}
                alt=""
                width={arrowSize}
                height={arrowSize}
                style={{ marginRight: 16 }}
              />
              <div
                style={{
                  display: "flex",
                  fontSize: figureSize,
                  fontWeight: 800,
                  color: colour,
                  letterSpacing: -4,
                }}
              >
                {rising ? "+" : "−"}
                {Math.abs(pct).toFixed(1)}%
              </div>
            </div>
            <div style={{ display: "flex", fontSize: basketSize, color: look.muted, marginTop: 4 }}>
              same {String(d.basket ?? "")} shirts · nothing bought or sold
            </div>
          </div>

          {spark ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: heroToChart }}>
              {/* Labelled, so the rebasing is visible rather than inferred. */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: scaleSize,
                  color: look.muted,
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex" }}>{String(d.from ?? "")} = 100</div>
                <div style={{ display: "flex" }}>{String(d.to ?? "")}</div>
              </div>
              <img src={spark} alt="" width={chartW} height={chartH} />
            </div>
          ) : (
            <div
              style={{ display: "flex", fontSize: 24, color: look.muted, marginTop: heroToChart }}
            >
              Not enough recorded sales to draw the series
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: sourceSize, color: look.muted }}>
            Indexed on recorded sales of the same shirts
          </div>
          <div
            style={{
              display: "flex",
              fontSize: disclaimerSize,
              color: look.muted,
              opacity: 0.72,
              marginTop: 6,
            }}
          >
            An index, not a valuation · kickio.com
          </div>
        </div>
      </div>
    </Frame>
  );
}


/**
 * Price History - one shirt, and every sale we have a record of.
 *
 * The chart IS the post, which is the opposite of the Price Trends card next
 * door: there the figure is the message and the line is texture, so it carries
 * no labels at all. Here the individual results are the message - six sellers,
 * six prices - so every point wears its own price and its own date, and there
 * are no axes because a scale to read them against would be furniture.
 *
 * Two things are deliberately NOT done. The last point is not coloured red
 * when it is lower: a shirt selling for less is good news if you are buying,
 * and the stock-market reflex would put a verdict on the card that the data
 * does not support. And the spread is never called a value - the caveat line
 * is not decoration, it is the reason six numbers disagree.
 */
function PriceHistoryCard({
  draft,
  format,
  brand,
  style = "paper",
}: {
  draft: PostDraft;
  format: FormatKey;
  brand: Brand;
  style?: CardStyle;
}) {
  const d = draft.source_data as Record<string, unknown>;
  const palette = styleFor(style, brand, d.shirt_colour as { hex: string; deep: string } | undefined);
  const portrait = format !== "x";

  const points = Array.isArray(d.points)
    ? (d.points as Array<{
        sold_at: string;
        price: string;
        price_cents: number;
        size?: string | null;
        condition?: string | null;
      }>)
    : [];
  const values = points.map((p) => Number(p.price_cents)).filter(Number.isFinite);
  const photo = Array.isArray(d.images) ? (d.images as string[])[0] : null;

  // The title green is the brand's, deepened against the cream: accentDeep neat
  // is a mid green that sits at about 3:1 on this surface, which is thin for
  // anything but the largest type on the card.
  const greened = mix(palette.accent, palette.ink, 0.42);
  // Green where it reads, ink where it does not. On the tinted style the field
  // is already green, so everything that would have been green goes to ink.
  const live = palette.accentOnField ? greened : palette.ink;
  const titleInk = palette.titleTone === "accent" && palette.accentOnField ? greened : palette.ink;
  const lineColour = titleInk;

  const pad = portrait ? 56 : 44;
  // padX is half a label plus a margin, so the first and last prices stay
  // inside the card; padY is a label's height, so a peak's price has somewhere
  // to go. Both are why the line does not start in the corner.
  // 16:9 runs to the pixel: title (253) + chart (200 plot + 110 of dates and
  // grades) + caveat came to exactly the 587 the column has, so the caveat sat
  // hard on the bottom padding with nothing under it. The plot gives up the
  // clearance; it is the one element here that loses nothing by being shorter,
  // because every value it carries is also printed beside its dot.
  const box: ChartBox = portrait
    ? { width: 968, height: 300, padX: 84, padY: 64 }
    : { width: 704, height: 164, padX: 62, padY: 40 };

  // Narrower than the gap between two points, or two prices on the same side
  // of a rising line overlap.
  const labelW = portrait ? 150 : 110;
  const labelSize = portrait ? 30 : 21;
  const dateSize = portrait ? 30 : 21;
  const specSize = portrait ? 23 : 18;
  const dotR = portrait ? 11 : 8;
  const gap = portrait ? 18 : 13;
  // The last point says "Latest" above its price, so its block is a line taller
  // and has to be lifted by that much when it sits above the line.
  const latestExtra = Math.round(labelSize * 1.15);

  // How far each label reaches toward its neighbours, so the anchor can be
  // lifted clear of a steep leg rather than sitting on it.
  const spacing = values.length > 1 ? (box.width - box.padX * 2) / (values.length - 1) : box.width;
  const marks = plotted(values, box, labelW / 2 / spacing);
  // Size and grade, already normalised by the recipe - Kickio's size column
  // carries scraped junk, so nothing unrecognised gets this far.
  // Two lines rather than one. "XXL · Very Good" set on a single line is wider
  // than the gap between two points, so it wrapped mid-grade ("XXL · Very /
  // Good") and shoved the caveat off the bottom of the card. Stacked, the
  // widest thing either line has to hold is "Very Good".
  // Always two slots, even when a row has no size: leaving the slot out let the
  // grade jump up a line and the row of grades stopped lining up across the
  // chart, which reads as a mistake rather than as a gap in the data.
  const spec = points.map((p) => [p.size ?? "", p.condition ?? ""]);
  const anySpec = spec.some(([size, condition]) => size || condition);
  const dates = axisDates(points.map((p) => p.sold_at));
  const line = priceLineSvg(marks, box, {
    colour: lineColour,
    surface: palette.to,
    stroke: (portrait ? 6 : 4.5) * palette.chart.stroke,
    dot: dotR * (palette.chart.dots === "open" ? 0.85 : 1),
    dots: palette.chart.dots,
    fill: palette.chart.fill > 0 ? withAlpha(lineColour, palette.chart.fill) : null,
    baseline: palette.chart.baseline ? palette.hairline : null,
  });

  const chart = (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: box.width,
        // Room under the plot for the dates and what each sale actually was,
        // and under those for the "Latest" block when the last sale is the
        // lowest one - which is exactly when its two lines hang furthest down.
        // Enough for the date, then two lines of size and grade beneath it -
        // these are absolutely positioned, so they do not grow the box and a
        // few pixels short means they land on whatever comes next.
        height: box.height + (portrait ? 152 : 110),
      }}
    >
      {line && (
        <img
          src={line}
          alt=""
          width={box.width}
          height={box.height}
          style={{ position: "absolute", left: 0, top: 0, width: box.width, height: box.height }}
        />
      )}

      {marks.map((mark, i) => {
        const last = i === marks.length - 1;
        const height = labelSize * 1.25 + (last ? latestExtra : 0);
        return (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: mark.above ? "flex-end" : "flex-start",
              position: "absolute",
              left: mark.x - labelW / 2,
              top: mark.above ? mark.anchorY - dotR - gap - height : mark.anchorY + dotR + gap,
              width: labelW,
              height,
            }}
          >
            {last && (
              <div style={{ display: "flex", fontSize: labelSize * 0.82, color: palette.muted }}>
                Latest
              </div>
            )}
            <div style={{ display: "flex", fontSize: labelSize, fontWeight: 700, color: palette.ink }}>
              {String(points[i]?.price ?? "")}
            </div>
          </div>
        );
      })}

      {/* Under each point: when it sold, then what it actually was. Without
          the second line the chart shows six prices for "the same shirt",
          which is exactly the reading it should not invite - an XL Brand New
          and an M Good are not the same shirt at two prices. */}
      {marks.map((mark, i) => (
        <div
          key={`d${i}`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "absolute",
            left: mark.x - labelW / 2,
            top: box.height + (portrait ? 46 : 32),
            width: labelW,
          }}
        >
          <div style={{ display: "flex", fontSize: dateSize, color: palette.ink }}>
            {dates[i] ?? ""}
          </div>
          {anySpec &&
            spec[i].map((line, n) => (
              <div
                key={n}
                style={{
                  display: "flex",
                  height: Math.round(specSize * 1.2),
                  fontSize: specSize,
                  color: palette.muted,
                  marginTop: n === 0 ? (portrait ? 8 : 5) : 2,
                }}
              >
                {line}
              </div>
            ))}
        </div>
      ))}
    </div>
  );

  const stock = (d.in_stock ?? null) as { line?: unknown } | null;
  const stockLine = typeof stock?.line === "string" ? stock.line : null;

  const footnote = [
    d.subtitle ? String(d.subtitle) : null,
    Number(d.total_recorded_sales ?? 0) > Number(d.recorded_sales ?? 0)
      ? `most recent of ${String(d.total_recorded_sales ?? "")} on record`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const title = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          fontSize: Math.round((portrait ? 78 : 58) * palette.titleScale),
          fontWeight: 800,
          letterSpacing: -2,
          lineHeight: 1.06,
          color: titleInk,
        }}
      >
        {(() => {
          const set = [String(d.title_lead ?? ""), String(d.title_main ?? "")]
            .filter(Boolean)
            .join(" · ");
          // Uppercased here rather than with textTransform: Satori supports
          // the property, but doing it in the string means the measured width
          // and the drawn width are the same thing.
          return palette.titleCase === "upper" ? set.toUpperCase() : set;
        })()}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: portrait ? 38 : 30,
          fontWeight: 700,
          color: palette.ink,
          marginTop: portrait ? 18 : 12,
        }}
      >
        {String(d.recorded_sales ?? "")} recorded sales · {String(d.price_low ?? "")}–
        {String(d.price_high ?? "")}
      </div>
      {/* The one thing on this card a reader can act on today, so it sits
          directly under the range and is the only line in the brand colour. */}
      {stockLine ? (
        <div
          style={{
            display: "flex",
            // Sized so the longest line this can produce - "From £1,299.99 on
            // Kickio now, below the £1,164.49 median" - still sets on one
            // line. A wrap here pushes the caveat off the bottom edge.
            fontSize: portrait ? 32 : 23,
            fontWeight: 700,
            color: live,
            marginTop: portrait ? 14 : 10,
          }}
        >
          {stockLine}
        </div>
      ) : null}

      {/* One muted line, not two. The maker and the cut, and - said plainly,
          because "6 recorded sales" beside a chart drawn from the last six of
          thirty would be a false count - how much record is behind it. */}
      {footnote ? (
        <div style={{ display: "flex", fontSize: portrait ? 26 : 21, color: palette.muted, marginTop: 10 }}>
          {footnote}
        </div>
      ) : null}

      {/* A rule closing the header, on the two styles built out of rules.
          Cheap, and it is most of what makes a card read as a catalogue page
          rather than a dark card with the colours swapped. */}
      {palette.headRule ? (
        <div
          style={{
            display: "flex",
            height: 1,
            backgroundColor: palette.hairline,
            marginTop: portrait ? 26 : 18,
          }}
        />
      ) : null}
    </div>
  );

  // Specific where the rows allow it ("Good at the bottom, Brand New at the
  // top"), and the general warning where they do not. The recipe decides,
  // because it is a claim about the data and belongs with the other claims.
  const caveat = String(d.caveat ?? "Recorded sales vary by size and condition");


  if (!portrait) {
    return (
      <Frame format={format} background={palette.to} ink={palette.ink}>
        <div style={{ display: "flex", width: "100%", height: "100%", padding: pad }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: 380,
              marginRight: 28,
            }}
          >
            {photo ? (
              <img
                src={photo}
                alt=""
                width={380}
                height={380}
                style={{ width: 380, height: 380, objectFit: "contain" }}
              />
            ) : (
              <div style={{ display: "flex", width: 380, height: 380 }} />
            )}
            <BrandLockup format={format} brand={brand} muted={palette.muted} surface={palette.to} />
          </div>

          {/* An explicit width, not flexGrow. Satori gives a growing column
              its content's width first, so the title ran straight off the
              right-hand edge of the card instead of wrapping. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: 704,
            }}
          >
            {title}
            {chart}
            {/* Two lines at this width, so it is set smaller than the portrait
                card's and given its own line height rather than being allowed
                to sit on the grades above it. */}
            <div
              style={{
                display: "flex",
                fontSize: 17,
                lineHeight: 1.4,
                color: palette.muted,
                // An explicit floor under the gap, not just whatever
                // space-between has left: without it the caveat lands a dozen
                // pixels under the grades and reads as another axis row.
                marginTop: 14,
              }}
            >
              {caveat}
            </div>
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame format={format} background={palette.to} ink={palette.ink}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: pad,
          paddingBottom: format === "tiktok" ? pad + TIKTOK_SAFE_BOTTOM : pad,
        }}
      >
        {/* At the top rather than the foot: the chart needs every pixel it can
            get at the bottom of the card, and a lockup squeezed in under it
            simply ran off the edge. */}
        <BrandLockup
          format={format}
          brand={brand}
          label="PRICE HISTORY"
          muted={palette.muted}
          surface={palette.to}
        />

        {title}

        {photo ? (
          <img
            src={photo}
            alt=""
            width={520}
            height={238}
            style={{ width: 520, height: 238, objectFit: "contain", alignSelf: "center" }}
          />
        ) : (
          <div style={{ display: "flex", height: 40 }} />
        )}

        <div style={{ display: "flex", flexDirection: "column" }}>
          {chart}
          <div style={{ display: "flex", fontSize: 24, color: palette.muted, marginTop: 10 }}>
            {caveat}
          </div>
        </div>
      </div>
    </Frame>
  );
}


/**
 * Who Am I? - six club shirts, career order, and a question.
 *
 * The shirts ARE the puzzle, which decides almost every choice here: no club
 * names, no crests called out, no year under each tile. Labelling them is
 * answering them. What is allowed is the shape of the career - how many clubs,
 * how many countries, which years - because that sets the difficulty without
 * giving anything away, and it is the line that makes a scroller stop.
 *
 * Six across on 16:9 and three-by-two on 4:5. A 3x2 grid in a landscape frame
 * leaves tiles too short to read a shirt in; a single row in a portrait frame
 * wastes the height.
 */
function WhoAmICard({
  draft,
  format,
  brand,
  style = "paper",
}: {
  draft: PostDraft;
  format: FormatKey;
  brand: Brand;
  style?: CardStyle;
}) {
  const palette = styleFor(style, brand);
  const d = draft.source_data as Record<string, unknown>;
  const portrait = format !== "x";
  const shirts = (Array.isArray(d.images) ? (d.images as string[]) : []).slice(0, 6);

  const titleInk = mix(palette.accent, palette.ink, 0.42);
  const pad = portrait ? 56 : 44;
  const teammateNote = typeof d.teammate_note === "string" ? d.teammate_note : null;

  const { width, height } = FORMATS[format];
  const cols = portrait ? 3 : 6;
  const gap = portrait ? 18 : 14;

  const facts = [
    `${String(d.clubs_shown ?? shirts.length)} clubs`,
    `${String(d.countries ?? "")} ${Number(d.countries ?? 0) === 1 ? "country" : "countries"}`,
    String(d.span ?? ""),
  ]
    .filter((line) => !line.startsWith("undefined") && line.trim() !== "")
    .join(" · ");

  const rows: string[][] = [];
  for (let i = 0; i < shirts.length; i += cols) rows.push(shirts.slice(i, i + cols));

  // Named once and used by both the sums below and the JSX: Satori returns no
  // text metrics, so a block's height has to be computed from what it is set
  // in, and the two would otherwise drift apart.
  const titleSize = portrait ? 96 : 66;
  const factsSize = portrait ? 34 : 26;
  const noteSize = portrait ? 27 : 21;
  const askSize = portrait ? 30 : 22;
  const factsGap = portrait ? 10 : 6;
  const noteGap = portrait ? 8 : 5;
  const LINE = 1.2;

  const typeH =
    titleSize * LINE +
    (facts ? factsGap + factsSize * LINE : 0) +
    (teammateNote ? noteGap + noteSize * LINE : 0);
  const askH = askSize * LINE;
  // Three gaps to reserve, because the column is laid out with space-between
  // over four blocks. Reserving two would leave the third to be found
  // somewhere, which is how the tiles ended up short of their own row.
  const band = format === "tiktok" ? 110 : portrait ? 56 : 30;
  const gridH =
    height -
    pad * 2 -
    (format === "tiktok" ? TIKTOK_SAFE_BOTTOM : 0) -
    lockupHeight(format) -
    typeH -
    askH -
    band * 3;

  // SQUARE, AND SIZED BY BOTH AXES. The tile used to be cellW wide by a fixed
  // 355 tall (390 without the teammate line), and the shirt was drawn into it
  // with `contain` and no plate of its own - so the white a reader saw was the
  // photograph's own background, and Kickio's photographs are not all the same
  // shape. Six tiles came out six visibly different sizes, and none of them
  // filled the height the row had reserved. The plate belongs to the card now,
  // identical for every tile whatever shape the photo inside it is.
  const cell = Math.max(
    80,
    Math.min(
      Math.floor((width - pad * 2 - gap * (cols - 1)) / cols),
      Math.floor((gridH - gap * (Math.max(1, rows.length) - 1)) / Math.max(1, rows.length)),
    ),
  );
  // A hairline of black rather than a style colour: it has to read as an edge
  // on the cream card and on the dark green one alike. Black at a low alpha,
  // not a grey, so it darkens whatever it is over instead of fighting it: at
  // 0.28 it came out #b7b7b7 against the white plate and read as a highlight
  // rather than a line.
  const keyline = portrait ? 2 : 1;
  const keylineInk = "rgba(0,0,0,0.58)";
  const plate = cell - keyline * 2;
  // A little air inside the plate, so the shirt is not sitting on the keyline.
  const inset = portrait ? 8 : 5;
  const shot = plate - inset * 2;

  return (
    <Frame format={format} background={palette.to} ink={palette.ink}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: pad,
          paddingBottom: format === "tiktok" ? pad + TIKTOK_SAFE_BOTTOM : pad,
        }}
      >
        <BrandLockup
          format={format}
          brand={brand}
          label="GUESS THE CAREER"
          muted={palette.muted}
          surface={palette.to}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: titleSize,
              fontWeight: 800,
              letterSpacing: -3,
              color: titleInk,
            }}
          >
            Who am I?
          </div>
          {facts && (
            <div
              style={{
                display: "flex",
                fontSize: factsSize,
                fontWeight: 700,
                color: palette.ink,
                marginTop: factsGap,
              }}
            >
              {facts}
            </div>
          )}
          {/* Said on the card, not just in the caption. A named shirt in a row
              of blank ones otherwise reads as the answer being handed over, or
              as a mistake - and the caption is not always what gets seen. */}
          {teammateNote && (
            <div
              style={{
                display: "flex",
                fontSize: noteSize,
                color: palette.muted,
                marginTop: noteGap,
              }}
            >
              {teammateNote}
            </div>
          )}
        </div>

        {/* Career order, left to right and top to bottom. It reads as a story
            and it is a fair extra clue - the first tile is where he started. */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((row, r) => (
            <div
              key={r}
              style={{ display: "flex", justifyContent: "center", marginTop: r === 0 ? 0 : gap }}
            >
              {row.map((src, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    width: plate,
                    height: plate,
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#ffffff",
                    borderRadius: 6,
                    border: `${keyline}px solid ${keylineInk}`,
                    marginRight: i < row.length - 1 ? gap : 0,
                  }}
                >
                  {/* Explicit width and height, always: Satori cannot lay out
                      an image whose size it cannot determine, and a photo that
                      failed to load has none. Without these one unreachable
                      URL takes the whole card down instead of leaving a single
                      plate empty, and an empty plate is still the right size. */}
                  <img
                    src={src}
                    alt=""
                    width={shot}
                    height={shot}
                    style={{ width: shot, height: shot, objectFit: "contain" }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", fontSize: askSize, color: palette.muted }}>
          Six clubs, one career. Answer in the comments.
        </div>
      </div>
    </Frame>
  );
}


/**
 * Most Wanted - a ranked countdown, and the gap between what sells and what is
 * left on the shelf.
 *
 * THE NUMBER IS THE PICTURE. The card leads on the rate, not the rank: "24
 * sales for every one listed" is the thing a collector stops for, and the
 * position in the list is only how it is ordered. So the hero carries the
 * figure at title size and the tiles beneath carry theirs small, rather than a
 * numbered list with the interesting part in a caption.
 *
 * `listed` is on every tile on purpose. A most-wanted post that does not say
 * how few are left is a post about popularity, and popularity is what the raw
 * sales ranking measured before this recipe stopped using it.
 */
function MostWantedCard({
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
  const look = gridLook(style, brand);
  const d = draft.source_data as Record<string, unknown>;
  const portrait = format !== "x";
  const pad = portrait ? 56 : 44;

  const featured = Array.isArray(d.featured)
    ? (d.featured as Array<Record<string, unknown>>).slice(0, 5)
    : [];
  // Index-aligned with `featured` by contract - the recipe only features a
  // subject it has a photo for, precisely so this holds. If it ever does not, a
  // tile draws without its picture rather than borrowing the next shirt's.
  const photos = Array.isArray(d.images) ? (d.images as unknown[]).map(String) : [];

  const hero = featured[0];
  const rest = featured.slice(1);

  const heroSize = portrait ? 400 : 210;
  const tileHeight = portrait ? 190 : 118;
  const tileImageWidth = portrait ? 180 : 210;
  // AN EXPLICIT WIDTH, NOT flexGrow. Satori gives a growing column its
  // content's width first, so "Manchester United 1996-97 Home" ran straight
  // off the right edge and the kit - the part that makes the subject one
  // shirt rather than three - was the bit that got cut. Same trap, same fix,
  // as the price history card's type column.
  const heroTextWidth = (portrait ? 1080 : 1200) - pad * 2 - heroSize - (portrait ? 34 : 26);

  return (
    <Frame format={format} background={look.to} ink={look.ink}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: pad,
          paddingBottom: format === "tiktok" ? pad + TIKTOK_SAFE_BOTTOM : pad,
          background: `linear-gradient(to bottom, ${look.from} 0%, ${look.to} 62%, ${look.to} 100%)`,
        }}
      >
        <BrandLockup
          format={format}
          brand={brand}
          label="MOST WANTED"
          muted={look.muted}
          surface={look.to}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            justifyContent: "center",
            gap: portrait ? 30 : 18,
          }}
        >
          {hero && (
            <div style={{ display: "flex", alignItems: "center", gap: portrait ? 34 : 26 }}>
              <div
                style={{
                  display: "flex",
                  width: heroSize,
                  height: heroSize,
                  flexShrink: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  background: look.cellFill,
                  borderRadius: look.radius,
                  ...(look.cellBorder ? { border: `1px solid ${look.cellBorder}` } : {}),
                }}
              >
                {photos[0] && (
                  <img
                    src={photos[0]}
                    width={heroSize}
                    height={heroSize}
                    style={{ objectFit: "contain", borderRadius: look.radius }}
                  />
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", width: heroTextWidth }}>
                <div
                  style={{
                    display: "flex",
                    fontSize: portrait ? 40 : 31,
                    fontWeight: 700,
                    lineHeight: 1.12,
                  }}
                >
                  {[hero.team, hero.season, hero.kit].filter(Boolean).join(" ")}
                </div>

                {/* The rate, at title size, because it is the story. */}
                <div style={{ display: "flex", alignItems: "baseline", marginTop: portrait ? 16 : 10 }}>
                  <div
                    style={{
                      display: "flex",
                      fontSize: Math.round((portrait ? 110 : 80) * look.titleScale),
                      fontWeight: 800,
                      letterSpacing: -3,
                      color: look.accent,
                    }}
                  >
                    {String(hero.pressure ?? "")}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      fontSize: portrait ? 30 : 22,
                      color: look.muted,
                      marginLeft: 12,
                    }}
                  >
                    sales per one for sale
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    fontSize: portrait ? 27 : 20,
                    color: look.muted,
                    marginTop: portrait ? 10 : 6,
                  }}
                >
                  {String(hero.sales ?? "")} tracked sales · {String(hero.listed ?? "")} for sale on
                  Kickio
                </div>
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div style={{ display: "flex", gap: look.gap + 6 }}>
              {rest.map((s, i) => (
                <div
                  key={i}
                  style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0 }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: "100%",
                      height: tileHeight,
                      alignItems: "center",
                      justifyContent: "center",
                      background: look.cellFill,
                      borderRadius: look.radius,
                      ...(look.cellBorder ? { border: `1px solid ${look.cellBorder}` } : {}),
                    }}
                  >
                    {photos[i + 1] && (
                      <img
                        src={photos[i + 1]}
                        width={tileImageWidth}
                        height={tileHeight}
                        style={{ objectFit: "contain", borderRadius: look.radius }}
                      />
                    )}
                  </div>
                  {/* Club then season on separate lines. Joined on one they
                      wrapped mid-season and cost the year. */}
                  <div
                    style={{
                      display: "flex",
                      fontSize: portrait ? 22 : 16,
                      fontWeight: 700,
                      marginTop: 12,
                    }}
                  >
                    {String(s.team ?? "")}
                  </div>
                  <div
                    style={{ display: "flex", fontSize: portrait ? 18 : 14, color: look.muted, marginTop: 2 }}
                  >
                    {[s.season, s.kit].filter(Boolean).join(" · ")}
                  </div>
                  <div
                    style={{ display: "flex", fontSize: portrait ? 18 : 14, color: look.accent, marginTop: 4 }}
                  >
                    {String(s.pressure ?? "")}× · {String(s.listed ?? "")} for sale
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: portrait ? 23 : 19, color: look.muted }}>
            Tracked sales over {String(d.window_days ?? 90)} days for each one of the same shirt
            for sale · club, season and kit all match
          </div>
          {/* Provenance, on every card built on this table: the sales are the
              market's, the shirts for sale are Kickio's. */}
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 20 : 17,
              color: look.muted,
              opacity: 0.72,
              marginTop: 6,
            }}
          >
            Market-wide sales data tracked by Kickio · kickio.com
          </div>
        </div>
      </div>
    </Frame>
  );
}


/**
 * Battle of the Shirts - two shirts, a VS, and a question.
 *
 * THE LOUDEST CARD IN THE SET, ON PURPOSE. Every other template here is
 * restrained because it is carrying a number that has to be believed. This one
 * is carrying a question, and a question nobody notices gets no replies. So it
 * gets the diagonal split, the full-height shirts and the badge in the middle,
 * which is the visual language of every matchday graphic a football account
 * has ever posted.
 *
 * It stays on brand by keeping the furniture: the same masthead, the same
 * eyebrow, the same style palette as the rest. What changes is the composition,
 * not the identity.
 *
 * A AND B, NOT LEFT AND RIGHT. The reply has to be one character. Naming the
 * corners on the card is what lets the copy say "A or B?" and makes voting
 * cost nothing, which is the whole mechanism - there is no poll, the comments
 * ARE the poll.
 *
 * NO SCORE, EVER. Kickio holds no vote count: the votes are replies on a
 * network this engine cannot read. There is deliberately nowhere on this card
 * for a tally, so a future change cannot quietly start printing one.
 */
function BattleCard({
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
  const look = gridLook(style, brand);
  const d = draft.source_data as Record<string, unknown>;
  const portrait = format !== "x";
  const { width, height } = FORMATS[format];
  const pad = portrait ? 56 : 44;

  const a = (d.a ?? {}) as Record<string, unknown>;
  const b = (d.b ?? {}) as Record<string, unknown>;
  const photos = Array.isArray(d.images) ? (d.images as unknown[]).map(String) : [];

  const headerH = lockupHeight(format);
  const askH = portrait ? 116 : 84;
  const gap = portrait ? 16 : 20;
  const panelW = Math.floor((width - pad * 2 - gap) / 2);

  // TWO FULL PANELS, NOT TWO PHOTOGRAPHS ON A DARK CARD.
  //
  // Kickio's product shots are cut out on their own pale backgrounds and
  // nothing here can change that. The first version put each one in a white
  // box on the dark field, and the boxes read as the design: two big slabs of
  // white with a small shirt floating in each. So the white is made
  // deliberate instead - a panel per corner, sized to the photograph's own
  // proportions, with the caption laid over the foot of it. The shirt fills
  // its half and the plate stops being visible as a plate.
  //
  // 1.18 rather than square: catalogue shots are a little taller than wide,
  // so this is close to the shape the photograph actually fills and leaves
  // the least dead white.
  const idealPanelH = Math.round(panelW * 1.18);
  const stageMax = height - pad * 2 - (format === "tiktok" ? TIKTOK_SAFE_BOTTOM : 0) - headerH - askH;
  // The hero line only earns its room in a tall frame. On 16:9 there is none
  // to spare and the eyebrow plus the ask bar already say what this is.
  const heroH = portrait ? Math.max(0, stageMax - idealPanelH - 28) : 0;
  const panelH = Math.min(idealPanelH, stageMax - heroH - (portrait ? 28 : 0));
  const capH = portrait ? 92 : 68;
  const badge = portrait ? 140 : 104;

  // A COLUMN, NOT AN OVERLAY. The caption was absolutely positioned at the
  // foot of the panel, and Satori laid it out below the panel instead - the
  // string `borderRadius` shorthand is not supported and takes the rest of the
  // rule with it. A plain column needs no absolute positioning and cannot fail
  // that way: photo box, then caption strip, both inside the one panel.
  const corner = (
    side: Record<string, unknown>,
    photo: string | undefined,
    letter: string,
  ) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: panelW,
        height: panelH,
        borderRadius: look.radius,
        background: "#ffffff",
        ...(look.cellBorder ? { border: `1px solid ${look.cellBorder}` } : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          width: panelW,
          height: panelH - capH,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {photo && (
          <img
            src={photo}
            width={panelW}
            height={panelH - capH}
            /* `contain`: this is a beauty contest. Cropping the sleeves off a
               shirt to fill a panel loses the thing being voted on. */
            style={{ width: panelW, height: panelH - capH, objectFit: "contain" }}
          />
        )}
      </div>

      <div
        style={{
          display: "flex",
          width: panelW,
          height: capH,
          alignItems: "center",
          paddingLeft: portrait ? 20 : 14,
          background: look.to,
        }}
      >
        <div
          style={{
            display: "flex",
            width: portrait ? 56 : 42,
            height: portrait ? 56 : 42,
            flexShrink: 0,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: portrait ? 28 : 21,
            background: look.accent,
            color: look.to,
            fontSize: portrait ? 32 : 24,
            fontWeight: 800,
            marginRight: portrait ? 14 : 10,
          }}
        >
          {letter}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 29 : 21,
              fontWeight: 700,
              color: look.ink,
            }}
          >
            {String(side.team ?? "")}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 22 : 16,
              color: look.muted,
              marginTop: 2,
            }}
          >
            {[side.season, side.kit].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Frame format={format} background={look.to} ink={look.ink}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width,
          height,
          padding: pad,
          paddingBottom: format === "tiktok" ? pad + TIKTOK_SAFE_BOTTOM : pad,
          background: `linear-gradient(to bottom, ${look.from} 0%, ${look.to} 62%, ${look.to} 100%)`,
        }}
      >
        <BrandLockup
          format={format}
          brand={brand}
          label="BATTLE OF THE SHIRTS"
          muted={look.muted}
          surface={look.to}
        />

        {/* The hero line. A question nobody notices gets no replies, and the
            eyebrow alone was not loud enough to stop a thumb. */}
        {heroH > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              height: heroH,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: Math.round(Math.min(heroH * 0.52, 132) * look.titleScale),
                fontWeight: 800,
                letterSpacing: -4,
                lineHeight: 1,
                color: look.ink,
              }}
            >
              Which one?
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            position: "relative",
            width: width - pad * 2,
            height: panelH,
            marginTop: portrait ? 28 : 0,
            justifyContent: "space-between",
          }}
        >
          {corner(a, photos[0], "A")}
          {corner(b, photos[1], "B")}

          {/* Over the seam between the two panels. Absolute and last in the
              DOM: Satori paints in document order and honours z-index only
              partially, so placed earlier it would be painted underneath. */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: Math.round((width - pad * 2 - badge) / 2),
              top: Math.round((panelH - capH) / 2 - badge / 2),
              width: badge,
              height: badge,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: badge / 2,
              background: look.accent,
              color: look.to,
              fontSize: portrait ? 54 : 40,
              fontWeight: 800,
              letterSpacing: -2,
              border: `${portrait ? 8 : 6}px solid ${look.to}`,
            }}
          >
            VS
          </div>
        </div>

        {/* The ask, as a bar rather than a line, because it is the only
            instruction on the card and the entire mechanism: there is no poll,
            the replies are the poll. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            height: askH,
            marginTop: portrait ? 24 : 16,
            paddingLeft: portrait ? 28 : 22,
            paddingRight: portrait ? 28 : 22,
            borderRadius: look.radius,
            background: look.accent,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 42 : 31,
              fontWeight: 800,
              color: look.to,
              letterSpacing: -1,
            }}
          >
            Reply A or B
          </div>
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 22 : 17,
              color: look.to,
              opacity: 0.8,
              marginTop: 4,
            }}
          >
            {String(d.framing ?? "Settle it in the comments")} · kickio.com
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
    case "who_am_i_card":
      return (
        <WhoAmICard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "price_history_card":
      return (
        <PriceHistoryCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "trend_chart":
      return (
        <TrendCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "roundup_card":
      return (
        <RoundupCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "archive_grid":
      return (
        <ArchiveCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "collection_grid":
      return (
        <CollectionCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "legend_grid":
      return (
        <LegendCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "index_chart":
      return (
        <IndexCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "collector_grid":
      return (
        <CollectorCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "grail_sale_card":
      return (
        <GrailSaleCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "battle_card":
      return (
        <BattleCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "most_wanted_card":
      return (
        <MostWantedCard
          draft={draft}
          format={format}
          brand={brand}
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
    case "value_card":
      return (
        <GrailSaleCard
          draft={draft}
          format={format}
          brand={brand}
          mode="value"
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
        <GrailSaleCard
          draft={draft}
          format={format}
          brand={brand}
          mode="grail"
          style={style ?? asCardStyle((draft.generation as { style?: unknown })?.style)}
        />
      );
  }
}
