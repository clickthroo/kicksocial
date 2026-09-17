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
const UP = "#0ca30c";
const DOWN = "#9085e9";

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

function Wordmark({ style }: { style?: React.CSSProperties }) {
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
      KICKIO
    </div>
  );
}

/** Grail of the Day - the photo is the hero, type sits over a scrim. */
function GrailCard({ draft, format }: { draft: PostDraft; format: FormatKey }) {
  const d = draft.source_data as Record<string, unknown>;
  const images = Array.isArray(d.images) ? (d.images as string[]) : [];
  const photo = images[0];
  const signals = Array.isArray(d.rarity_signals) ? (d.rarity_signals as string[]) : [];
  const portrait = format === "ig";

  return (
    <Frame format={format}>
      {photo ? (
        <img
          src={photo}
          alt=""
          width={FORMATS[format].width}
          height={FORMATS[format].height}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: FORMATS[format].width,
            height: FORMATS[format].height,
            objectFit: "cover",
          }}
        />
      ) : (
        /* Recipes only produce drafts with renderable photography, so this is a
           fault, not a layout state. Say so plainly rather than shipping a card
           that merely looks dark. */
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: FORMATS[format].width,
            height: FORMATS[format].height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#2a1416",
            color: "#f2565a",
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          No renderable photo — do not post
        </div>
      )}
      {/* Scrim: keeps type legible over any photograph. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: FORMATS[format].width,
          height: FORMATS[format].height,
          background:
            "linear-gradient(to bottom, rgba(10,12,15,0.72) 0%, rgba(10,12,15,0.12) 38%, rgba(10,12,15,0.88) 100%)",
          display: "flex",
        }}
      />

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
          <Wordmark />
          <div
            style={{
              display: "flex",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 2,
              padding: "8px 16px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.22)",
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
                    background: "rgba(255,255,255,0.16)",
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
              fontSize: portrait ? 60 : 46,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -1,
              marginBottom: 14,
            }}
          >
            {String(d.title ?? draft.headline ?? "")}
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: portrait ? 52 : 42, fontWeight: 800 }}>
              {String(d.price ?? "")}
            </div>
            {d.condition ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 24,
                  color: INK_MUTED,
                  marginLeft: 20,
                  paddingLeft: 20,
                  borderLeft: `2px solid ${INK_MUTED}`,
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
function TrendCard({ draft, format }: { draft: PostDraft; format: FormatKey }) {
  const d = draft.source_data as Record<string, unknown>;
  const pct = Number(d.pct_change ?? 0);
  const rising = pct >= 0;
  const colour = rising ? UP : DOWN;
  const portrait = format === "ig";

  const series = Array.isArray(d.series)
    ? (d.series as Array<{ index_value: number }>).map((p) => Number(p.index_value)).filter(Number.isFinite)
    : [];
  const sparkW = portrait ? 960 : 1080;
  const sparkH = portrait ? 300 : 210;
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Wordmark />
          <div style={{ display: "flex", fontSize: 20, color: INK_MUTED, letterSpacing: 2 }}>
            MARKET TREND
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: portrait ? 44 : 34,
              color: INK_MUTED,
              marginBottom: 8,
            }}
          >
            {String(d.label ?? "")}
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
function RoundupCard({ draft, format }: { draft: PostDraft; format: FormatKey }) {
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Wordmark />
          <div style={{ display: "flex", fontSize: 20, color: INK_MUTED, letterSpacing: 2 }}>
            SOLD THIS WEEK
          </div>
        </div>

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
 * Just Sold
 *
 * Deliberately not the Grail card's treatment. That one lays type over the
 * photograph, which suits something you can still buy - the shirt is the offer.
 * A sale is a finished event, so this is composed like an auction result: the
 * photograph in its own panel, the result set beside it on paper.
 *
 * It also removes a real risk. Type over an unknown photograph is legible only
 * as far as the scrim holds up, and the price is the one element here that must
 * never be hard to read. On paper it is near-black on off-white at any size.
 * ------------------------------------------------------------------------- */

const PAPER = "#f2efe9";
const PAPER_INK = "#14181d";
const PAPER_MUTED = "#6f6b64";
/** Deep green on warm paper: settled, not "available". ~7:1 against PAPER. */
const SOLD_ACCENT = "#0f6b43";

/** Long product names are the norm, so the title sizes itself to fit. */
function titleSize(title: string, portrait: boolean): number {
  const base = portrait ? 58 : 40;
  if (title.length > 62) return Math.round(base * 0.68);
  if (title.length > 44) return Math.round(base * 0.8);
  if (title.length > 30) return Math.round(base * 0.9);
  return base;
}

function SoldBadge({ scale = 1 }: { scale?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          fontSize: 20 * scale,
          fontWeight: 800,
          letterSpacing: 4 * scale,
          padding: `${9 * scale}px ${18 * scale}px`,
          background: PAPER_INK,
          color: PAPER,
        }}
      >
        SOLD
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

function JustSoldCard({ draft, format }: { draft: PostDraft; format: FormatKey }) {
  const d = draft.source_data as Record<string, unknown>;
  const images = Array.isArray(d.images) ? (d.images as string[]) : [];
  const photo = images[0];
  const signals = Array.isArray(d.rarity_signals) ? (d.rarity_signals as string[]) : [];
  const portrait = format === "ig";
  const { width, height } = FORMATS[format];

  const title = String(d.title ?? draft.headline ?? "");
  const price = String(d.price ?? "");
  // Season and club are already in the title; these add what it does not carry.
  const meta = [d.condition, d.size, d.printing].filter(Boolean).map(String);

  // Portrait gets the smaller share of the frame for the photo than instinct
  // suggests: at 0.6 the type panel overflowed and cut the wordmark off the
  // bottom. The price is the point of the card, so the panel wins the argument.
  const photoBox = portrait
    ? { width, height: Math.round(height * 0.52) }
    : { width: Math.round(width * 0.46), height };
  const pad = portrait ? 56 : 48;

  return (
    <Frame format={format} background={PAPER}>
      <div
        style={{
          display: "flex",
          flexDirection: portrait ? "column" : "row",
          width,
          height,
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            width={photoBox.width}
            height={photoBox.height}
            style={{ ...photoBox, objectFit: "cover" }}
          />
        ) : (
          <MissingPhoto {...photoBox} />
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: portrait ? width : width - photoBox.width,
            height: portrait ? height - photoBox.height : height,
            padding: pad,
            color: PAPER_INK,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: portrait ? 26 : 20,
              }}
            >
              <SoldBadge scale={portrait ? 1 : 0.85} />
              {d.sold_at ? (
                <div style={{ display: "flex", fontSize: portrait ? 20 : 17, color: PAPER_MUTED }}>
                  {String(d.sold_at)}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                fontSize: titleSize(title, portrait),
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
                  fontSize: portrait ? 23 : 19,
                  color: PAPER_MUTED,
                  marginTop: 14,
                }}
              >
                {meta.join("  ·  ")}
              </div>
            )}

            {signals.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", marginTop: portrait ? 22 : 16 }}>
                {signals.slice(0, 2).map((sig) => (
                  <div
                    key={sig}
                    style={{
                      display: "flex",
                      fontSize: portrait ? 19 : 16,
                      fontWeight: 700,
                      letterSpacing: 1,
                      padding: portrait ? "7px 13px" : "6px 11px",
                      marginRight: 9,
                      marginTop: 8,
                      border: `1px solid ${PAPER_INK}`,
                      color: PAPER_INK,
                    }}
                  >
                    {sig.toUpperCase()}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: portrait ? 18 : 0 }}>
            {/* Hairline: the one accent on the card, and it points at the price.
                Wider than a chip on purpose - at chip width it read as an
                underline of the chip above it rather than as a rule. */}
            <div
              style={{
                display: "flex",
                width: portrait ? 140 : 76,
                height: 4,
                background: SOLD_ACCENT,
                marginBottom: portrait ? 22 : 14,
              }}
            />
            <div
              style={{
                display: "flex",
                fontSize: portrait ? 26 : 21,
                fontWeight: 700,
                letterSpacing: 3,
                color: SOLD_ACCENT,
                marginBottom: portrait ? 6 : 4,
              }}
            >
              SOLD FOR
            </div>
            <div
              style={{
                display: "flex",
                fontSize: portrait ? 92 : 76,
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
                marginTop: portrait ? 34 : 24,
                paddingTop: portrait ? 22 : 16,
                borderTop: `1px solid rgba(20,24,29,0.16)`,
              }}
            >
              <Wordmark style={{ color: PAPER_INK, opacity: 1, fontSize: portrait ? 26 : 22 }} />
              <div style={{ display: "flex", fontSize: portrait ? 19 : 16, color: PAPER_MUTED }}>
                kickio.com
              </div>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function templateFor(draft: PostDraft, format: FormatKey): React.ReactElement {
  const template =
    (draft.generation as { visual_template?: string })?.visual_template ?? "grail_card";

  switch (template) {
    case "trend_chart":
      return <TrendCard draft={draft} format={format} />;
    case "roundup_card":
      return <RoundupCard draft={draft} format={format} />;
    case "just_sold_card":
      return <JustSoldCard draft={draft} format={format} />;
    default:
      return <GrailCard draft={draft} format={format} />;
  }
}
