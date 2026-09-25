/**
 * Price History - one shirt, every sale we have a record of, plotted.
 *
 * Admin-chosen rather than scheduled. The other recipes pick a subject by
 * scoring; this one exists to answer "what has this shirt actually been going
 * for", and which shirt is worth asking that about is an editorial judgement.
 * So the engine's job is to say which shirts CAN carry the post, and a person
 * picks from that list.
 *
 * WHAT MAKES A SHIRT ELIGIBLE, AND WHY IT IS COUNTED THIS WAY
 *
 * Six recorded sales, and - once a shirt has been posted before - six the last
 * post did not have. The reason for the second half is that this post is a
 * picture of a line. Re-posting the same shirt with one new point on the end is
 * the same post again: the shape has not changed, nobody learns anything, and
 * the account looks like it is padding.
 *
 * "Six it did not have" is counted against the SALE IDS the last post carried,
 * not against a date. Kickio's sales data is scraped, and a scrape run started
 * today routinely lands sales that happened months ago. A date watermark would
 * throw those away as "not fresh" when they are exactly the thing that changes
 * the chart - and it would also silently lose any sale recorded a minute either
 * side of the line. Ids are exact, and they answer the question the rule is
 * really asking: is there six sales' worth of new information?
 *
 * Only posts that went out, or are on their way out, set that mark. A draft
 * that was rejected or that aged out unreviewed never reached anybody, so the
 * shirt goes straight back on the list - the same rule the rest of the engine
 * now follows.
 */
import { kickio } from "../kickio/client.ts";
import { engine } from "../engine/client.ts";
import type { Claim, RecipeResult } from "../engine/types.ts";
import { formatPrice } from "../kickio/pricing.ts";
import { cleanValue } from "../kickio/values.ts";
import { pageAll, pageIn } from "../kickio/page.ts";
import { imageUrls, kickioUrl } from "./grail-of-the-day.ts";

export const PRICE_HISTORY_KEY = "price_history";

/** Fewest recorded sales a chart is worth drawing from. */
export const MIN_SALES = 6;

/**
 * Most points drawn - and the same six the card is designed around.
 *
 * Every point wears its own price, so the labels are the constraint, not the
 * line. Eight was tried and the prices ran into each other on any leg where
 * two adjacent points were both labelled above: at eight the gap between
 * points is narrower than a label reading "£276.99". A shirt with thirty
 * recorded sales shows its most recent six, and the card says so.
 */
export const MAX_POINTS = 6;

export interface SaleRow {
  id: string;
  product_id: string | null;
  sold_at: string;
  price_cents: number;
  currency: string | null;
  size: string | null;
  condition: string | null;
  source: string;
}

export interface ProductRow {
  id: string;
  slug: string | null;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  player_name: string | null;
  manufacturer: string | null;
  primary_image_url: string | null;
}

/** One row of the picker. */
export interface QualifyingShirt {
  productId: string;
  slug: string | null;
  /** "Henry 14 · 2005/06 Arsenal Away" - what the card leads with. */
  title: string;
  subtitle: string;
  imageUrl: string | null;
  totalSales: number;
  /** Sales the last post about this shirt did not carry. */
  freshSales: number;
  lowest: string;
  highest: string;
  latest: string;
  latestSoldAt: string;
  postedBefore: boolean;
}

/**
 * How the shirt is named on the card and in the list.
 *
 * Placeholders are dropped rather than printed: "Unknown Home shirt" is worse
 * than "Home shirt", and a card is a claim about a real object.
 */
export function shirtTitle(product: Pick<ProductRow, "team" | "season" | "shirt_type" | "player_name">): {
  lead: string | null;
  main: string;
} {
  const player = cleanValue(product.player_name);
  const season = cleanValue(product.season);
  const team = cleanValue(product.team);
  const type = cleanValue(product.shirt_type);
  return {
    lead: player,
    main: [season, team, type].filter(Boolean).join(" ") || "Football shirt",
  };
}

/** "2005-06" is how Kickio stores it; "2005/06" is how a shirt is spoken about. */
export function seasonLabel(season: string | null | undefined): string | null {
  const value = cleanValue(season);
  if (!value) return null;
  return value.replace(/^(\d{4})-(\d{2,4})$/, (_, a, b) => `${a}/${String(b).slice(-2)}`);
}

