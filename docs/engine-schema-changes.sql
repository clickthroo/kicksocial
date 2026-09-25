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

-- 2026-09-25: the Price History recipe's configuration row.
--
-- Data rather than schema, but it belongs with these: `post_drafts.recipe_key`
-- carries a foreign key against this table and no screen inserts a row, so a
-- recipe without one runs its whole selection, spends a copy generation, and
-- only then fails on the insert. See the note on `Recipe` in
-- src/lib/recipes/index.ts, where that was learned the hard way.
insert into recipes (key, name, description, enabled, cadence, platforms,
  selection, prompt_template, visual_template)
values ('price_history', 'Price History',
  'One shirt and every sale on record, plotted. Chosen by hand from the shirts that qualify.',
  true, 'on_demand', array['x','instagram'], '{"style":"paper"}'::jsonb,
  '<PRICE_HISTORY_BRIEF, from src/lib/recipes/price-history.ts>',
  'price_history_card')
on conflict (key) do nothing;

-- 2026-09-25: the Who Am I? recipe's configuration row. Same reason as above -
-- `post_drafts.recipe_key` has a foreign key against this table, so a recipe
-- without a row runs its whole selection, spends a copy generation, and only
-- then fails on the insert.
insert into recipes (key, name, description, enabled, cadence, platforms,
  selection, prompt_template, visual_template)
values ('who_am_i', 'Who Am I?',
  'Six club shirts from one career, and a question. Chosen by hand from the careers the shelf can currently field.',
  true, 'on_demand', array['x','instagram'], '{"style":"paper"}'::jsonb,
  '<WHO_AM_I_BRIEF, from src/lib/recipes/who-am-i.ts>',
  'who_am_i_card')
on conflict (key) do nothing;
