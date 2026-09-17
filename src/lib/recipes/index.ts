import type { Platform, RecipeResult } from "../engine/types.ts";
import { runGrailOfTheDay, DEFAULT_GRAIL_CONFIG } from "./grail-of-the-day.ts";
import { runPriceTrends, DEFAULT_PRICE_TRENDS_CONFIG } from "./price-trends.ts";
import { runSoldThisWeek, DEFAULT_SOLD_CONFIG } from "./sold-this-week.ts";
import {
  runMarketIndex,
  DEFAULT_MARKET_INDEX_CONFIG,
  MARKET_INDEX_BRIEF,
} from "./market-index.ts";

export interface Recipe {
  key: string;
  name: string;
  cadence: "daily" | "weekly";
  platforms: Platform[];
  visualTemplate: string;
  /** The per-recipe half of the copy prompt. Stable, so it caches. */
  brief: string;
  /**
   * Selection logic must be code - each recipe queries a different shape of data
   * and carries its own integrity rules. Thresholds, cadence, platforms and the
   * copy brief are config, loaded from the `recipes` table at run time, so they
   * can be tuned without a redeploy.
   */
  run: (selection?: Record<string, unknown>) => Promise<RecipeResult>;
}

export const RECIPES: Recipe[] = [
  {
    key: "grail_of_the_day",
    name: "Grail of the Day",
    cadence: "daily",
    platforms: ["x", "instagram", "tiktok"],
    visualTemplate: "grail_card",
    brief: `**Grail of the Day** - one standout shirt currently listed on Kickio.

Lead with whatever makes this specific shirt worth stopping for: the issue type,
the era, the player, the condition, or the sheer price. The rarity signals in the
facts tell you which angle is strongest - a match issue is a better hook than a
high price.

This shirt is available to buy right now, so the post should make a collector want
to look at the listing. Do not imply it is sold, or that it is the only one in
existence.`,
    run: (selection) =>
      runGrailOfTheDay({ ...DEFAULT_GRAIL_CONFIG, ...(selection as object) }),
  },
  {
    key: "price_trends",
    name: "Price Trends",
    cadence: "weekly",
    platforms: ["x", "instagram"],
    visualTemplate: "trend_chart",
    brief: `**Price Trends** - one genuine, like-for-like movement in the market.

The headline number is in the claims. State it plainly and give collectors a
reason it might be happening, framed as observation rather than certainty
("worth watching", "hard to say whether that holds").

Two hard rules:
- This is MARKET data aggregated by Kickio from across the hobby. It is not
  Kickio's own sales. Never write "sold on Kickio" or imply Kickio's volume.
- The figure is like-for-like: the same comparable shirts tracked across both
  windows. If you describe the method at all, describe it that way. Do not round
  the number beyond one decimal place, and do not restate it as a different
  number elsewhere in the post.

No TikTok variant - a chart is a weak video. Write X and Instagram only.`,
    run: (selection) =>
      runPriceTrends({ ...DEFAULT_PRICE_TRENDS_CONFIG, ...(selection as object) }),
  },
  {
    key: "sold_this_week",
    name: "Sold This Week",
    cadence: "weekly",
    platforms: ["x", "instagram"],
    visualTemplate: "roundup_card",
    brief: `**Sold This Week** - a roundup of notable recent sales across the market.

Pick out the two or three most interesting results and say what makes each one
notable. A pattern across the week is more interesting than a list.

Hard rule: this is MARKET-WIDE sales data that Kickio aggregates from across the
hobby - it is NOT Kickio's own sales. Never write "sold on Kickio", "we sold", or
anything implying this is Kickio's transaction volume. "The market" and "tracked
sales" are the right framings.

No TikTok variant. Write X and Instagram only.`,
    run: (selection) => runSoldThisWeek({ ...DEFAULT_SOLD_CONFIG, ...(selection as object) }),
  },
  {
    key: "market_index",
    name: "Market Index",
    cadence: "weekly",
    platforms: ["x", "instagram"],
    visualTemplate: "trend_chart",
    brief: MARKET_INDEX_BRIEF,
    run: (selection) =>
      runMarketIndex({ ...DEFAULT_MARKET_INDEX_CONFIG, ...(selection as object) }),
  },
];

export function recipeByKey(key: string): Recipe | undefined {
  return RECIPES.find((r) => r.key === key);
}
