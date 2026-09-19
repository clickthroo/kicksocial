/**
 * Reading more of Kickio than one response can carry.
 *
 * Two limits sit between this engine and the marketplace. Both are facts about
 * the transport rather than about the data, and one of them fails silently -
 * which is why they live here, in one place, with the evidence attached.
 *
 * 1. THE ROW CAP IS NOT THE LIMIT YOU ASKED FOR
 *
 * PostgREST caps a response at its `db-max-rows`, which is 1,000 on Kickio.
 * `.limit(5000)` does not raise that cap: you get 1,000 rows, HTTP 200, and no
 * error anywhere. Value Pick asked for 5,000 live listings and was handed
 * 1,000 of the 1,649 that exist - the response said `content-range: 0-999/*`
 * and nothing else complained. Had the run got that far it would have counted
 * scarcity across a marketplace with 39% of it missing, and published "the
 * only one in this size" about a shirt whose other copies were simply on a
 * page it never asked for. A wrong number would have been safer; this was a
 * false statement with a citation.
 *
 * Paging with `.range()` is the only way to see all of it, and it is correct
 * whatever the cap happens to be.
 *
 * 2. `.in()` BECOMES A URL, AND URLS RUN OUT
 *
 * A filter list is sent in the query string. 1,171 product ids came to 29,276
 * characters and the gateway answered 400 Bad Request - the failure that made
 * Value Pick report "nothing to post" when the truth was that it never got to
 * look. A 19,510-character request is known to pass, so CHUNK is set well
 * below that and long lists go in batches.
 *
 * Any query that scans the marketplace, rather than one collection or one
 * team, has to respect both.
 */

/** PostgREST's row cap on Kickio. Pages are requested at exactly this size. */
export const PAGE = 1000;

/**
 * Ids per request when a filter list has to be chunked.
 *
 * 200 uuids is roughly 8KB of query string, against 19.5KB known to pass and
 * 29KB known to fail. The margin is deliberate: the ceiling is set by a
 * gateway we do not control and may be lowered without notice.
 */
export const CHUNK = 200;

/**
 * The shape both helpers need from a Supabase response.
 *
 * `data` is `unknown` because the Kickio client is untyped - it has no
 * generated database types, so every query returns a generic row. The cast to
 * `T` happens once, here, instead of an `as unknown as Row[]` at each call
 * site. It is the same cast either way; this way there is one of it.
 */
interface Page {
  data: unknown;
  error: { message: string } | null;
}

/**
 * Split a list into batches. Exported for its own sake - the batching is the
 * part worth testing, and it cannot be tested through a network call.
 */
export function chunk<T>(values: readonly T[], size: number = CHUNK): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`chunk size must be a positive integer, got ${size}`);
  }
  const batches: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    batches.push(values.slice(i, i + size));
  }
  return batches;
}

/**
 * Every row a query matches, fetched a page at a time.
 *
 * Throws rather than returning a reason. A failed read is not "nothing to
 * post" - it is a broken run, and the two must not arrive at the same place.
 * `runRecipe` records a thrown error as `failed`; a returned `{ ok: false }`
 * is recorded as `skipped` and shown to a human as "Nothing to post". Value
 * Pick's 400 came out as "Nothing to post" for exactly this reason.
 *
 * `label` names the read, so a failure says which one broke.
 */
export async function pageAll<T>(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<Page>,
  ceiling = 50_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(`${label} failed: ${error.message}`);

    const page = (data ?? []) as T[];
    rows.push(...page);

    // A short page is the last page. This is the only exit that means "done".
    if (page.length < PAGE) return rows;

    // A server that ignores `range` would loop here forever. Refuse loudly:
    // quietly returning the first 50,000 rows is the same class of bug as the
    // row cap itself.
    if (rows.length >= ceiling) {
      throw new Error(
        `${label} read ${rows.length} rows without reaching the end - ` +
          "the server appears to be ignoring the requested range",
      );
    }
  }
}

/**
 * Every row matching a filter list, with the list chunked and each chunk paged.
 *
 * Order is not preserved across chunks, and callers must not depend on it -
 * group the rows yourself.
 */
export async function pageIn<T, V>(
  label: string,
  values: readonly V[],
  fetchPage: (batch: V[], from: number, to: number) => PromiseLike<Page>,
  size: number = CHUNK,
): Promise<T[]> {
  const rows: T[] = [];
  for (const batch of chunk(values, size)) {
    rows.push(...(await pageAll<T>(label, (from, to) => fetchPage(batch, from, to))));
  }
  return rows;
}
