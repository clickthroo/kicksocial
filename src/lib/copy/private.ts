/**
 * Figures about Kickio itself, kept out of the prompt entirely.
 *
 * The brand voice tells the model not to publish them. That is necessary and
 * it is not sufficient, for the same reason the em dash ban is enforced in
 * `dashes.ts` rather than left to the brief: an instruction is a strong
 * default and a filter is a guarantee, and this is a guarantee somebody asked
 * for.
 *
 * So the number never reaches the model at all. A model cannot print a figure
 * it was not given, and a prompt is one careless edit away from losing a rule
 * that lives only in prose.
 *
 * WHAT IS PRIVATE: anything describing the SIZE of the business. How many
 * shirts are listed, how many are in the catalogue, how many sold, how many
 * sellers or collectors there are, how many sales are tracked, what anything
 * totals.
 *
 * WHAT IS NOT: a fact about the one thing the post is about. What a shirt
 * costs, what it sold for, how many of THAT shirt are listed, how its price
 * has moved. A reader sees all of those on the shirt's own page, and a post
 * that cannot mention them has nothing to say.
 */

/**
 * Keys redacted from `source_data` before it reaches the model.
 *
 * Matched on the whole key rather than a substring, so `listings_count` - how
 * many of ONE shirt are for sale - is untouched while `total_sales` goes.
 * A new recipe that invents its own name for a site-wide count will not be
 * caught by this list, which is why the brand voice carries the rule in words
 * as well.
 */
export const PRIVATE_FIELDS: ReadonlySet<string> = new Set([
  // Inventory: how much Kickio has.
  "live_shirt_count",
  "shirts_on_kickio",
  "catalogue_size",
  "products_count",
  "total_listings",
  "listings_total",
  // Volume: how much moves through it.
  "total_sales",
  "total_sales_90d",
  "sales_count",
  "sales_tracked",
  // The sample behind an index figure: how many comparable shirts are tracked,
  // which is the same question as how much data Kickio holds. The claim beside
  // it says the method is like-for-like, which is what a reviewer needs.
  "cohort_count",
  "recorded_that_day",
  "listed_that_day",
  "postable",
  // People.
  "collector_count",
  "seller_count",
  "buyer_count",
  "member_count",
  // Money in aggregate.
  "total_value",
  "total_cents",
  "gmv_cents",
]);

export function isPrivateField(key: string): boolean {
  return PRIVATE_FIELDS.has(key.trim().toLowerCase());
}

/**
 * `source_data` with the private figures taken out.
 *
 * Shallow: every recipe builds this object literally, one level deep, and a
 * deep walk would also reach into `featured`, where `price` is a per-shirt
 * fact that must survive. Returns the same object when there is nothing to
 * remove, so the common case allocates nothing.
 */
export function withoutPrivateFigures(
  sourceData: Record<string, unknown>,
): Record<string, unknown> {
  const keys = Object.keys(sourceData);
  if (!keys.some(isPrivateField)) return sourceData;
  const out: Record<string, unknown> = {};
  for (const key of keys) if (!isPrivateField(key)) out[key] = sourceData[key];
  return out;
}

/**
 * Which private keys a recipe tried to hand over.
 *
 * For the run log. A recipe quietly having its data filtered is how a rule
 * becomes invisible, and the next person wonders why a number they can see in
 * the code never appears in a post.
 */
export function privateFieldsIn(sourceData: Record<string, unknown>): string[] {
  return Object.keys(sourceData).filter(isPrivateField);
}
