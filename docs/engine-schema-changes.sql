-- Schema changes applied to the CONTENT ENGINE's own Supabase project
-- (dsbrvpzfniosjtaxzpxm). Kickio is never touched by any of this - see
-- CLAUDE.md, which makes that database read-only from here.
--
-- Recorded in the repository because the schema otherwise lives only in the
-- cloud, and "when did that column appear, and why" is the sort of question
-- that gets asked long after the answer has scrolled out of anyone's memory.
-- Applied via the Supabase MCP tools; kept here to be read, not re-run.

-- 2026-09-25: a draft that aged out of the queue without anyone deciding on it.
--
-- Deliberately distinct from 'rejected'. Rejecting says "not this one" and
-- blocks the subject for good; expiring says only that nobody got to it in
-- time, so history.ts frees the subject again after a month rather than
-- holding it for a year over a week's holiday.
alter type draft_status add value if not exists 'expired';

-- 2026-09-25: one live post per subject, enforced by the database.
--
-- Every recipe already asks "have we covered this subject recently?" before it
-- selects - but it asks BEFORE writing the copy, which takes around thirteen
-- seconds. Two runs starting inside that window both read a clean history,
-- both pick the same shirt and both insert. That is exactly what happened on
-- 2026-09-17: three runs of Grail of the Day 1.3s apart produced three drafts
-- of the same Manchester City shirt. No amount of checking before the write
-- closes that gap; only a constraint at the point of the write does.
--
-- Scoped to what is still in the pipeline. Published rows are excluded on
-- purpose: most subjects are MEANT to come round again - Price Trends posts
-- about Germany, Club Archive about Liverpool - and including them would turn
-- every cooldown into "never again" on the first post about a subject.
-- Rejected and expired rows are excluded for the same reason.
create unique index post_drafts_one_live_per_subject
  on post_drafts (recipe_key, subject_ref)
  where status in ('draft', 'approved');
