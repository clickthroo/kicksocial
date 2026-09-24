/**
 * Sold This Week - a roundup of notable recent sales.
 *
 * TWO CONSTRAINTS THAT SHAPE THIS RECIPE
 *
 * 1. FRAMING. Kickio's sales_history is overwhelmingly third-party market data:
 *    cfs 18,579 / vfs 9,913 / ebay 597 / shopify 611, and only 8 rows sourced
 *    from `kickio` itself. So these posts describe THE MARKET, never "sold on
 *    Kickio". Claiming sales volume Kickio doesn't have would be false, and
 *    trivially checkable by any collector. The prompt enforces this too.
 *
 * 2. ACCESS. As of 2026-09-16 `sales_history` has an INSERT policy but no SELECT
 *    policy, so Kickio's publishable key reads 0 rows. This recipe therefore
 *    returns a clear, actionable skip rather than an empty post. It starts
 *    working the moment the engine is given a credential that can read the
 *    table - no code change needed. See docs/schema-findings.md.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { recentlyFeatured } from "./cooldown.ts";
import { salesReadable } from "./sales-access.ts";
import { formatPrice } from "../kickio/pricing.ts";
import { cleanValue } from "../kickio/values.ts";
import { pageIn } from "../kickio/page.ts";
import { imageUrls } from "./grail-of-the-day.ts";

interface SaleRow {
  id: string;
  product_id: string | null;
  sold_at: string;
  price_cents: number;
  currency: string;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  condition: string | null;
  player_name: string | null;
  source: string;
  item_kind: string | null;
}

export interface SoldThisWeekConfig {
  windowDays: number;
  /** How many sales to feature in the roundup. */
  featureCount: number;
  /** Need at least this many sales in the window for a roundup to be worth posting. */
  minSales: number;
  /** Only include sales at or above this, to keep the roundup interesting. */
  minPriceCents: number;
  /**
   * Fewest photo-backed sales worth a card. Below this the grid looks broken
   * rather than sparse, and no post beats a bad one.
   */
  minFeatured: number;
  cooldownDays: number;
}

export const DEFAULT_SOLD_CONFIG: SoldThisWeekConfig = {
  windowDays: 7,
  featureCount: 5,
  minSales: 10,
  minPriceCents: 10_000,
  minFeatured: 3,
  cooldownDays: 6,
};

/** ISO week key, so a given week is only ever posted once. */
export function weekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * The sales this card may show: has a photo, and one tile per shirt.
 *
 * ONE TILE PER PRODUCT, NEVER TWO. A popular shirt sells more than once a week
 * and `sales` is one row per sale, so without this the same Atletico Madrid
 * 1999-00 appeared in two tiles at the same price - which reads as a rendering
 * bug rather than as two genuine sales.
 *
 * Expects `sales` ordered by price descending, so the first occurrence of a
 * product is its dearest sale of the week. Exported because the rule is worth
 * testing without a database behind it.
 */
export function showableSales<T extends { product_id: string | null }>(
  sales: T[],
  photoFor: Map<string, string>,
): T[] {
  const seen = new Set<string>();
  return sales.filter((s) => {
    if (!s.product_id || !photoFor.has(s.product_id)) return false;
    if (seen.has(s.product_id)) return false;
    seen.add(s.product_id);
    return true;
  });
}

