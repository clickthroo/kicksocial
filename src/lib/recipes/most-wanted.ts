/**
 * Most Wanted - the shirts the market clears fastest, and how few are left.
 *
 * WHAT "MOST WANTED" IS NOT, AND WHY
 *
 * The obvious source is `wantlists`, which is literally a table of shirts
 * people have said they want. It cannot be used. Measured 2026-09-30: 68 rows,
 * 68 distinct products, and 2 distinct users - so every product on it is
 * wanted by exactly one person and the "most wanted" item is a 68-way tie at
 * one. `saved_searches` is empty, `follows` holds 9 rows from the same 2
 * users, and `listing_price_changes` is empty. A "#1 Most Wanted" backed by
 * one person, who on those numbers is almost certainly staff, is the kind of
 * claim a collector checks once and never trusts again. If wantlists ever
 * carry real volume this is the one function to change: `rankSubjects` below
 * takes counts, and where the counts come from is its only assumption.
 *
 * The second obvious source is raw sales volume, and it is wrong in a subtler
 * way. Ranked by sales alone the list is England 2010-11 (206 sales), England
 * 2002-03, England 2004-05 - which is not a ranking of what collectors chase,
 * it is a ranking of what was mass-produced. Volume measures supply as much as
 * demand. Same trap as the `pooled` figures Price Trends refuses.
 *
 * SO: SALES AGAINST WHAT IS LEFT ON THE SHELF
 *
 * A shirt that sold 56 times in 90 days with 3 for sale today is being cleared
 * far faster than one that sold 52 times with 17 for sale. That ratio is what a
 * collector means by "wanted": people keep buying it and you still cannot get
 * one.
 *
 * "For sale" is load-bearing and is not the same as "on the catalogue" - see
 * the products read below, which is where the first version of this recipe got
 * it wrong.
 *
 * The number is stated on the card as what it is - sales per shirt currently
 * listed - and never as a count of people. Nobody is claimed to want anything.
 *
 * THE USUAL TWO HARD RULES
 *
 * 1. `sales_history` is overwhelmingly third-party market data, not Kickio's
 *    own sales. Every post says "the market", never "sold on Kickio".
 * 2. Match shirts only: Home, Away and Third. An allowlist, because the same
 *    column carries Training, Goalkeeper, Polo, Pre-Match and Fourth, and
 *    counting training tops as demand for a club's shirt inflates exactly the
 *    clubs that sell most training tops. It is not cosmetic: filtering it
 *    takes England 2010-11 from 206 sales to 99.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { recentlyFeatured } from "./cooldown.ts";
import { salesAccess } from "./sales-access.ts";
import { formatPrice } from "../kickio/pricing.ts";
import { pageAll, pageIn } from "../kickio/page.ts";
import { imageUrls } from "./grail-of-the-day.ts";
import { isMatchShirt } from "./who-am-i.ts";

interface SaleRow {
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  item_kind: string | null;
  price_cents: number;
  currency: string | null;
}

interface ProductRow {
  id: string;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  primary_image_url: string | null;
  images: unknown;
}

export interface MostWantedConfig {
  /** How far back the sales are counted. */
  windowDays: number;
  /** How many shirts the card ranks. */
  featureCount: number;
  /** Fewest sales in the window before a subject may be ranked at all. */
  minSales: number;
  /**
   * Fewest currently listed before a subject may be ranked.
   *
   * Two, not one. The ratio's denominator is this number, so a single listing
   * turns any sales count into a headline figure and the leaderboard becomes a
   * list of whatever happens to have one copy left. It also guarantees the
   * post has somewhere to send a reader, which a Most Wanted with nothing to
   * buy does not.
   */
  minListed: number;
  /** Fewest ranked subjects worth a card. Below this the grid reads as broken. */
  minRanked: number;
  /** Six months, so the feed does not come back to the same shirt. */
  cooldownDays: number;
  /**
   * How long before the same CLUB may headline again.
   *
   * A separate rule from the six months, and it exists because of a measured
   * fact rather than a preference: of the 54 subjects that qualify, 24 are
   * Manchester United and the whole pool spans only 14 clubs. The per-shirt
   * cooldown does nothing about that - every Manchester United season is a
   * different subject - so without this the post would be Manchester United
   * most weeks and stop reading as a market leaderboard.
   *
   * Six weeks. With 14 clubs in the pool, six weeks of history can block at
   * most six of them, which always leaves enough to choose from.
   */
  clubCooldownDays: number;
  /**
   * Most tiles one club may take on a single card.
   *
   * Same problem one level down: ranked purely on pressure the top five are
   * five Manchester United shirts, which reads as a fan post rather than as
   * what the market is doing.
   */
  maxPerClub: number;
}

