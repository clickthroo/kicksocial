/**
 * Reading a unique-constraint violation back off a Supabase error.
 *
 * WHY THIS IS NOT A FAILURE. `post_drafts_one_live_per_subject` is what stops
 * two runs queueing the same shirt, and it fires in exactly the situation the
 * engine is meant to handle quietly: the subject is already covered. Reported
 * as a failure it reads as a fault and invites someone to go looking for a
 * broken query; reported as a skip it reads as what it is, which is the same
 * answer the cooldown gives when it gets there first.
 *
 * The index covers drafts and approved posts only - what is still in the
 * pipeline. When a subject may come round again AFTER a post has gone out is a
 * question of windows, and history.ts answers it.
 *
 * 23505 is Postgres's unique_violation. PostgREST passes the SQLSTATE through
 * as `code`, so this does not have to match on message text.
 */
export const DUPLICATE_SUBJECT_INDEX = "post_drafts_one_live_per_subject";

export function isDuplicateSubject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code !== "23505") return false;
  // Any other unique constraint on the table is a real fault and must stay
  // loud, so the index has to be named.
  return typeof message === "string" && message.includes(DUPLICATE_SUBJECT_INDEX);
}

export function duplicateSubjectReason(subjectRef: string): string {
  return (
    `Already in the pipeline: a post about ${subjectRef} is waiting in the ` +
    `queue or approved and not yet posted. Another run got there first, most ` +
    `likely seconds earlier - the cooldown is read before the copy is written, ` +
    `and writing it takes a while.`
  );
}
