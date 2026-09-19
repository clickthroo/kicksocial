/**
 * Collection Index - one collector's shirts, revalued, indexed to 100.
 *
 * The post says "this collection is up 18% over six months" and shows the
 * curve. It never says what the collection is worth.
 *
 * WHY THIS DOES NOT READ `collection_snapshots`
 *
 * Kickio already stores a daily `total_cents` per collector, and using it would
 * have been a morning's work. Auditing it first is what stopped that:
 *
 *   One account's collection "rose 64%" - £87.00 to £142.99 on 30 August. The
 *   shirt's only recorded sales were £142.99 in June and July, both BEFORE the
 *   £87 snapshot. Nothing about the shirt changed. The valuation switched from
 *   a fallback estimate to the sale price, and the difference between the two
 *   methods appeared as growth.
 *
 * Nine of another account's fourteen shirts have no recorded sale at all, yet
 * the stored total prices them anyway - £243 of £777.95 comes from shirts with
 * no sale behind them. So the stored total is a mixture of two bases, and the
 * ratio between two dates is not a market movement.
 *
 * This recipe therefore recomputes the basket itself, from sales it can see,
 * with the same method at both ends. Same lesson as Market Index: a stored
 * aggregate is a convenience, not a source.
 *
 * THE RULE THAT MAKES IT LIKE-FOR-LIKE
 *
 * A shirt is only in the index if it had a recorded sale ON OR BEFORE the start
 * of the window AND was in the collection by then. A shirt whose first sale
 * lands mid-window would otherwise arrive as pure growth - the same bug as the
 * method switch, wearing a different hat. Shirts that fail either test are
 * excluded and counted, and the post says so.
 *
 * WHAT IT NEVER PUBLISHES
 *
 * Any amount of money. The series is rebased to 100 at the start, which is how
 * a financial chart works anyway, and means a named person's possessions never
 * appear next to a valuation.
 */
import { kickio } from "../kickio/client.ts";
import { pageIn } from "../kickio/page.ts";
import { salesAccess } from "./sales-access.ts";
import type { Claim, RecipeResult } from "../engine/types.ts";
import {
  loadCollectors,
  postable,
  subjectRefFor as collectorRef,
  type CollectorOption,
} from "./collector-access.ts";

export const COLLECTION_INDEX_KEY = "collection_index";

export interface SaleRow {
  product_id: string;
  price_cents: number;
  sold_at: string;
}

export interface HoldingRow {
  user_id: string;
  product_id: string;
  /** When the shirt entered the collection. `acquired_at` is null on every row. */
  created_at: string;
}

export interface CollectionIndexConfig {
  /** How far back the chart looks. */
  windowDays: number;
  /** Points on the curve. */
  points: number;
  /**
   * Fewest shirts that must be valuable at BOTH ends for a curve to mean
   * anything. One shirt moving is not an index.
   */
  minBasket: number;
  /** Smallest move worth posting, either way. */
  minAbsPctChange: number;
  /**
   * How many recent sales to median when a shirt has several.
   *
   * One recorded sale is enough to value a shirt - that is the whole stock of
   * evidence for most of the catalogue, and refusing it would mean refusing
   * nearly everything. Where more exist they are used: the median of the last
   * few is steadier than the latest, which lets one odd sale set the price.
   */
  recentSales: number;
  /**
   * How recent a sale has to be to count towards the value on a date.
   *
   * Without this, a shirt with a sale 300 days ago and another last week was
   * valued at the midpoint of the two - half of its "today" price set by a
   * price from three seasons ago. Sales inside the window are medianed; if
   * there are none, the last one before the date is carried forward, which is
   * what every real index does when nothing has traded.
   */
  recencyDays: number;
  /** Do not feature the same collector again inside this. */
  cooldownDays: number;
  upNext?: string[];
  excludeUserIds?: string[];
}

export const DEFAULT_COLLECTION_INDEX_CONFIG: CollectionIndexConfig = {
  windowDays: 182,
  points: 7,
  minBasket: 8,
  minAbsPctChange: 3,
  recentSales: 3,
  recencyDays: 180,
  // Shorter than the other collector recipes on purpose: a collection that
  // keeps growing is a continuing story, and the change rule below stops it
  // repeating the same number.
  cooldownDays: 90,
  upNext: [],
  excludeUserIds: [],
};

