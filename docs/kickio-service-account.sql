-- ============================================================================
-- Custom Access Token hook: the content engine's credential
-- ============================================================================
--
-- REVIEW BEFORE RUNNING. This has not been executed against Kickio. Read
-- docs/kickio-service-account.md first - it explains why this exists, what
-- creating the account also creates, and what the blast radius is.
--
-- WHAT THIS DOES
--   Sets `role: kickio_content_reader` on the access tokens Supabase issues to
--   ONE account: the content engine's. Supabase signs those tokens with the
--   current ECC key, so PostgREST accepts them, and the role claim makes it
--   switch into the read-only role created by kickio-read-only-role.sql.
--
-- WHAT THIS DOES NOT DO
--   * It does not modify, delete or migrate a single row. No data changes.
--   * It does not grant anything. The role's grants already exist and are
--     unchanged - this only decides which role a token names.
--   * It does not widen what any other user can do. Every other token is
--     returned exactly as it arrived, by identity.
--
-- THE THING TO BE CAREFUL ABOUT
--   This function runs on EVERY token Kickio issues, for every user. A
--   function that throws here stops logins working. Two properties below are
--   therefore load-bearing, not stylistic:
--
--     1. the early return, so other users' claims are never even touched
--     2. the exception handler, so a bug degrades to "the engine does not get
--        its role" instead of "nobody can log in"
--
--   Do not remove either while "tidying". The engine already reports itself
--   blocked, loudly and in plain English, when it lacks the role - that is a
--   far better failure than an auth outage.
--
-- ROLLBACK is at the bottom. Disabling the hook in the dashboard is faster and
-- needs no deploy.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Fill this in
-- ---------------------------------------------------------------------------
-- The uid of the account created in Dashboard -> Authentication -> Users.
-- Until it is a real uid this hook is a no-op for everybody, which is the
-- correct thing for it to be while half-installed.
--
--   ENGINE_UID = '00000000-0000-0000-0000-000000000000'
--
-- Replace it in the function body below. It is a constant rather than a lookup
-- against a table on purpose: a table read here would put this function's
-- correctness at the mercy of another table's contents, on the login path.


-- ---------------------------------------------------------------------------
-- 2. The hook
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- REPLACE with the service account's uid before enabling the hook.
  engine_uid constant uuid := '00000000-0000-0000-0000-000000000000';
  claims jsonb;
begin
  -- Everyone who is not the engine leaves with exactly what they arrived with.
  -- This is the first statement for a reason.
  if coalesce((event->>'user_id')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
     is distinct from engine_uid then
    return event;
  end if;

  claims := coalesce(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{role}', to_jsonb('kickio_content_reader'::text));
  return jsonb_set(event, '{claims}', claims);

exception
  -- Never break token issuance. If anything here goes wrong the engine simply
  -- does not get its role, notices, and says so on its own run log.
  when others then
    return event;
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Sets role=kickio_content_reader on tokens for the content engine account only. '
  'Every other token is returned unchanged. See docs/kickio-service-account.md.';


-- ---------------------------------------------------------------------------
-- 3. Who may run it
-- ---------------------------------------------------------------------------
-- Only Supabase Auth calls this. Nobody else should be able to, and in
-- particular an ordinary user must not be able to invoke it directly.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;


-- ---------------------------------------------------------------------------
-- 4. Enable it
-- ---------------------------------------------------------------------------
-- Dashboard -> Authentication -> Hooks -> Customize Access Token (Beta)
--   -> Postgres function -> public.custom_access_token_hook
--
-- Not a SQL step. It is also the off switch.


-- ============================================================================
-- VERIFICATION - run after the above, expect the commented results
--
-- The function body below was run against the CONTENT ENGINE's own database on
-- 2026-09-24 with a stand-in uid, and every case behaved as documented. That
-- proves the logic, not the wiring - the hook's behaviour once Supabase Auth is
-- calling it still has to be checked here, on Kickio.
--
--   engine uid, role set ........................ kickio_content_reader
--   engine uid, other claims preserved .......... sub survived untouched
--   different uid ............................... authenticated  (unchanged)
--   '{}' ........................................ {}              (unchanged)
--   '{"user_id":"not-a-uuid"}' .................. returned as-is, NO error
--   user_id null ................................ authenticated  (unchanged)
-- ============================================================================
--
--   -- The account must NOT be an admin, or sales_history_insert_admin would
--   -- let it write sales. A new account gets 'user'; confirm rather than assume.
--   select role from public.user_roles where user_id = '<uid>';
--   -- expect: user
--
--   -- The hook is a no-op for anyone else. Two calls, same shape, and the
--   -- second must come back exactly as it went in:
--   select public.custom_access_token_hook(
--     jsonb_build_object('user_id', '<uid>', 'claims', '{"role":"authenticated"}'::jsonb)
--   ) -> 'claims' ->> 'role';
--   -- expect: kickio_content_reader
--
--   select public.custom_access_token_hook(
--     jsonb_build_object('user_id', gen_random_uuid(), 'claims', '{"role":"authenticated"}'::jsonb)
--   ) -> 'claims' ->> 'role';
--   -- expect: authenticated
--
--   -- Malformed input must not raise - this is the login path:
--   select public.custom_access_token_hook('{}'::jsonb);
--   select public.custom_access_token_hook('{"user_id":"not-a-uuid"}'::jsonb);
--   -- expect: the input back, no error
--
-- Then sign in as the account and decode the access token: role must read
-- kickio_content_reader. With it as `Authorization: Bearer` and the publishable
-- key as `apikey`:
--
--   GET  /rest/v1/sales_history?select=id&limit=1        -> one row
--   GET  /rest/v1/collections?select=paid_cents&limit=1  -> permission denied
--   GET  /rest/v1/collection_snapshots?select=total_cents -> permission denied
--   POST /rest/v1/sales_history (any body)               -> permission denied
--
-- FINALLY, and this is the one people skip: log in as an ordinary marketplace
-- user and decode THAT token. `role` must still be `authenticated`. If the hook
-- has touched anybody but the service account, disable it and stop.
--
-- ============================================================================


-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
--   -- Fastest: disable the hook in Dashboard -> Authentication -> Hooks.
--   -- No deploy, immediate, and the engine goes back to reporting itself
--   -- blocked - which is a state it already handles honestly.
--
--   -- Then, to remove it entirely:
--   revoke execute on function public.custom_access_token_hook(jsonb) from supabase_auth_admin;
--   drop function if exists public.custom_access_token_hook(jsonb);
--
--   -- The account itself: Dashboard -> Authentication -> Users -> delete.
--   -- That leaves rows behind, because handle_new_user created them:
--   --   delete from public.user_roles where user_id = '<uid>';
--   --   delete from public.wallets    where user_id = '<uid>';
--   --   delete from public.profiles   where id      = '<uid>';
--
--   -- kickio_content_reader is independent of all of this and has its own
--   -- rollback in docs/kickio-read-only-role.sql.
--
-- ============================================================================
