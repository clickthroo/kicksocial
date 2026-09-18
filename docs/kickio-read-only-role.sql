-- ============================================================================
-- Read-only role for the Kickio Content Engine
-- ============================================================================
--
-- REVIEW BEFORE RUNNING. This has not been executed against Kickio. It is a
-- proposal for a human to read, adjust and run.
--
-- WHAT THIS DOES
--   Creates a database role the content engine uses to read market sales data
--   (for `sold_this_week`) and collector data (for the two Collector Spotlight
--   recipes).
--
-- WHAT THIS DOES NOT DO
--   * It does not modify, delete or migrate a single row. No data changes.
--   * It does not make anything public. The policy below is scoped to this one
--     named role - NOT to `anon`, which is the key Kickio's marketplace ships
--     to every visitor's browser. Granting `anon` SELECT on sales_history would
--     publish 31k rows of aggregated pricing data to anyone who views source.
--   * It grants no INSERT, UPDATE, DELETE or DDL. The role is structurally
--     incapable of changing Kickio.
--
-- WHY A POLICY IS NEEDED AS WELL AS A GRANT
--   sales_history has RLS enabled. Under RLS, a GRANT alone is not sufficient -
--   with no policy matching the current role, the role reads zero rows. So the
--   grant says "may read this table" and the policy says "may read these rows".
--   Both are required.
--
-- THE ONE WAY THIS CAN TOUCH THE LIVE SITE
--   No row is read or written, but GRANT and CREATE POLICY take a brief
--   ACCESS EXCLUSIVE lock on each target table. The work itself is a catalog
--   update - effectively instant - but the statement must first wait for
--   in-flight transactions on that table to finish, and new queries queue
--   behind it while it waits. On `listings` and `products`, which serve
--   kickio.com, a long-running query at the wrong moment could stall traffic.
--
--   lock_timeout below caps that at 3 seconds: the script aborts rather than
--   holding the marketplace up. Re-run it if it does. Prefer a quiet period.
--
-- ROLLBACK is at the bottom, no data implications.
-- ============================================================================

-- Fail rather than queue. Without this, one slow query on `listings` can turn a
-- catalog update into an outage.
set lock_timeout = '3s';

-- All or nothing: a half-applied role is harder to reason about than none.
begin;


-- ---------------------------------------------------------------------------
-- 1. The role
-- ---------------------------------------------------------------------------
-- NOLOGIN: this role is never logged into directly. PostgREST switches into it
-- for the duration of a request, so there is no password to manage or leak.
create role kickio_content_reader nologin;

-- Let PostgREST (which connects as `authenticator`) switch into the role.
grant kickio_content_reader to authenticator;


-- ---------------------------------------------------------------------------
-- 2. Schema and table access - least privilege, named tables only
-- ---------------------------------------------------------------------------
grant usage on schema public to kickio_content_reader;

-- Deliberately NOT `grant select on all tables`. Only what the engine actually
-- reads. Anything added to Kickio later is invisible to this role by default.
--
-- This list must match KickioTable in src/lib/kickio/client.ts. Once the engine
-- authenticates as this role it uses it for EVERY query, not just sales - so a
-- table missing here breaks a feature:
--   profiles             -> the seller checkboxes in Settings (throws, visibly)
--   marketplace_settings -> the buyer protection fee, and therefore the price in
--                           every post. buyerFeeSettings() falls back to
--                           hardcoded defaults on error rather than failing the
--                           run, so omitting this does not break loudly - it
--                           just stops tracking Kickio's real fee, and posts
--                           drift silently wrong the day that fee changes.
grant select on
  public.sales_history,
  public.listings,
  public.products,
  public.teams,
  public.price_index_aggregates,
  public.price_index_history,
  public.profiles,
  public.marketplace_settings,
  -- Curated and generated collection lists. Already readable by anon where
  -- `visibility = 'public'`; granted here because this role does not inherit
  -- anon's grants.
  public.collection_sets,
  public.collection_set_slots
to kickio_content_reader;


