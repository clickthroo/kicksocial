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
import {
  conditionRank,
  normaliseCondition,
  normaliseSize,
  shortCondition,
  type Condition,
} from "../kickio/condition.ts";
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


export interface SalePoint {
  price_cents: number;
  size: string | null;
  condition: string | null;
}

export interface SpreadReading {
  /**
   * What the gap between the cheapest and the dearest sale is about.
   *
   *   explained       the dearest was the better shirt. Ordinary, and the post
   *                   should say so rather than dressing it up as a swing.
   *   inverted        the dearest was the WORSE shirt. Genuinely odd, and the
   *                   most interesting thing on the card when it happens.
   *   same-condition  both ends were the same grade, so condition is not what
   *                   separates them - size, seller or timing is.
   *   unknown         one or both ends have no condition recorded. Say nothing.
   */
  verdict: "explained" | "inverted" | "same-condition" | "unknown";
  cheapest: SalePoint;
  dearest: SalePoint;
  /** The card prints this, so it is derived from the rows and nothing else. */
  summary: string;
  /** The biggest set of sales sharing one grade - a like-for-like comparison. */
  likeForLike: { condition: Condition; count: number; lowCents: number; highCents: number } | null;
}

const NO_READING = "Recorded sales vary by size and condition";

/**
 * What the spread is actually about.
 *
 * THE POINT OF THIS. A range of £139 to £277 looks like volatility until you
 * see that the cheap one was a Good and the dear one was Brand New, at which
 * point it is not a story at all - it is what a condition ladder looks like.
 * Writing "prices all over the place" over that would be wrong, and a
 * collector would know it immediately. So the verdict is worked out here, in
 * code, and the copy is told what it is rather than being left to infer it
 * from a list of grades.
 */