/**
 * Which sales a chart may draw: newest last, capped, and only ones with a price.
 *
 * Exported because the cap and the ordering are the two things most likely to
 * be got wrong later, and neither needs a database to test.
 */
export function chartSales<T extends { sold_at: string; price_cents: number }>(
  sales: T[],
  max: number = MAX_POINTS,
): T[] {
  return [...sales]
    .filter((s) => Number.isFinite(s.price_cents) && s.price_cents > 0)
    .sort((a, b) => Date.parse(a.sold_at) - Date.parse(b.sold_at))
    .slice(-max);
}

/**
 * Sales this product has that the last post did not carry.
 *
 * `seen` empty means it has never been posted, in which case every sale is new
 * and the plain six-sale threshold applies.
 */
export function freshCount(saleIds: readonly string[], seen: ReadonlySet<string>): number {
  return saleIds.filter((id) => !seen.has(id)).length;
}

export function isEligible(total: number, fresh: number, postedBefore: boolean): boolean {
  return postedBefore ? fresh >= MIN_SALES : total >= MIN_SALES;
}

const SALE_COLUMNS = "id,product_id,sold_at,price_cents,currency,size,condition,source";
const PRODUCT_COLUMNS = "id,slug,team,season,shirt_type,player_name,manufacturer,primary_image_url";

/**
 * Every approved, undismissed sale attached to a product - as two columns.
 *
 * Deciding which shirts qualify means grouping seven thousand rows, and
 * PostgREST has no GROUP BY, so the grouping happens here. It reads only the
 * id and the product to do it: the prices and dates are needed for about sixty
 * shirts, not for all of them, and they are fetched for those afterwards.
 */
