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
import { formatPrice } from "../kickio/pricing.ts";

interface SaleRow {
  id: string;
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
  cooldownDays: number;
}

export const DEFAULT_SOLD_CONFIG: SoldThisWeekConfig = {
  windowDays: 7,
  featureCount: 5,
  minSales: 10,
  minPriceCents: 10_000,
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

export async function runSoldThisWeek(
  config: SoldThisWeekConfig = DEFAULT_SOLD_CONFIG,
): Promise<RecipeResult> {
  const since = new Date(Date.now() - config.windowDays * 86_400_000).toISOString();

  const { data, error } = await kickio()
    .from("sales_history")
    .select(
      "id,sold_at,price_cents,currency,team,season,shirt_type,condition," +
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
    // Distinguish "no sales" from "cannot see sales" - they need different fixes.
    return {
      ok: false,
      reason:
        "No readable sales in the window. Kickio's publishable key currently has " +
        "no SELECT policy on sales_history, so this recipe cannot run until the " +
        "engine is granted read access to that table.",
      diagnostics: { windowDays: config.windowDays, rowsReturned: 0, likelyCause: "rls_no_select_policy" },
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

  const featured = sales.slice(0, config.featureCount);
  // Completed sales elsewhere, so no buyer protection fee applies here - but
  // pence still must not be rounded away.
  const gbp = (cents: number) => formatPrice(cents, "GBP");

  const total = sales.reduce((sum, s) => sum + s.price_cents, 0);
  const sourceBreakdown = sales.reduce<Record<string, number>>((acc, s) => {
    acc[s.source] = (acc[s.source] ?? 0) + 1;
    return acc;
  }, {});

  const claims: Claim[] = [
    {
      statement: `${sales.length} tracked sales above ${gbp(config.minPriceCents)} in the last ${config.windowDays} days`,
      value: sales.length,
      source: "sales_history (approved, not excluded)",
      basis: "Market-wide data aggregated by Kickio, not Kickio's own sales",
    },
    {
      statement: `Top sale ${gbp(featured[0].price_cents)}`,
      value: featured[0].price_cents / 100,
      source: `sales_history.price_cents (id ${featured[0].id})`,
    },
    {
      statement: `Median featured sale ${gbp(featured[Math.floor(featured.length / 2)].price_cents)}`,
      value: featured[Math.floor(featured.length / 2)].price_cents / 100,
      source: "sales_history.price_cents",
    },
  ];

  const candidate: RecipeCandidate = {
    subjectRef,
    headline: `Sold this week: ${featured.length} notable shirts, top at ${gbp(featured[0].price_cents)}`,
    sourceData: {
      week: subjectRef,
      window_days: config.windowDays,
      total_sales_considered: sales.length,
      aggregate_value: gbp(total),
      source_breakdown: sourceBreakdown,
      data_scope: "market-wide (third-party sales data aggregated by Kickio)",
      featured: featured.map((s) => ({
        id: s.id,
        price: gbp(s.price_cents),
        team: s.team,
        season: s.season,
        shirt_type: s.shirt_type,
        condition: s.condition,
        player_name: s.player_name,
        sold_at: s.sold_at,
        source: s.source,
      })),
    },
    claims,
    images: [],
  };

  return { ok: true, candidate };
}