export function readSpread(points: readonly SalePoint[]): SpreadReading | null {
  if (points.length < 2) return null;

  const byPrice = [...points].sort((a, b) => a.price_cents - b.price_cents);
  const cheapest = byPrice[0];
  const dearest = byPrice[byPrice.length - 1];

  const groups = new Map<Condition, number[]>();
  for (const point of points) {
    const condition = normaliseCondition(point.condition);
    if (!condition) continue;
    const held = groups.get(condition);
    if (held) held.push(point.price_cents);
    else groups.set(condition, [point.price_cents]);
  }

  let likeForLike: SpreadReading["likeForLike"] = null;
  for (const [condition, prices] of groups) {
    if (prices.length < 2) continue;
    if (likeForLike && likeForLike.count >= prices.length) continue;
    likeForLike = {
      condition,
      count: prices.length,
      lowCents: Math.min(...prices),
      highCents: Math.max(...prices),
    };
  }

  const low = conditionRank(cheapest.condition);
  const high = conditionRank(dearest.condition);
  const lowName = shortCondition(cheapest.condition);
  const highName = shortCondition(dearest.condition);

  if (low === null || high === null || cheapest.price_cents === dearest.price_cents) {
    return { verdict: "unknown", cheapest, dearest, summary: NO_READING, likeForLike };
  }

  if (high > low) {
    return {
      verdict: "explained",
      cheapest,
      dearest,
      summary: `${lowName} at the bottom, ${highName} at the top — the spread tracks condition`,
      likeForLike,
    };
  }

  if (high < low) {
    return {
      verdict: "inverted",
      cheapest,
      dearest,
      summary: `The dearest was the lower grade — ${highName} over ${lowName}`,
      likeForLike,
    };
  }

  return {
    verdict: "same-condition",
    cheapest,
    dearest,
    summary: `Both ends were ${highName} — condition is not what separates them`,
    likeForLike,
  };
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
  const name = lead ? `${lead} · ${named || main}` : named || main;
  const reading = readSpread(plotted);

  // The queue label, and the first thing the copy model reads. It used to be
  // the shirt's name and nothing else, which told a reviewer scrolling the
  // queue nothing about whether the post was worth looking at - and told the
  // model nothing it could not already see. It now carries the range and what
  // the range is about.
  const headline = [
    `${name} — ${gbp(Math.min(...prices))}–${gbp(Math.max(...prices))} across ${plotted.length} sales`,
    reading?.verdict === "explained"
      ? `${shortCondition(reading.cheapest.condition)} to ${shortCondition(reading.dearest.condition)}`
      : reading?.verdict === "inverted"
        ? "dearest was the lower grade"
        : reading?.verdict === "same-condition"
          ? `all ${shortCondition(reading.dearest.condition)}`
          : null,
  ]
    .filter(Boolean)
    .join(", ");

  // One claim per point, plus the two summary figures the card prints. Nothing
  // is claimed about direction or about what the shirt is "worth": these are
  // the prices six different sellers got, for shirts of different sizes and
  // conditions, and the spread is the honest story.
  const claims: Claim[] = [
    ...plotted.map((s) => ({
      statement:
        `${name} sold for ${gbp(s.price_cents)} on ${new Date(s.sold_at).toISOString().slice(0, 10)}` +
        // Size and condition belong IN the claim, not beside it: the price is
        // only checkable against the shirt it was paid for.
        ([normaliseSize(s.size), shortCondition(s.condition)].filter(Boolean).join(", ")
          ? ` (${[normaliseSize(s.size), shortCondition(s.condition)].filter(Boolean).join(", ")})`
          : ""),
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
    // The reading the copy is told to lean on, stated as a claim so a reviewer
    // can check it against the rows above rather than taking the post's word.
    ...(reading && reading.verdict !== "unknown"
      ? [
          {
            statement: reading.summary,
            value: `${shortCondition(reading.cheapest.condition)} at ${gbp(
              reading.cheapest.price_cents,
            )}, ${shortCondition(reading.dearest.condition)} at ${gbp(reading.dearest.price_cents)}`,
            source: "sales_history.condition on the cheapest and dearest of the sales shown",
            basis: "Grades ranked Needs Attention < Fair < Good < Very Good < Excellent < Mint < Brand New",
          },
        ]
      : []),
    ...(reading?.likeForLike
      ? [
          {
            statement:
              `${reading.likeForLike.count} of these were ${reading.likeForLike.condition}, ` +
              `and those alone ran ${gbp(reading.likeForLike.lowCents)} to ${gbp(
                reading.likeForLike.highCents,
              )}`,
            value: reading.likeForLike.count,
            source: "sales_history.condition, grouped",
            basis: "Like-for-like: same grade, so size, seller and timing are what is left",
          },
        ]
      : []),
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
        // Normalised here rather than in the template: the card and the copy
        // must be looking at the same words, and Kickio's size column carries
        // scraped junk ("Default Title", "Manchester United") that must never
        // reach either of them.
        points: plotted.map((s) => ({
          sold_at: s.sold_at,
          price: gbp(s.price_cents),
          price_cents: s.price_cents,
          size: normaliseSize(s.size),
          condition: shortCondition(s.condition),
          source: s.source,
        })),
        // What the spread is about. `summary` is printed on the card, so the
        // copy must not contradict it.
        condition_read: reading
          ? {
              verdict: reading.verdict,
              summary: reading.summary,
              cheapest: {
                price: gbp(reading.cheapest.price_cents),
                size: normaliseSize(reading.cheapest.size),
                condition: shortCondition(reading.cheapest.condition),
              },
              dearest: {
                price: gbp(reading.dearest.price_cents),
                size: normaliseSize(reading.dearest.size),
                condition: shortCondition(reading.dearest.condition),
              },
              like_for_like: reading.likeForLike
                ? {
                    condition: reading.likeForLike.condition,
                    count: reading.likeForLike.count,
                    low: gbp(reading.likeForLike.lowCents),
                    high: gbp(reading.likeForLike.highCents),
                  }
                : null,
            }
          : null,
        caveat: reading?.summary ?? "Recorded sales vary by size and condition",
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

The card already carries the chart, every price, every date, and the size and
condition of each sale. Do not read those back out. Your job is the bit the
card cannot say: what the shape means.

START FROM \`condition_read\`. It is worked out from the rows, and it decides
what kind of post this is:

- \`explained\` - the dearest sale was the better shirt. This is ORDINARY, and
  saying so is the valuable thing: a £139-to-£277 range looks like a wild
  market until you see the cheap one was a Good and the dear one Brand New.
  Write it as a condition ladder, never as volatility or as a shirt "swinging".
- \`same-condition\` - both ends were the same grade, so condition is NOT what
  separates them. That is the interesting one. Size, seller, timing and luck
  are what is left; say that, and do not invent which of them it was.
- \`inverted\` - the dearest sale was the LOWER grade. Genuinely odd and worth
  leading with, as an observation and not an accusation - a rare size, a
  better photograph, or two buyers in the room all do this.
- \`unknown\` - the grades are not recorded at both ends. Say nothing at all
  about condition, and do not guess it from the prices.

\`like_for_like\`, where it exists, is the strongest line available: several
sales of the SAME grade, and the range those alone ran. Use it.

Size matters too and is on every point. A 3XL or an XS sells to a smaller room
than an M, which is a fair thing to observe where the prices show it - but only
where they show it.

Hard rules:
- Never present the range as what the shirt "is worth", and never call the
  highest price its value. These are different shirts in different states.
- This is MARKET-WIDE data Kickio aggregates from across the hobby. It is not
  Kickio's own sales. Never write "sold on Kickio" or imply Kickio's volume.
- Never predict. No "expect this to keep rising", no "now is the time to buy".
  Observation only - what happened, not what happens next.
- Do not contradict \`caveat\`: it is printed on the card.
- Do not count anything the card does not already say.

No TikTok variant. Write X and Instagram only.`;
