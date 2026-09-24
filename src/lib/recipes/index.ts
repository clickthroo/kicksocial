import type { Platform, RecipeResult } from "../engine/types.ts";
import { runGrailOfTheDay, DEFAULT_GRAIL_CONFIG } from "./grail-of-the-day.ts";
import { runPriceTrends, DEFAULT_PRICE_TRENDS_CONFIG } from "./price-trends.ts";
import { runSoldThisWeek, DEFAULT_SOLD_CONFIG } from "./sold-this-week.ts";
import {
  runMarketIndex,
  DEFAULT_MARKET_INDEX_CONFIG,
  MARKET_INDEX_BRIEF,
} from "./market-index.ts";
import {
  runFeaturedCollection,
  DEFAULT_FEATURED_COLLECTION_CONFIG,
  FEATURED_COLLECTION_BRIEF,
} from "./featured-collection.ts";
import {
  runFeaturedSet,
  DEFAULT_FEATURED_SET_CONFIG,
  FEATURED_SET_BRIEF,
} from "./featured-set.ts";
import {
  runCollectorSpotlight,
  DEFAULT_COLLECTOR_SPOTLIGHT_CONFIG,
  COLLECTOR_SPOTLIGHT_BRIEF,
} from "./collector-spotlight.ts";
import {
  runCollectorSetProgress,
  DEFAULT_COLLECTOR_SET_PROGRESS_CONFIG,
  COLLECTOR_SET_PROGRESS_BRIEF,
} from "./collector-set-progress.ts";
import {
  runCollectionIndex,
  DEFAULT_COLLECTION_INDEX_CONFIG,
  COLLECTION_INDEX_BRIEF,
} from "./collection-index.ts";
import {
  runValuePick,
  DEFAULT_VALUE_PICK_CONFIG,
  VALUE_PICK_BRIEF,
} from "./value-pick.ts";
import {
  runClubArchive,
  DEFAULT_CLUB_ARCHIVE_CONFIG,
  CLUB_ARCHIVE_BRIEF,
} from "./club-archive.ts";
import {
  runLegendShelf,
  DEFAULT_LEGEND_SHELF_CONFIG,
  LEGEND_SHELF_BRIEF,
} from "./legend-shelf.ts";

export interface Recipe {
  key: string;
  name: string;
  cadence: "daily" | "weekly" | "monthly";
  platforms: Platform[];
  visualTemplate: string;
  /** The per-recipe half of the copy prompt. Stable, so it caches. */
  brief: string;
  /**
   * Selection logic must be code - each recipe queries a different shape of data
   * and carries its own integrity rules. Thresholds, cadence, platforms and the
   * copy brief are config, loaded from the `recipes` table at run time, so they
   * can be tuned without a redeploy.
   *
   * ADDING A RECIPE HERE IS NOT ENOUGH ON ITS OWN. `post_drafts.recipe_key` has
   * a foreign key against the engine database's own `recipes` table, and there
   * is no admin UI that inserts a row - Settings only edits an existing one
   * (src/app/admin/actions.ts's `saveRecipe` is UPDATE-only). A new `key` here
   * with no matching row runs the selection logic fine and then fails at the
   * very last step, "Saving draft failed: ... violates foreign key constraint
   * post_drafts_recipe_key_fkey" - discovered the hard way building
   * legend_shelf. Insert the row directly against the engine's Supabase project
   * (ENGINE_SUPABASE_URL) before the first run:
   *
   *   insert into recipes (key, name, description, enabled, cadence, platforms,
   *     selection, prompt_template, visual_template)
   *   values ('your_key', 'Your Name', 'One line for Settings', true,
   *     'weekly', array['x','instagram','tiktok'], '{}'::jsonb,
   *     '<the brief below>', 'your_visual_template')
   *   on conflict (key) do nothing;
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

Never count anything. No "5 notable shirts", no "79 tracked sales", no totals,
no averages, no "up from last week". The shirts are the story; how many rows a
query returned is a fact about a database. Name them and say what they went for.

These are the notable sales we can SHOW, not a ranking of every sale - some
tracked sales have no photograph and are not here. So never write "the top sale
this week", "the highest price of the week", or anything else that claims the
set is complete. "Among the week's results" is the right register.

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
  {
    key: "club_archive",
    name: "Club Archive",
    cadence: "weekly",
    platforms: ["x", "instagram", "tiktok"],
    visualTemplate: "archive_grid",
    brief: CLUB_ARCHIVE_BRIEF,
    run: (selection) =>
      runClubArchive({ ...DEFAULT_CLUB_ARCHIVE_CONFIG, ...(selection as object) }),
  },
  {
    key: "featured_collection",
    name: "Featured Collection",
    cadence: "weekly",
    platforms: ["x", "instagram", "tiktok"],
    visualTemplate: "collection_grid",
    brief: FEATURED_COLLECTION_BRIEF,
    run: (selection) =>
      runFeaturedCollection({
        ...DEFAULT_FEATURED_COLLECTION_CONFIG,
        ...(selection as object),
      }),
  },
  {
    key: "featured_set",
    name: "Featured Set",
    cadence: "weekly",
    platforms: ["x", "instagram", "tiktok"],
    visualTemplate: "collection_grid",
    brief: FEATURED_SET_BRIEF,
    run: (selection) =>
      runFeaturedSet({ ...DEFAULT_FEATURED_SET_CONFIG, ...(selection as object) }),
  },
  {
    key: "collector_spotlight",
    name: "Collector Spotlight",
    cadence: "weekly",
    platforms: ["x", "instagram", "tiktok"],
    visualTemplate: "collector_grid",
    brief: COLLECTOR_SPOTLIGHT_BRIEF,
    run: (selection) =>
      runCollectorSpotlight({
        ...DEFAULT_COLLECTOR_SPOTLIGHT_CONFIG,
        ...(selection as object),
      }),
  },
  {
    key: "collector_set_progress",
    name: "Collector Set Progress",
    cadence: "weekly",
    platforms: ["x", "instagram"],
    visualTemplate: "collector_grid",
    brief: COLLECTOR_SET_PROGRESS_BRIEF,
    run: (selection) =>
      runCollectorSetProgress({
        ...DEFAULT_COLLECTOR_SET_PROGRESS_CONFIG,
        ...(selection as object),
      }),
  },
  {
    key: "collection_index",
    name: "Collection Index",
    cadence: "monthly",
    platforms: ["x", "instagram"],
    visualTemplate: "index_chart",
    brief: COLLECTION_INDEX_BRIEF,
    run: (selection) =>
      runCollectionIndex({
        ...DEFAULT_COLLECTION_INDEX_CONFIG,
        ...(selection as object),
      }),
  },
  {
    key: "value_pick",
    name: "Value Pick",
    cadence: "weekly",
    platforms: ["x", "instagram", "tiktok"],
    visualTemplate: "value_card",
    brief: VALUE_PICK_BRIEF,
    run: (selection) =>
      runValuePick({ ...DEFAULT_VALUE_PICK_CONFIG, ...(selection as object) }),
  },
  {
    key: "legend_shelf",
    name: "Legend Shelf",
    cadence: "weekly",
    platforms: ["x", "instagram", "tiktok"],
    visualTemplate: "legend_grid",
    brief: LEGEND_SHELF_BRIEF,
    run: (selection) =>
      runLegendShelf({ ...DEFAULT_LEGEND_SHELF_CONFIG, ...(selection as object) }),
  },
];

export function recipeByKey(key: string): Recipe | undefined {
  return RECIPES.find((r) => r.key === key);
}
