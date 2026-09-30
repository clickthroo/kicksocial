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

-- 2026-09-26: re-sync the Who Am I? brief after the teammate mechanic was added
-- to it. The brief lives in code (`WHO_AM_I_BRIEF`); this column is what the
-- generator actually reads, so the two drift silently unless the update is run.
-- `do nothing` above means a re-run of the insert will not fix it - the update
-- is the fix. 1,411 chars -> 2,069.
update recipes
set prompt_template = '<WHO_AM_I_BRIEF, from src/lib/recipes/who-am-i.ts>'
where key = 'who_am_i';

-- 2026-09-26: the "new" badge on /who-am-i.
--
-- The picker re-tests every career against the live catalogue on each load, so
-- careers appear and disappear on their own as shirts arrive and are removed.
-- That is the design, and it is also why "19 ready of 71" tells you nothing
-- about whether the shelf moved. This records the first time we saw each
-- subject qualify.
--
-- Insert-only, deliberately. A cooldown takes a subject off the list for 180
-- days and then hands it back; refreshing the date on its return would badge
-- every recycled career as new and the badge would mean nothing.
create table if not exists subject_first_seen (
  recipe_key    text        not null,
  subject_ref   text        not null,
  first_seen_at timestamptz not null default now(),
  primary key (recipe_key, subject_ref)
);

-- Backfill, run once. Without it the seventeen careers that already qualified
-- would all be recorded on the first page load after deploy and every one of
-- them would light up as new for a week. Dated outside the window rather than
-- given an invented exact date, because we do not know when each one first
-- became eligible. Collymore and Nasri are deliberately absent: they were
-- added the same day and are genuinely new.
insert into subject_first_seen (recipe_key, subject_ref, first_seen_at)
select 'who_am_i', k, now() - interval '30 days'
from unnest(array[
  'stam','vieira','balotelli','ibrahimovic','ashley-young','brian-laudrup','anelka',
  'bellamy','crespo','veron','heinze','kp-boateng','lukaku','defoe','david-james',
  'andy-cole','woodgate'
]) as k
on conflict (recipe_key, subject_ref) do nothing;

-- 2026-09-27: the dashboard login. Full DDL in the migration
-- `admin_users_and_login`; recorded here because this file is the readable
-- history of the engine's own schema.
--
-- Not Supabase Auth, deliberately: one kind of user, the app never acts as that
-- user against either database, and the engine project had signups reachable
-- with a publishable key. Passwords are bcrypt and are compared inside
-- verify_admin() so the hash never leaves the server and the password is a
-- bound parameter rather than part of a statement. That function also keeps the
-- lockout counter, five attempts to a fifteen-minute lock.
--
-- create table admin_users (email pk, password_hash, display_name, disabled,
--   failed_attempts, locked_until, must_change, created_at, last_login_at);
-- create function verify_admin(p_email, p_password) returns jsonb;
-- create function set_admin_password(p_email, p_password, p_must_change);
--
-- The first account, which must change its password on first sign-in:
-- insert into admin_users (email, password_hash, display_name, must_change)
-- values ('david@kickio.com', extensions.crypt('<temporary>',
--         extensions.gen_salt('bf', 12)), 'David', true);

-- 2026-09-30: RLS on subject_first_seen. Supabase's advisor caught this as a
-- CRITICAL: the table was created above without it while every other table in
-- this database has it, so it was the one table in the project the anon key
-- could read, insert into and delete from.
--
-- WHY "ENABLE" AND NO POLICIES IS THE RIGHT ANSWER HERE, not an unfinished job.
-- Nothing ever reaches this database except the server, holding the service
-- role key, and service_role bypasses RLS. So RLS with zero policies is exactly
-- the intended posture: deny everything to anon and authenticated, and let the
-- server through. Supabase's linter still reports it at INFO level
-- ("rls_enabled_no_policy") for all seven tables; that notice is expected and
-- is not the same finding as the CRITICAL one this fixes.
--
-- THE GRANTS WERE THE REAL ROOT CAUSE. Every table in this schema granted anon
-- and authenticated the full set - SELECT, INSERT, UPDATE, DELETE, TRUNCATE -
-- because that is the Supabase default. RLS was therefore the only thing
-- standing between the project's publishable key and the data, on all seven
-- tables. It held everywhere it was switched on and failed on the one table
-- where it was not, which is what turned a forgotten line into a CRITICAL.
--
-- Nothing but the server ever reaches this database, and the server holds the
-- service role key, so those grants bought nothing and cost exactly one
-- outage-shaped mistake. Revoked below. The `alter default privileges` lines
-- are the ones that matter in a year's time: they mean the NEXT table someone
-- creates is closed to anon whether or not they remember the RLS line.
--
-- Verified after the change, rather than assumed:
--   - a new table created with RLS deliberately left off - the exact mistake
--     repeated - came out with anon SELECT false and anon DELETE false, and
--     service_role SELECT true. The failure mode is now harmless.
--   - service_role still reads all seven tables (51 drafts, 16 recipes, 22
--     first-seen, 1 admin, 1 brand, 105 runs, 0 publishes) and still holds
--     EXECUTE on verify_admin and set_admin_password, so the login is intact.
--   - anon and authenticated hold zero table grants in this schema.
alter table public.subject_first_seen enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
-- Repeated for the role that actually creates the tables: default privileges
-- are recorded per creating role, so the unqualified form above covers only
-- the role running it.
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- 2026-09-30: posting to X from the dashboard. Full DDL in the migration
-- `platform_tokens`; recorded here because this file is the readable history
-- of the engine's own schema.
--
-- A TABLE AND NOT AN ENVIRONMENT VARIABLE. X rotates the refresh token on
-- every use: each refresh returns a new one and invalidates the old. A token
-- kept only in an env var would work exactly once and then leave the
-- integration permanently broken with no way back except re-authorising by
-- hand. X_REFRESH_TOKEN seeds the first row; the row is the source of truth
-- afterwards and the variable is ignored.
--
-- These rows ARE credentials, so RLS matters more here than on any other
-- table: enabled, no policies, service role only, same as the rest.
--
-- create table platform_tokens (platform pk, refresh_token, access_token,
--   access_expires_at, updated_at);
-- alter table platform_tokens enable row level security;
--
-- publish_log needed nothing new. `method` was always there for this: it reads
-- 'export' for a post someone pasted and 'x_api' for one the button sent, and
-- the partial unique index (draft_id, platform) where status = 'succeeded'
-- already allows the failed rows the publisher now writes.