export const DEFAULT_MOST_WANTED_CONFIG: MostWantedConfig = {
  windowDays: 90,
  featureCount: 5,
  minSales: 8,
  minListed: 2,
  minRanked: 3,
  cooldownDays: 180,
  clubCooldownDays: 42,
  maxPerClub: 2,
};

export interface Subject {
  team: string;
  season: string;
  /** Home, Away or Third. Part of the subject, not a detail of it. */
  kit: string;
  sales: number;
  listed: number;
  /** Sales in the window for each one currently listed. */
  pressure: number;
  medianCents: number;
}

/**
 * `team|season|kit`, and the cooldown key. Lowercased so casing drift cannot
 * repeat a subject.
 *
 * THE KIT IS PART OF THE SUBJECT, and it was not in the first version. Grouping
 * a club and season together counts three different shirts as one: Real Madrid
 * 2014-15 was 34 away, 12 home and 3 third, so a card headlining "49 sales, 2
 * for sale" was adding up demand for one shirt and supply of another. The
 * narrower subject means the two numbers on the card describe the same object.
 */
export function subjectRef(team: string, season: string, kit: string): string {
  return `${team.trim().toLowerCase()}|${season.trim().toLowerCase()}|${kit.trim().toLowerCase()}`;
}

/** The club half of a subject key, for the club cooldown. */
export function clubOf(ref: string): string {
  return ref.split("|")[0] ?? "";
}

/** Home / Away / Third, as the card prints it, from whatever casing the row carries. */
export function kitLabel(shirtType: string | null | undefined): string {
  const kit = (shirtType ?? "").trim().toLowerCase();
  return kit.charAt(0).toUpperCase() + kit.slice(1);
}

/** The median of a list of prices, for the "what it costs" line. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/**
 * Rank team+season subjects by how hard the market is clearing them.
 *
 * Pure and exported, because this is the whole judgement of the recipe and it
 * is worth being sure of without a database in the way. Takes what sold and
 * what is listed; returns the order the card uses.
 *
 * Ties break on sales, so between two shirts clearing at the same rate the one
 * with more behind it leads. A tie broken arbitrarily would reshuffle the
 * leaderboard between runs for no reason a reader could see.
 */
export function rankSubjects(
  sales: SaleRow[],
  listedByKey: Map<string, number>,
  config: MostWantedConfig,
): Subject[] {
  const grouped = new Map<
    string,
    { team: string; season: string; kit: string; prices: number[] }
  >();

  for (const row of sales) {
    if (!row.team || !row.season) continue;
    if ((row.item_kind ?? "shirt") !== "shirt") continue;
    if (!isMatchShirt(row.shirt_type)) continue;
    if (!Number.isFinite(row.price_cents)) continue;

    const kit = kitLabel(row.shirt_type);
    const key = subjectRef(row.team, row.season, kit);
    const entry = grouped.get(key) ?? { team: row.team, season: row.season, kit, prices: [] };
    entry.prices.push(row.price_cents);
    grouped.set(key, entry);
  }

  const ranked: Subject[] = [];
  for (const [key, entry] of grouped) {
    if (entry.prices.length < config.minSales) continue;
    const listed = listedByKey.get(key) ?? 0;
    if (listed < config.minListed) continue;
    ranked.push({
      team: entry.team,
      season: entry.season,
      kit: entry.kit,
      sales: entry.prices.length,
      listed,
      pressure: entry.prices.length / listed,
      medianCents: median(entry.prices),
    });
  }

  return ranked.sort((a, b) => b.pressure - a.pressure || b.sales - a.sales);
}

/** "sold 24 times for every one listed" reads better than 24.5. */
export function pressureLabel(pressure: number): string {
  return pressure >= 10 ? String(Math.round(pressure)) : pressure.toFixed(1);
}