-- ---------------------------------------------------------------------------
-- 2b. Collector tables - COLUMN-level grants
-- ---------------------------------------------------------------------------
-- These three carry personal data, so the role is given named COLUMNS rather
-- than whole tables. A column the role was never granted cannot be selected
-- even by a query that asks for it, so the promise "the engine never publishes
-- what someone paid" is enforced by the database rather than by a convention
-- in application code that a later edit could quietly drop.
--
-- DELIBERATELY OMITTED, and why:
--   collections.paid_cents           what this person paid for this shirt
--   collector_profile.sets_snapshot  a cached per-user progress blob
--   collection_snapshots.total_cents what the whole collection is worth
--
-- `collection_snapshots` is not granted at all. Every column on it is either a
-- valuation or trivially derived from `collections`, and a named collector
-- beside a total value is a shopping list for a burglar. If a later recipe
-- wants collection growth over time, derive it from `collections.acquired_at`.

grant select (id, user_id, product_id, acquired_at, note, condition, size, hidden)
  on public.collections to kickio_content_reader;

grant select (user_id, chosen_title, featured_consent, streak_weeks)
  on public.collector_profile to kickio_content_reader;

grant select (id, user_id, item_kind, item_id, note, sort)
  on public.collection_highlights to kickio_content_reader;


-- ---------------------------------------------------------------------------
-- 3. Row policies scoped to this role
-- ---------------------------------------------------------------------------

-- The engine may read ONLY approved, non-excluded, non-dismissed sales. Rows
-- still under review, or ones an admin excluded as bad data, stay invisible to
-- it. This is both a privacy boundary and a correctness one: the engine cannot
-- accidentally publish a figure derived from data your team rejected.
create policy sales_history_content_engine_read
  on public.sales_history
  for select
  to kickio_content_reader
  using (
    excluded_at is null
    and dismissed_at is null
    and review_state = 'approved'
  );

-- price_index_aggregates and price_index_history currently have policies scoped
-- `TO {anon, authenticated}`, which does not cover this new role, so it needs
-- its own. These two tables are already anon-readable, so this grants the role
-- nothing the public cannot already see.
create policy price_index_aggregates_content_engine_read
  on public.price_index_aggregates
  for select
  to kickio_content_reader
  using (true);

create policy price_index_history_content_engine_read
  on public.price_index_history
  for select
  to kickio_content_reader
  using (true);

-- ---------------------------------------------------------------------------
-- Collector policies: both opt-outs, enforced here as well as in the app
-- ---------------------------------------------------------------------------
-- Kickio ships two switches, BOTH defaulting to true, so this is opt-out by
-- design:
--   profiles.collection_public           "my collection is public"
--   collector_profile.featured_consent   "Kickio may feature me"
-- An opt-out that is only read by application code is one careless edit away
-- from not existing. Enforced here, a collector who turns either switch off
-- becomes invisible to the engine at the database, whatever the engine asks.
--
-- FAIL CLOSED ON A MISSING ROW. A user with no `collector_profile` row has
-- never been shown the switch, so the EXISTS below excludes them rather than
-- reading the column default as agreement. Today that is 6 of 9 profiles. If
-- you would rather treat "no row" as consent, change the second EXISTS to:
--     not exists (select 1 from public.collector_profile cp
--                  where cp.user_id = collections.user_id
--                    and cp.featured_consent = false)
-- That is a product decision, so it is written the cautious way and left to you.

create policy collections_content_engine_read
  on public.collections
  for select
  to kickio_content_reader
  using (
    -- A shirt hidden inside a public collection is a specific choice about
    -- that shirt, and it outranks the collection-level setting.
    hidden = false
    and exists (
      select 1 from public.profiles pr
      where pr.id = collections.user_id
        and pr.deleted_at is null
        and pr.collection_public
    )
    and exists (
      select 1 from public.collector_profile cp
      where cp.user_id = collections.user_id
        and cp.featured_consent
    )
  );

-- Only consenting collectors are visible at all, so the engine cannot even
-- enumerate the people who have opted out.
create policy collector_profile_content_engine_read
  on public.collector_profile
  for select
  to kickio_content_reader
  using (
    featured_consent
    and exists (
      select 1 from public.profiles pr
      where pr.id = collector_profile.user_id
        and pr.deleted_at is null
        and pr.collection_public
    )
  );

