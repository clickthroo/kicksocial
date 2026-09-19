/**
 * Can the engine see Kickio's recorded sales at all?
 *
 * `sales_history` has an INSERT policy and no SELECT policy. Under RLS that
 * means the `anon` key reads ZERO rows and gets HTTP 200 with an empty array -
 * no error, nothing in a log, nothing to notice. Confirmed directly:
 *
 *     set local role anon;
 *     select count(*) from sales_history;  -->  0
 *     select count(*) from listings;       -->  1661
 *
 * That is already documented in docs/unblocking-sold-this-week.md, and
 * `sold_this_week` is disabled because of it. Value Pick was built on the same
 * table anyway: the audit behind it ran through an admin connection, which
 * bypasses RLS, so 14 qualifying listings were counted that the engine itself
 * could never have seen.
 *
 * WHY THIS NEEDS ITS OWN CHECK
 *
 * Without one, an unreadable table and a quiet market are the same thing. Value
 * Pick read 1,426 live listings, found no sale to compare any of them against,
 * and reported "No live listing is far enough below what that exact shirt sells
 * for" - a statement about the market that is not true and cannot be true,
 * because no price was ever in hand to compare. A recipe that guards this hard
 * against overstating a discount must not understate its own blindness.
 *
 * So: zero sales across a non-empty candidate set is treated as a permissions
 * fault, not a market fact.
 */

/**
 * A union rather than an optional `reason`, so the type itself guarantees that
 * a blind verdict always carries one. The caller reports `reason` directly and
 * needs no non-null assertion to do it.
 */
export type SalesAccessVerdict =
  | { ok: true; blind: false }
  /** Nothing was asked for, so nothing coming back proves nothing. */
  | { ok: false; blind: false }
  /** Connected, but the table reads as empty. */
  | { ok: false; blind: true; reason: string };

/**
 * `candidates` is how many live listings were matched and looked up;
 * `saleRows` is how many `sales_history` rows came back for them.
 */
export function salesAccess(candidates: number, saleRows: number): SalesAccessVerdict {
  if (saleRows > 0) return { ok: true, blind: false };

  // Nothing was asked for, so nothing coming back says nothing about access.
  if (candidates === 0) return { ok: false, blind: false };

  return {
    ok: false,
    blind: true,
    // Conclusion, evidence, remedy - this string is the skip reason on the run
    // log and has to stand on its own there.
    reason:
      "The engine cannot see Kickio's recorded sales — it read " +
      `${candidates} live listings but 0 sales_history rows. That table has an ` +
      "INSERT policy and no SELECT policy, so the `anon` key reads zero rows " +
      "and no error is raised. Apply docs/kickio-read-only-role.sql, then point " +
      "KICKIO_SUPABASE_PUBLISHABLE_KEY at a kickio_content_reader key " +
      "(docs/unblocking-sold-this-week.md).",
  };
}