export async function runMostWanted(
  config: MostWantedConfig = DEFAULT_MOST_WANTED_CONFIG,
): Promise<RecipeResult> {
  const since = new Date(Date.now() - config.windowDays * 86_400_000).toISOString();

  // Every row, paged. The window holds about 13,000 approved match-shirt sales
  // and PostgREST caps a response at 1,000 - taking the first page would rank
  // the market on a twelfth of it and never say so.
  const sales = await pageAll<SaleRow>("Most Wanted sales read", (from, to) =>
    kickio()
      .from("sales_history")
      .select("team,season,shirt_type,item_kind,price_cents,currency")
      .gte("sold_at", since)
      .is("excluded_at", null)
      .is("dismissed_at", null)
      .eq("review_state", "approved")
      .eq("item_kind", "shirt")
      .not("team", "is", null)
      .not("season", "is", null)
      .range(from, to),
  );

  // Everything you can actually BUY, paged for the same reason.
  //
  // `has_active_listing`, not `status = 'active'`. Those are different things
  // and the difference is the whole denominator: `status` means the product
  // RECORD was approved, and 2,628 rows carry it, while only 1,315 have a
  // listing behind them. Counting the former had the card printing "2 on
  // Kickio now" for Real Madrid 2014-15, whose two approved records are a Bale
  // home shirt and a Modric third shirt with `listings_count: 0` - nothing
  // anyone could buy. A Most Wanted post is a shop window; sending a reader to
  // an empty one is the exact overclaim this recipe refuses everywhere else.
  // Same distinction, same reason, as `isApproved` in who-am-i.ts.
  const products = await pageAll<ProductRow>("Most Wanted listings read", (from, to) =>
    kickio()
      .from("products")
      .select("id,team,season,shirt_type,primary_image_url,images")
      .is("deleted_at", null)
      .eq("status", "active")
      .eq("has_active_listing", true)
      .not("team", "is", null)
      .not("season", "is", null)
      .not("shirt_type", "is", null)
      .range(from, to),
  );

  // Zero sales against a non-empty shelf is a permissions fault, not a quiet
  // market. Without this check the two are indistinguishable and the card
  // would report a market that nobody can see as a market with nothing in it.
  const access = salesAccess(products.length, sales.length, "live listings");
  if (access.blind) return { ok: false, reason: access.reason };

  const listedByKey = new Map<string, number>();
  const productsByKey = new Map<string, ProductRow[]>();
  for (const p of products) {
    if (!p.team || !p.season) continue;
    // The same allowlist as the sales side. A training top on the shelf is not
    // supply of the home shirt, and counting it would understate the scarcity
    // the post is about.
    if (!isMatchShirt(p.shirt_type)) continue;
    const key = subjectRef(p.team, p.season, kitLabel(p.shirt_type));
    listedByKey.set(key, (listedByKey.get(key) ?? 0) + 1);
    const list = productsByKey.get(key) ?? [];
    list.push(p);
    productsByKey.set(key, list);
  }

  const ranked = rankSubjects(sales, listedByKey, config);
  if (ranked.length === 0) {
    return {
      ok: false,
      reason:
        `No shirt cleared ${config.minSales} sales in ${config.windowDays} days with at ` +
        `least ${config.minListed} still listed`,
      diagnostics: { sales_read: sales.length, listings_read: products.length },
    };
  }

  // Six months on the shirt itself. Measured: 54 subjects qualify against the
  // 26 a weekly recipe needs to fill the window.
  const seenSubjects = await recentlyFeatured("most_wanted", config.cooldownDays);
  const unseen = ranked.filter((s) => !seenSubjects.has(subjectRef(s.team, s.season, s.kit)));
  if (unseen.length === 0) {
    return {
      ok: false,
      reason: `All ${ranked.length} qualifying shirts were covered within ${config.cooldownDays} days`,
    };
  }

  // Six weeks on the club, which the six months does nothing about: every
  // Manchester United season is a different subject, and 24 of the 54 that
  // qualify are Manchester United.
  //
  // RELAXED RATHER THAN ENFORCED TO A SKIP. If no club is free, the choice is
  // between a club seen five weeks ago and no post at all, and the first is
  // plainly better. The relaxation is recorded in the draft so the dashboard
  // shows that the rule bent rather than that it never existed.
  const seenClubs = new Set(
    [...(await recentlyFeatured("most_wanted", config.clubCooldownDays))].map(clubOf),
  );
  const freshClubs = unseen.filter((s) => !seenClubs.has(clubOf(subjectRef(s.team, s.season, s.kit))));
  const clubRuleRelaxed = freshClubs.length === 0;
  const eligible = clubRuleRelaxed ? unseen : freshClubs;

  // A photo per rank, in rank order, with no club taking more than its share.
  //
  // A subject with no renderable photo is dropped rather than drawn empty: a
  // missing picture must cost a place on the list, not the post. The per-club
  // cap is the same diversity rule one level down - ranked purely on pressure
  // the top five come out five Manchester United shirts.
  const featured: Subject[] = [];
  const images: string[] = [];
  const perClub = new Map<string, number>();
  for (const subject of eligible) {
    if (featured.length >= config.featureCount) break;
    const club = clubOf(subjectRef(subject.team, subject.season, subject.kit));
    if ((perClub.get(club) ?? 0) >= config.maxPerClub) continue;

    const key = subjectRef(subject.team, subject.season, subject.kit);
    const photo = (productsByKey.get(key) ?? [])
      .flatMap((p) => imageUrls([p.primary_image_url, ...(Array.isArray(p.images) ? p.images : [])]))
      .find(Boolean);
    if (!photo) continue;

    featured.push(subject);
    images.push(photo);
    perClub.set(club, (perClub.get(club) ?? 0) + 1);
  }

  if (featured.length < config.minRanked) {
    return {
      ok: false,
      reason:
        `Only ${featured.length} of the ${eligible.length} qualifying shirts have a ` +
        `renderable photo and fit the ${config.maxPerClub}-per-club cap (need ${config.minRanked})`,
    };
  }

  const top = featured[0];
  const currency = sales.find((s) => s.currency)?.currency ?? "GBP";

  const topName = `${top.team} ${top.season} ${top.kit}`;

  const claims: Claim[] = [
    {
      statement:
        `The ${topName} shirt sold ${top.sales} times in ${config.windowDays} days, ` +
        `with ${top.listed} for sale on Kickio now`,
      value: top.sales,
      source:
        "sales_history (approved, match shirts only) against products with an active listing",
      basis:
        `${pressureLabel(top.pressure)} tracked sales for each one for sale. Both numbers ` +
        "are the same shirt: club, season and kit. Market-wide sales data, not Kickio's " +
        "own sales.",
    },
    {
      statement: `Median ${formatPrice(top.medianCents, currency)}`,
      value: top.medianCents / 100,
      source: "median of the same tracked sales",
    },
  ];

  const candidate: RecipeCandidate = {
    subjectRef: subjectRef(top.team, top.season, top.kit),
    headline: `Most Wanted: ${topName}`,
    sourceData: {
      window_days: config.windowDays,
      subject: topName,
      // Index-aligned with `images`, the way the roundup card's featured list
      // is, so a tile never borrows the next shirt's picture.
      featured: featured.map((s, i) => ({
        rank: i + 1,
        team: s.team,
        season: s.season,
        kit: s.kit,
        sales: s.sales,
        listed: s.listed,
        pressure: pressureLabel(s.pressure),
        median_price: formatPrice(s.medianCents, currency),
      })),
      top_team: top.team,
      top_season: top.season,
      top_kit: top.kit,
      top_sales: top.sales,
      top_listed: top.listed,
      top_pressure: pressureLabel(top.pressure),
      top_median_price: formatPrice(top.medianCents, currency),
      // Spelled out because the number is the whole post and it is not a count
      // of people. A reviewer should be able to read what it means off the row.
      basis:
        `Tracked market sales in the last ${config.windowDays} days for each one of the ` +
        `same shirt for sale on Kickio. Club, season and kit all match on both sides.`,
      qualifying_subjects: ranked.length,
      sales_considered: sales.length,
      listings_considered: products.length,
      // Shown on the draft so a reviewer can see that the variety rule bent
      // this week rather than wondering why the same club is back.
      club_rule_relaxed: clubRuleRelaxed,
    },
    claims,
    images,
  };

  return { ok: true, candidate };
}

