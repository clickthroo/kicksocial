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
/**
 * The engine's accent, so the cards and the dashboard read as one system.
 * Kickio's own brand hex was not recorded anywhere in either database - swap
 * these two values and every Grail Sale card follows.
 */
const BRAND = "#35d07f";
const BRAND_DEEP = "#12a862";

/** Long product names are the norm, so the title sizes itself to fit. */
function titleSize(title: string, portrait: boolean): number {
  const base = portrait ? 56 : 38;
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
          fontSize: 19 * scale,
          fontWeight: 800,
          letterSpacing: 4 * scale,
          padding: `${8 * scale}px ${17 * scale}px`,
          background: BRAND,
          color: "#06210f",
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

/**
 * The field behind the shirt.
 *
 * Linear, not radial. Satori accepts `radial-gradient` and then renders it
 * anchored and scaled quite differently from a browser - the first attempt at
 * this card came back with the fall-off pushed into one corner and the shirt
 * swallowed. Linear gradients are already proven here (the Grail card's scrim),
 * so the light is built from one.
 */
function StudioField({ width, height }: { width: number; height: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        display: "flex",
        width,
        height,
        background: `linear-gradient(to bottom, ${STUDIO_LIFT} 0%, ${STUDIO} 58%, #06070a 100%)`,
      }}
    />
  );
}

function GrailSaleCard({ draft, format }: { draft: PostDraft; format: FormatKey }) {
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

  const stageHeight = portrait ? Math.round(height * 0.58) : height;
  const stageWidth = portrait ? width : Math.round(width * 0.48);
  const pad = portrait ? 56 : 46;

  return (
    <Frame format={format} background={STUDIO}>
      <StudioField width={width} height={height} />

      <div
        style={{
          display: "flex",
          flexDirection: portrait ? "column" : "row",
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
            padding: pad,
          }}
        >
          {photo ? (
            /* Kickio's photography is catalogue shots on their own pale
               backgrounds, and nothing here can change that. Feathering that
               background into a dark field needs per-pixel work the renderer
               cannot do, and faking it with a gradient left a bright rectangle
               with a smudge around it. So the panel is deliberate instead: an
               inset, rounded plate, lit against the dark - a shirt presented
               under glass rather than a photo pasted onto a card. Any photo,
               any background, and it still reads as designed. */
            <img
              src={photo}
              alt=""
              width={stageWidth - pad * 2}
              height={stageHeight - pad * 2}
              style={{
                width: stageWidth - pad * 2,
                height: stageHeight - pad * 2,
                // The whole shirt, never a crop of it - a sale is a record of
                // one specific shirt, and cropping its sleeves off to fill a
                // frame loses the thing the post is about.
                objectFit: "contain",
                borderRadius: 10,
                // White, because `contain` letterboxes a photo whose aspect does
                // not match the plate, and these are catalogue shots on white or
                // near-white. A warmer plate leaves visible bars down the sides.
                background: "#ffffff",
              }}
            />
          ) : (
            <MissingPhoto width={stageWidth - pad * 2} height={stageHeight - pad * 2} />
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: portrait ? "flex-end" : "space-between",
            width: portrait ? width : width - stageWidth,
            height: portrait ? height - stageHeight : height,
            padding: pad,
            color: STUDIO_INK,
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
              <SoldBadge scale={portrait ? 1 : 0.85} />
              {d.sold_at ? (
                <div style={{ display: "flex", fontSize: portrait ? 20 : 17, color: STUDIO_MUTED }}>
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
                  fontSize: portrait ? 22 : 18,
                  color: STUDIO_MUTED,
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
                      border: `1px solid rgba(246,247,249,0.3)`,
                      color: STUDIO_INK,
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
                color: BRAND,
                marginBottom: portrait ? 8 : 5,
              }}
            >
              SOLD FOR
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
                borderTop: `1px solid rgba(246,247,249,0.16)`,
              }}
            >
              <Wordmark style={{ fontSize: portrait ? 25 : 21, opacity: 1 }} />
              <div
                style={{
                  display: "flex",
                  fontSize: portrait ? 19 : 16,
                  fontWeight: 600,
                  color: BRAND_DEEP,
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

export function templateFor(draft: PostDraft, format: FormatKey): React.ReactElement {
  const template =
    (draft.generation as { visual_template?: string })?.visual_template ?? "grail_card";

  switch (template) {
    case "trend_chart":
      return <TrendCard draft={draft} format={format} />;
    case "roundup_card":
      return <RoundupCard draft={draft} format={format} />;
    case "grail_sale_card":
      return <GrailSaleCard draft={draft} format={format} />;
    default:
      return <GrailCard draft={draft} format={format} />;
  }
}