async function saleKeys(): Promise<Array<{ id: string; product_id: string }>> {
  return pageAll<{ id: string; product_id: string }>("Loading recorded sales", (from, to) =>
    kickio()
      .from("sales_history")
      .select("id,product_id")
      .not("product_id", "is", null)
      .is("excluded_at", null)
      .is("dismissed_at", null)
      .eq("review_state", "approved")
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/**
 * What each product's last live Price History post covered.
 *
 * Reads the engine's own drafts, never Kickio. `draft` and `approved` count
 * because those posts are on their way out; `published` because it has gone.
 * `rejected` and `expired` do not, so a shirt nobody actually posted returns to
 * the list rather than being retired by a decision that was never made.
 */
export async function postedSaleIds(): Promise<Map<string, Set<string>>> {
  const { data, error } = await engine()
    .from("post_drafts")
    .select("subject_ref,source_data,created_at")
    .eq("recipe_key", PRICE_HISTORY_KEY)
    .in("status", ["draft", "approved", "published"])
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Loading Price History history failed: ${error.message}`);

  // Ascending, so a later post's wider set simply replaces an earlier one's.
  const seen = new Map<string, Set<string>>();
  for (const row of (data ?? []) as Array<{ subject_ref: string; source_data: Record<string, unknown> }>) {
    const ids = row.source_data?.seen_sale_ids;
    if (!Array.isArray(ids)) continue;
    seen.set(row.subject_ref, new Set(ids.filter((id): id is string => typeof id === "string")));
  }
  return seen;
}

/**
 * The shirts a Price History post could be made about right now, best first.
 *
 * "Best" is the count of sales the last post did not have: the shirt whose
 * picture has changed most is the one worth revisiting, and for a shirt never
 * posted that is simply its number of recorded sales.
 */
export async function qualifyingShirts(limit = 60): Promise<QualifyingShirt[]> {
  const [keys, seen] = await Promise.all([saleKeys(), postedSaleIds()]);

  const idsByProduct = new Map<string, string[]>();
  for (const { id, product_id } of keys) {
    const held = idsByProduct.get(product_id);
    if (held) held.push(id);
    else idsByProduct.set(product_id, [id]);
  }

  const shortlist: Array<{ productId: string; total: number; fresh: number; postedBefore: boolean }> = [];
  for (const [productId, ids] of idsByProduct) {
    const already = seen.get(productId);
    const postedBefore = already !== undefined;
    const fresh = freshCount(ids, already ?? new Set());
    if (isEligible(ids.length, fresh, postedBefore)) {
      shortlist.push({ productId, total: ids.length, fresh, postedBefore });
    }
  }

  // Most new information first: the shirt whose picture has changed most since
  // anyone last looked is the one worth revisiting. For a shirt never posted
  // that is simply how many sales are on record.
  shortlist.sort((a, b) => b.fresh - a.fresh || b.total - a.total);
  const top = shortlist.slice(0, limit);
  if (top.length === 0) return [];

  const ids = top.map((entry) => entry.productId);
  const [products, sales] = await Promise.all([
    pageIn<ProductRow, string>("Loading shirts", ids, (batch, from, to) =>
      kickio()
        .from("products")
        .select(PRODUCT_COLUMNS)
        .in("id", batch)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    pageIn<SaleRow, string>("Loading those shirts' sales", ids, (batch, from, to) =>
      kickio()
        .from("sales_history")
        .select(SALE_COLUMNS)
        .in("product_id", batch)
        .is("excluded_at", null)
        .is("dismissed_at", null)
        .eq("review_state", "approved")
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const productFor = new Map(products.map((p) => [p.id, p]));
  const salesFor = new Map<string, SaleRow[]>();
  for (const sale of sales) {
    if (!sale.product_id) continue;
    const held = salesFor.get(sale.product_id);
    if (held) held.push(sale);
    else salesFor.set(sale.product_id, [sale]);
  }

  return top.flatMap(({ productId, total, fresh, postedBefore }) => {
    const product = productFor.get(productId);
    const rows = salesFor.get(productId) ?? [];
    // A sale whose product has gone from the catalogue has nothing to draw.
    if (!product) return [];

    const plotted = chartSales(rows);
    if (plotted.length < MIN_SALES) return [];

    const prices = plotted.map((s) => s.price_cents);
    const { lead, main } = shirtTitle(product);
    const season = seasonLabel(product.season);
    const named = [season, cleanValue(product.team), cleanValue(product.shirt_type)]
      .filter(Boolean)
      .join(" ");

    return [
      {
        productId,
        slug: product.slug,
        title: lead ? `${lead} · ${named || main}` : named || main,
        subtitle: [cleanValue(product.manufacturer), cleanValue(product.shirt_type)]
          .filter(Boolean)
          .join(" · "),
        imageUrl: imageUrls([product.primary_image_url])[0] ?? null,
        totalSales: total,
        freshSales: fresh,
        lowest: formatPrice(Math.min(...prices), "GBP"),
        highest: formatPrice(Math.max(...prices), "GBP"),
        latest: formatPrice(plotted[plotted.length - 1].price_cents, "GBP"),
        latestSoldAt: plotted[plotted.length - 1].sold_at,
        postedBefore,
      },
    ];
  });
}

/**
 * Build the post for one chosen shirt.
 *
 * Re-checks eligibility rather than trusting the picker: the list a person is
 * looking at was true when the page loaded, and a sale can land in between.
 */
export async function runPriceHistory(productId: string): Promise<RecipeResult> {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) {
    return { ok: false, reason: "That is not a product id" };
  }

  const { data: productData, error: productError } = await kickio()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("id", productId)
    .maybeSingle();

  if (productError) return { ok: false, reason: `Kickio lookup failed: ${productError.message}` };
  if (!productData) return { ok: false, reason: "No shirt on Kickio with that id" };
  const product = productData as unknown as ProductRow;

  const { data: saleData, error: saleError } = await kickio()
    .from("sales_history")
    .select(SALE_COLUMNS)
    .eq("product_id", productId)
    .is("excluded_at", null)
    .is("dismissed_at", null)
    .eq("review_state", "approved")
    .order("sold_at", { ascending: true })
    .limit(500);

  if (saleError) return { ok: false, reason: `Kickio sales lookup failed: ${saleError.message}` };
  const sales = (saleData ?? []) as unknown as SaleRow[];

  const seen = (await postedSaleIds()).get(productId);
  const postedBefore = seen !== undefined;
  const fresh = freshCount(sales.map((s) => s.id), seen ?? new Set());

  if (!isEligible(sales.length, fresh, postedBefore)) {
    return {
      ok: false,
      reason: postedBefore
        ? `Only ${fresh} sale${fresh === 1 ? "" : "s"} since this shirt was last posted ` +
          `(need ${MIN_SALES}) - the chart would be the same picture again`
        : `Only ${sales.length} recorded sale${sales.length === 1 ? "" : "s"} (need ${MIN_SALES})`,
      diagnostics: { totalSales: sales.length, freshSales: fresh, postedBefore },
    };
  }

  const plotted = chartSales(sales);
  if (plotted.length < MIN_SALES) {
    return {
      ok: false,
      reason: `Only ${plotted.length} of ${sales.length} recorded sales carry a price`,
      diagnostics: { totalSales: sales.length, withPrice: plotted.length },
    };
  }

  const photo = imageUrls([product.primary_image_url])[0];
  if (!photo) {
    return { ok: false, reason: "That shirt has no photograph, and this card is built around one" };
  }

  const prices = plotted.map((s) => s.price_cents);
  const gbp = (cents: number) => formatPrice(cents, "GBP");
  const { lead, main } = shirtTitle(product);
  const season = seasonLabel(product.season);
  const named = [season, cleanValue(product.team), cleanValue(product.shirt_type)]
    .filter(Boolean)
    .join(" ");
  const headline = lead ? `${lead} · ${named || main}` : named || main;

  // One claim per point, plus the two summary figures the card prints. Nothing
  // is claimed about direction or about what the shirt is "worth": these are
  // the prices six different sellers got, for shirts of different sizes and
  // conditions, and the spread is the honest story.
  const claims: Claim[] = [
    ...plotted.map((s) => ({
      statement: `${headline} sold for ${gbp(s.price_cents)} on ${new Date(s.sold_at)
        .toISOString()
        .slice(0, 10)}`,
      value: s.price_cents / 100,
      source: `sales_history.price_cents (id ${s.id})`,
      basis: "Market-wide data aggregated by Kickio, not Kickio's own sales",
    })),
    {
      statement: `${plotted.length} recorded sales ranging ${gbp(Math.min(...prices))} to ${gbp(
        Math.max(...prices),
      )}`,
      value: plotted.length,
      source: "sales_history, approved rows only",
      basis: "Prices vary by size and condition; this is a range, not a valuation",
    },
  ];

  return {
    ok: true,
    candidate: {
      subjectRef: productId,
      headline,
      sourceData: {
        product_id: productId,
        title_lead: lead,
        title_main: named || main,
        subtitle: [cleanValue(product.manufacturer), cleanValue(product.shirt_type)]
          .filter(Boolean)
          .join(" · "),
        team: cleanValue(product.team),
        season,
        shirt_type: cleanValue(product.shirt_type),
        player_name: lead,
        manufacturer: cleanValue(product.manufacturer),
        kickio_url: product.slug ? kickioUrl(product.slug) : null,
        data_scope: "market-wide (third-party sales data aggregated by Kickio)",
        recorded_sales: plotted.length,
        total_recorded_sales: sales.length,
        price_low: gbp(Math.min(...prices)),
        price_high: gbp(Math.max(...prices)),
        price_latest: gbp(plotted[plotted.length - 1].price_cents),
        // What the card draws. Index-aligned by nature: one entry, one point.
        points: plotted.map((s) => ({
          sold_at: s.sold_at,
          price: gbp(s.price_cents),
          price_cents: s.price_cents,
          size: cleanValue(s.size),
          condition: cleanValue(s.condition),
          source: s.source,
        })),
        // The eligibility mark for next time: every sale this post could see,
        // not only the ones it drew. A sale left off the chart has still been
        // accounted for, so it cannot count as new information later.
        seen_sale_ids: sales.map((s) => s.id),
        fresh_sales_at_post: postedBefore ? fresh : sales.length,
      },
      claims,
      images: [photo],
    },
  };
}

export const PRICE_HISTORY_BRIEF = `**Price History** - one shirt, and what it has actually been going for.

The card already carries the chart, every price and every date. Do not read the
numbers back out. Say what the shape means to a collector: steady, all over the
place, quietly climbing, one outlier that dragged the range.

Hard rules:
- The spread is because these are DIFFERENT SHIRTS - sizes, conditions, sellers.
  Never present the range as what "the shirt is worth", and never call the
  highest price its value.
- This is MARKET-WIDE data Kickio aggregates from across the hobby. It is not
  Kickio's own sales. Never write "sold on Kickio" or imply Kickio's volume.
- Never predict. No "expect this to keep rising", no "now is the time to buy".
  Observation only - what happened, not what happens next.
- Do not count anything the card does not already say.

No TikTok variant. Write X and Instagram only.`;