export const MOST_WANTED_BRIEF = `**Most Wanted** - the shirts the market is clearing fastest, and how few are left.

The ranking is sales against supply: how many tracked sales one specific shirt
had in the window, for each one of that same shirt for sale on Kickio today.
\`top_pressure\` is that figure. It is the post.

THE SUBJECT IS ONE SHIRT. Club, season AND kit - "Manchester United 1996-97
Home", not "Manchester United 1996-97". Both numbers describe that same shirt,
which is the only reason they can honestly be compared. Name the kit in the
copy; dropping it turns a precise claim into a vague one.

WHAT THE NUMBER IS, AND WHAT IT IS NOT

It is a rate, not a count of people. Write it as sales per shirt available
("sold 25 times for every one you can buy today", "24 sales, 2 left"). Never
write it as demand from named or counted collectors: nobody has said they want
anything, and "25 people want this" would be a claim the data does not make.

Do not call it a waiting list, a wantlist, or interest. Kickio has a wantlist
feature and this is not it.

TWO HARD RULES, THE SAME AS EVERY SALES POST

- This is MARKET-WIDE sales data Kickio aggregates from across the hobby. It is
  NOT Kickio's own sales. Never write "sold on Kickio", "we sold", or anything
  implying Kickio's transaction volume. "The market" and "tracked sales" are the
  right framings. The shirts you can BUY are on Kickio, and that part may be
  said plainly - that is the point of the post.
- Every figure comes from the claims unchanged. Do not round \`top_sales\` or
  \`top_listed\`, do not restate the rate as a different number, and do not add
  a total the card does not carry.

WHAT TO LEAD WITH

The top shirt and the gap between what it sells and what is left. "Manchester
United's 1996-97 home shirt has sold 36 times since July. Two are for sale on
Kickio right now." That sentence is the whole post; the rest is why the shirt
matters - the season, the badge, who wore it.

"For sale" and not "listed": \`top_listed\` counts shirts with a live listing
behind them, which is what a reader can actually buy.

The lower ranks are on the card. Name one or two if they add something, but do
not read the list out: the picture does that.

Only home, away and third shirts are counted, and it is worth saying once that
these are match shirts of one specific kit - it is why the numbers differ from
a raw search.

Close on the fact that some are still listed. This is the rare post where the
call to action is the story.`;