/** Middle value; the mean of the middle two when the count is even. */
export function median(values: number[]): number | null {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * What one shirt was worth on a given date, from recorded sales of that exact
 * shirt and nothing else.
 *
 * Only sales dated on or before `asOf` count, so the same function produces
 * both ends of the window and a later sale can never leak backwards into the
 * starting value.
 */
export function valueAt(
  sales: SaleRow[],
  asOf: Date,
  recentSales = DEFAULT_COLLECTION_INDEX_CONFIG.recentSales,
  recencyDays = DEFAULT_COLLECTION_INDEX_CONFIG.recencyDays,
): number | null {
  const at = asOf.getTime();
  const upto = sales
    .filter((s) => new Date(s.sold_at).getTime() <= at)
    .sort((a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime());
  if (upto.length === 0) return null;

  const fresh = upto.filter((s) => at - new Date(s.sold_at).getTime() <= recencyDays * 86_400_000);
  // Recent trade wins. Where there is none, the last known price is carried
  // forward rather than blended with something three seasons old.
  const basis = fresh.length > 0 ? fresh : upto.slice(0, 1);
  return median(basis.slice(0, recentSales).map((s) => s.price_cents));
}

export interface IndexPoint {
  day: string;
  /** Rebased to 100 at the first point. No currency, ever. */
  index: number;
}

export interface CollectionIndex {
  points: IndexPoint[];
  pctChange: number;
  /** Shirts in the index - valuable at both ends and held throughout. */
  basket: number;
  /** Held throughout but with no sale by the start date, so not indexable. */
  excludedNoSale: number;
  /** Bought during the window, so not part of a like-for-like comparison. */
  excludedTooNew: number;
  from: string;
  to: string;
}

/**
 * Build the curve.
 *
 * Pure, and exported: every number the card prints comes out of here, so each
 * one should be checkable without a database.
 */
export function buildIndex(
  holdings: HoldingRow[],
  salesByProduct: Map<string, SaleRow[]>,
  config: CollectionIndexConfig,
  now: Date = new Date(),
): CollectionIndex | null {
  const start = new Date(now.getTime() - config.windowDays * 86_400_000);

  let excludedTooNew = 0;
  let excludedNoSale = 0;
  const basket: string[] = [];

  for (const holding of holdings) {
    if (new Date(holding.created_at).getTime() > start.getTime()) {
      // Bought inside the window. Including it would make buying look like
      // growth, which is the one thing this post must never do.
      excludedTooNew++;
      continue;
    }
    const sales = salesByProduct.get(holding.product_id) ?? [];
    if (valueAt(sales, start, config.recentSales, config.recencyDays) === null) {
      // No sale by the start date, so there is no honest opening value. This
      // is the guard against a first sale mid-window arriving as a gain.
      excludedNoSale++;
      continue;
    }
    basket.push(holding.product_id);
  }

  if (basket.length === 0) return null;

  const step = (now.getTime() - start.getTime()) / (config.points - 1);
  const points: IndexPoint[] = [];
  let base: number | null = null;

  for (let i = 0; i < config.points; i++) {
    const at = new Date(start.getTime() + step * i);
    let total = 0;
    for (const productId of basket) {
      // Every shirt is valuable at the start, so it stays valuable throughout -
      // the total is always the same basket, never a shrinking one.
      total += valueAt(salesByProduct.get(productId) ?? [], at, config.recentSales, config.recencyDays) ?? 0;
    }
    if (base === null) base = total;
    points.push({
      day: at.toISOString().slice(0, 10),
      index: base > 0 ? Math.round((total / base) * 1000) / 10 : 100,
    });
  }

  const last = points[points.length - 1].index;
  return {
    points,
    pctChange: Math.round((last - 100) * 10) / 10,
    basket: basket.length,
    excludedNoSale,
    excludedTooNew,
    from: points[0].day,
    to: points[points.length - 1].day,
  };
}

export interface IndexVerdict {
  ok: boolean;
  reason?: string;
}

export function qualifies(index: CollectionIndex, config: CollectionIndexConfig): IndexVerdict {
  if (index.basket < config.minBasket) {
    return {
      ok: false,
      reason: `only ${index.basket} shirts have a recorded sale from before ${index.from} (need ${config.minBasket})`,
    };
  }
  if (index.pctChange <= 0) {
    // Declines are real and are not this post. Saying so plainly on the run
    // log matters: a recipe that only ever reports gains should be visibly
    // choosing not to report the rest, not quietly hiding it.
    return { ok: false, reason: `this collection is ${index.pctChange}% over the window, not up` };
  }
  if (index.pctChange < config.minAbsPctChange) {
    return {
      ok: false,
      reason: `up ${index.pctChange}%, below the ${config.minAbsPctChange}% worth posting`,
    };
  }
  return { ok: true };
}

/** The count is in the ref, so a collection that has grown again can return. */
export function subjectRefFor(userId: string, pct: number): string {
  return `${collectorRef(userId, "spotlight", ":index")}@${pct.toFixed(1)}`;
}

export async function runCollectionIndex(
  config: CollectionIndexConfig = DEFAULT_COLLECTION_INDEX_CONFIG,
): Promise<RecipeResult> {
  const queue = (config.upNext ?? []).map((s) => s.trim()).filter(Boolean);
  const queued = queue[0] ?? null;

  const { options: listed, access } = await loadCollectors(
    config.cooldownDays,
    config.excludeUserIds ?? [],
  );
  if (!access.ok) return { ok: false, reason: access.reason, diagnostics: { blind: access.blind } };

  const options = postable(listed);
  const candidates = queued
    ? options.filter((c) => c.userId === queued)
    : options.filter((c) => c.available);

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: queued
        ? `Queued collector ${queued} is not eligible: opted out, or inside the ${config.cooldownDays}-day cooldown`
        : "No collector is off cooldown and consenting right now",
      diagnostics: { queued, queue, eligible: options.length },
    };
  }

  const shortlist = candidates.slice(0, 5);

  // Paged, not `.limit(20_000)`. PostgREST caps a response at 1,000 rows and
  // raises no error when it does, so the unpaged version quietly returned a
  // prefix - and an index built from part of a collection is a chart of a
  // collection that does not exist. See lib/kickio/page.ts.
  const holdingRows = await pageIn<HoldingRow, string>(
    "Loading collection holdings",
    shortlist.map((c) => c.userId),
    (batch, from, to) =>
      kickio()
        .from("collections")
        .select("user_id,product_id,created_at")
        .in("user_id", batch)
        .eq("hidden", false)
        .order("id", { ascending: true })
        .range(from, to),
  );
  const holdings = holdingRows.filter((h) => h.product_id);

  const productIds = [...new Set(holdings.map((h) => h.product_id))];
  const salesByProduct = new Map<string, SaleRow[]>();
  if (productIds.length > 0) {
    // Chunked and paged for the same reasons as the holdings read above: a
    // long `.in()` list becomes a query string the gateway rejects outright,
    // and a single response stops at 1,000 rows without saying so.
    //
    // The scoped role's policy already restricts this to approved,
    // non-excluded, non-dismissed rows, so there is no second filter here -
    // and nothing for a later edit to forget.
    const saleRows = await pageIn<SaleRow, string>(
      "Loading matching sales",
      productIds,
      (batch, from, to) =>
        kickio()
          .from("sales_history")
          .select("product_id,price_cents,sold_at")
          .in("product_id", batch)
          .order("id", { ascending: true })
          .range(from, to),
    );

    // Zero sales across a non-empty shortlist is an unreadable table, not a
    // set of collections that happen to have never traded. Without this the
    // run reports "no shirt has a sale from before the window" for every
    // collector - a statement about their shirts that was never checked.
    const access = salesAccess(productIds.length, saleRows.length, "shirts in the shortlisted collections");
    if (access.blind) {
      return {
        ok: false,
        reason: access.reason,
        diagnostics: { shortlist: shortlist.length, products: productIds.length, sale_rows: 0 },
      };
    }

    for (const row of saleRows) {
      if (!row.product_id || !Number.isFinite(row.price_cents)) continue;
      const list = salesByProduct.get(row.product_id) ?? [];
      list.push(row);
      salesByProduct.set(row.product_id, list);
    }
  }

  const rejected: Array<{ key: string; reason: string }> = [];
  let winner: { collector: CollectorOption; index: CollectionIndex } | null = null;

  for (const collector of shortlist) {
    const mine = holdings.filter((h) => h.user_id === collector.userId);
    const index = buildIndex(mine, salesByProduct, config);
    if (!index) {
      rejected.push({ key: collector.name, reason: "no shirt has a sale from before the window" });
      continue;
    }
    const verdict = qualifies(index, config);
    if (!verdict.ok) {
      rejected.push({ key: collector.name, reason: verdict.reason! });
      continue;
    }
    if (!winner || index.pctChange > winner.index.pctChange) winner = { collector, index };
  }

  if (!winner) {
    return {
      ok: false,
      reason: "No consenting collector has a like-for-like gain worth posting",
      diagnostics: { queued, queue, considered: shortlist.length, rejected },
    };
  }

  const { collector, index } = winner;
  const claims: Claim[] = [
    {
      statement: `${collector.name}'s collection is up ${index.pctChange}% since ${index.from}`,
      value: index.pctChange,
      source: "recorded sales of the same shirts, revalued at each point and rebased to 100",
      basis:
        `The same ${index.basket} shirts at both ends, all held since before ${index.from} ` +
        "and all valued the same way on both dates. Kickio's stored collection total is " +
        "not used: it mixes recorded sales with an estimate for shirts that have none, " +
        "and a change of basis there reads as a change of value.",
    },
    {
      statement: `Indexed on ${index.basket} shirts`,
      value: index.basket,
      source: "shirts held since before the window with at least one recorded sale by then",
      basis:
        `${index.excludedNoSale} more were held throughout but have no sale to value them ` +
        `against, and ${index.excludedTooNew} were bought inside the window, so none of ` +
        "them are in the figure",
    },
    {
      statement: "No shirt was bought or sold inside the index",
      value: true,
      source: "collections.created_at against the window start",
      basis: "Growth here is revaluation of the same shirts, never a bigger collection",
    },
  ];

  return {
    ok: true,
    candidate: {
      subjectRef: subjectRefFor(collector.userId, index.pctChange),
      headline: `${collector.name}'s collection: up ${index.pctChange}% in six months`,
      sourceData: {
        subject: `${collector.name}'s collection`,
        collector: collector.name,
        collector_title: collector.title,
        pct_change: index.pctChange,
        basket: index.basket,
        excluded_no_sale: index.excludedNoSale,
        excluded_too_new: index.excludedTooNew,
        from: index.from,
        to: index.to,
        window_days: config.windowDays,
        series: index.points,
        collector_handle: collector.name,
        collector_flags: "collection_public and featured_consent both true",
        scope_note:
          "An index, not a valuation. The card shows a percentage and never an amount. " +
          "Same shirts at both ends; nothing bought or sold inside the window.",
      },
      claims,
      images: [],
      ...(queued ? { consumeFromQueue: queued } : {}),
    },
  };
}

export const COLLECTION_INDEX_BRIEF = `**Collection Index** - one collector's shirts, revalued over six months.

The story is that shirts they already owned became worth more without them
doing anything. Lead with the percentage, say over what period, and say plainly
that nothing was bought or sold inside it - that is the whole point, and a
reader who suspects otherwise has no reason to believe the number.

Five hard rules:
- NEVER state or imply what the collection is worth, what any shirt cost, or
  what they paid. The post has a percentage and no amounts. If you write a
  pound sign you have made a mistake.
- This is ONE collection over ONE window. Never write that collections rise,
  that shirts are a good investment, or anything about what might happen next.
  No forecasts, no "returns", no "portfolio", no advice.
- Say what the index is built on: \`basket\` shirts with recorded sales, and the
  ones left out. The method is the reason to trust it, so it goes in the post
  rather than being hidden.
- Use the name in the facts exactly as given. Never guess a real name, a
  location, an age, a gender or a pronoun - write "they".
- Kickio tracks this because it records what shirts actually sell for. Say that
  plainly once; do not sell it twice.`;