create policy collection_highlights_content_engine_read
  on public.collection_highlights
  for select
  to kickio_content_reader
  using (
    exists (
      select 1 from public.profiles pr
      where pr.id = collection_highlights.user_id
        and pr.deleted_at is null
        and pr.collection_public
    )
    and exists (
      select 1 from public.collector_profile cp
      where cp.user_id = collection_highlights.user_id
        and cp.featured_consent
    )
  );

-- collection_sets / collection_set_slots need no new policy: their read
-- policies are scoped TO public and gated on `visibility = 'public'`, which
-- covers this role. Verified against pg_policies:
--   "public sets are readable", "slots follow their set"

-- listings / products / teams / profiles / marketplace_settings need no new
-- policy. Their read policies are scoped `TO public`, which in Postgres means
-- every role, including this one. Verified against pg_policies:
--   listings_public_read, products_public_read, products_read,
--   teams_public_read, profiles_read, marketplace_settings_public_read
-- The grant above is still required - a `TO public` policy says which ROWS, the
-- grant says whether the role may touch the table at all.


commit;


-- ============================================================================
-- VERIFICATION - run after the above, expect the commented results
-- ============================================================================
--
--   set role kickio_content_reader;
--
--   -- Should return a non-zero count (~28,700 approved rows):
--   select count(*) from sales_history;
--
--   -- Should return 0 - excluded rows stay invisible:
--   select count(*) from sales_history where excluded_at is not null;
--
--   -- Should each FAIL with "permission denied". If any succeeds, STOP and
--   -- roll back - the role is not read-only:
--   insert into sales_history (sold_at, price_cents, currency, source)
--     values (now(), 1, 'GBP', 'test');
--   update listings set price_cents = price_cents;
--   delete from sales_history where false;
--
--   -- Should each return rows - the engine needs these for seller labels and
--   -- for the buyer protection fee that sets the price shown in posts:
--   select count(*) from profiles;
--   select bpf_percent_bps, bpf_fixed_gbp_cents from marketplace_settings;
--
--   -- Should fail - the role has no access to tables it was not granted:
--   select count(*) from chargebacks;
--
--   -- COLLECTOR ACCESS ------------------------------------------------------
--
--   -- Should FAIL with "permission denied for column paid_cents". This is the
--   -- single most important check here: it is what makes "the engine never
--   -- publishes what someone paid" true structurally rather than by habit.
--   select paid_cents from collections limit 1;
--
--   -- Should also fail - valuations are not granted at all:
--   select total_cents from collection_snapshots limit 1;
--   select sets_snapshot from collector_profile limit 1;
--
--   -- Should succeed, and return only consenting, public, non-hidden rows:
--   select count(*) from collections;
--   select user_id, chosen_title from collector_profile;
--
--   -- Should return 0 - a collector who opted out is invisible, not filtered
--   -- in the application:
--   select count(*) from collector_profile where featured_consent = false;
--
--   -- Should return 0 - a shirt hidden inside a public collection stays hidden:
--   select count(*) from collections where hidden;
--
--   reset role;
--
-- ============================================================================


-- ============================================================================
-- ROLLBACK - removes everything above. No data implications.
-- ============================================================================
--
--   drop policy if exists collections_content_engine_read on public.collections;
--   drop policy if exists collector_profile_content_engine_read on public.collector_profile;
--   drop policy if exists collection_highlights_content_engine_read on public.collection_highlights;
--   drop policy if exists sales_history_content_engine_read on public.sales_history;
--   drop policy if exists price_index_aggregates_content_engine_read on public.price_index_aggregates;
--   drop policy if exists price_index_history_content_engine_read on public.price_index_history;
--   revoke all on public.sales_history, public.listings, public.products,
--     public.teams, public.price_index_aggregates, public.price_index_history,
--     public.profiles, public.marketplace_settings, public.collection_sets,
--     public.collection_set_slots, public.collections, public.collector_profile,
--     public.collection_highlights
--     from kickio_content_reader;
--   revoke usage on schema public from kickio_content_reader;
--   revoke kickio_content_reader from authenticator;
--   drop role kickio_content_reader;
--
-- ============================================================================
