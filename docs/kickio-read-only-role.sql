-- ============================================================================
-- Read-only role for the Kickio Content Engine
-- ============================================================================
--
-- REVIEW BEFORE RUNNING. This has not been executed against Kickio. It is a
-- proposal for a human to read, adjust and run.
--
-- WHAT THIS DOES
--   Creates a database role the content engine uses to read market sales data,
--   so the `sold_this_week` recipe can run.
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
-- ROLLBACK is at the bottom: three statements, no data implications.
-- ============================================================================


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

-- Deliberately NOT `grant select on all tables`. Only what the three recipes
-- read. Anything added to Kickio later is invisible to this role by default.
grant select on
  public.sales_history,
  public.listings,
  public.products,
  public.teams,
  public.price_index_aggregates,
  public.price_index_history
to kickio_content_reader;


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

-- listings / products / teams need no new policy: their existing read policies
-- are scoped `TO public`, which in Postgres means every role, including this one.


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
--   -- Should fail - the role has no access to tables it was not granted:
--   select count(*) from profiles;
--
--   reset role;
--
-- ============================================================================


-- ============================================================================
-- ROLLBACK - removes everything above. No data implications.
-- ============================================================================
--
--   drop policy if exists sales_history_content_engine_read on public.sales_history;
--   drop policy if exists price_index_aggregates_content_engine_read on public.price_index_aggregates;
--   drop policy if exists price_index_history_content_engine_read on public.price_index_history;
--   revoke all on public.sales_history, public.listings, public.products,
--     public.teams, public.price_index_aggregates, public.price_index_history
--     from kickio_content_reader;
--   revoke usage on schema public from kickio_content_reader;
--   revoke kickio_content_reader from authenticator;
--   drop role kickio_content_reader;
--
-- ============================================================================