export async function runSoldThisWeek(
  config: SoldThisWeekConfig = DEFAULT_SOLD_CONFIG,
): Promise<RecipeResult> {
  const since = new Date(Date.now() - config.windowDays * 86_400_000).toISOString();

  const { data, error } = await kickio()
    .from("sales_history")
    .select(
      "id,product_id,sold_at,price_cents,currency,team,season,shirt_type,condition," +
        "player_name,source,item_kind",
    )
    .gte("sold_at", since)
    .is("excluded_at", null)
    .is("dismissed_at", null)
    .eq("review_state", "approved")
    .gte("price_cents", config.minPriceCents)
    .order("price_cents", { ascending: false })
    .limit(200);

  if (error) return { ok: false, reason: `Kickio query failed: ${error.message}` };

  const sales = (data ?? []) as unknown as SaleRow[];

  if (sales.length === 0) {
    // Ask the table, do not assume. Zero rows for ONE WEEK is genuinely
    // ambiguous - unreadable table, or a quiet week - and this used to answer
    // "no permission" either way. That was right while the engine was blind and
    // becomes a lie the moment it is not: the first quiet week after the
    // credential lands would be reported as a permissions fault, sending
    // someone to fix something that is not broken.
    const readable = await salesReadable();
    return {
      ok: false,
      reason: readable
        ? `No sale in the last ${config.windowDays} days clears ` +
          `${formatPrice(config.minPriceCents)} - a quiet week, not a fault`
        : "The engine cannot see Kickio's recorded sales — sales_history read " +
          "as empty even unfiltered. The `kickio_content_reader` role was " +
          "applied on 2026-09-19, so this is the credential, not the grant: " +
          "KICKIO_SUPABASE_PUBLISHABLE_KEY is still an `anon` key. Mint a JWT " +
          "carrying the `kickio_content_reader` role claim and set it on the " +
          "content engine (docs/unblocking-sold-this-week.md).",
      diagnostics: {
        windowDays: config.windowDays,
        rowsReturned: 0,
        salesTableReadable: readable,
      },
    };
  }

  if (sales.length < config.minSales) {
    return {
      ok: false,
      reason: `Only ${sales.length} qualifying sales this week (need ${config.minSales})`,
      diagnostics: { rowsReturned: sales.length },
    };
  }

  const subjectRef = weekKey(new Date());
  const seen = await recentlyFeatured("sold_this_week", config.cooldownDays);
  if (seen.has(subjectRef)) {
    return { ok: false, reason: `Week ${subjectRef} already covered` };
  }

  // The card is photo-led, so the featured set is the dearest sales THAT HAVE A
  // PHOTO, not simply the dearest. Two reasons it is done this way rather than
  // leaving gaps in the grid:
  //
  //   * `withRenderablePhotos` transcodes `source_data.images` as a flat array,
  //     so the photos have to line up with `featured` by index. A sale without
  //     one would shift every photo after it onto the wrong shirt - a silent
  //     error, and the worst kind: a real price under the wrong shirt.
  //   * A tile with no picture in a row of pictures reads as a mistake.
  //
  // Only about a third of tracked sales carry a photo (23 of 79 this week;
  // never fewer than 23 in any of the last eight weeks), because market-wide
  // records from outside Kickio have no product behind them. So this post is
  // "notable sales we can show", and the copy must not imply it is a ranking of
  // every sale. `skipped_no_photo` records what was left out, so the gap is
  // visible on the run log rather than invisible.
  const productIds = [...new Set(sales.map((s) => s.product_id).filter((id): id is string => !!id))];

  const products = await pageIn<{ id: string; primary_image_url: string | null }, string>(
    "Loading sale photos",
    productIds,
    (batch, from, to) =>
      kickio()
        .from("products")
        .select("id,primary_image_url")
        .in("id", batch)
        .order("id", { ascending: true })
        .range(from, to),
  );

  const photoFor = new Map<string, string>();
  for (const product of products) {
    const url = imageUrls([product.primary_image_url])[0];
    if (url) photoFor.set(product.id, url);
  }

  const showable = showableSales(sales, photoFor);
  const featured = showable.slice(0, config.featureCount);

  if (featured.length < config.minFeatured) {
    return {
      ok: false,
      reason:
        `Only ${featured.length} of ${sales.length} qualifying sales have a photo ` +
        `(need ${config.minFeatured}) - a roundup of blank tiles is worse than no post`,
      diagnostics: { qualifying: sales.length, withPhoto: showable.length },
    };
  }

  const photos = featured.map((s) => photoFor.get(s.product_id!)!);
  // Completed sales elsewhere, so no buyer protection fee applies here - but
  // pence still must not be rounded away.
  const gbp = (cents: number) => formatPrice(cents, "GBP");

  // One claim per shirt shown, and nothing aggregate.
  //
  // The counts that used to be here - how many sales were tracked, their total
  // value, the breakdown by source - are gone deliberately. They invited the
  // copy to lead with volume ("79 sales this week"), which is a statistic about
  // Kickio's data pipeline rather than a reason for a collector to care. It was
  // also a number about ALL qualifying sales while the card showed a
  // photo-backed subset, so the two disagreed.
  //
  // Note also what is NOT claimed: none of these says "the top sale this week".
  // The dearest sale of the week may have no photo and so not be here at all.
  const claims: Claim[] = featured.map((s) => ({
    statement:
      `${[cleanValue(s.team), cleanValue(s.season), cleanValue(s.shirt_type)]
        .filter(Boolean)
        .join(" ")} sold for ${gbp(s.price_cents)}`,
    value: s.price_cents / 100,
    source: `sales_history.price_cents (id ${s.id})`,
    basis: "Market-wide data aggregated by Kickio, not Kickio's own sales",
  }));

  const candidate: RecipeCandidate = {
    subjectRef,
    headline: `Sold this week — ${[cleanValue(featured[0].team), cleanValue(featured[0].season)]
      .filter(Boolean)
      .join(" ")} at ${gbp(featured[0].price_cents)}`,
    sourceData: {
      week: subjectRef,
      window_days: config.windowDays,
      data_scope: "market-wide (third-party sales data aggregated by Kickio)",
      // How many were left out for want of a photo. Diagnostic only - it is not
      // in any claim, and the brief forbids putting a count in the copy.
      skipped_no_photo: sales.length - showable.length,
      // Placeholders ("Unknown", "N/A", "Other") are dropped rather than
      // written into copy as though they were facts.
      featured: featured.map((s) => ({
        id: s.id,
        price: gbp(s.price_cents),
        team: cleanValue(s.team),
        season: cleanValue(s.season),
        shirt_type: cleanValue(s.shirt_type),
        condition: cleanValue(s.condition),
        player_name: cleanValue(s.player_name),
        sold_at: s.sold_at,
        source: s.source,
      })),
    },
    claims,
    // Index-aligned with `featured`. The render route transcodes these through
    // src/lib/render/photos.ts, so a WebP-only shirt still draws.
    images: photos,
  };

  return { ok: true, candidate };
}
