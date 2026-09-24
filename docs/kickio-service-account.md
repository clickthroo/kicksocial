# Giving the engine a credential that still works

**Status: proposal. Nothing here has been run.** It changes Kickio's auth, so it
needs sign-off from whoever owns that database before any of it happens.

## Why the previous plan is dead

`docs/kickio-read-only-role.sql` created the `kickio_content_reader` role on
2026-09-19 and it works: as that role the database returns 28,858 approved
sales, refuses every write, and refuses `paid_cents`. That part is done and
still in place.

What failed was getting the engine to *connect* as it. The plan was a
hand-minted HS256 JWT carrying `role: kickio_content_reader`. Kickio moved to
asymmetric JWT signing (ECC P-256) on 2026-09-16, and PostgREST now verifies
against that key only:

```
$ curl -H "apikey: <token>" .../rest/v1/sales_history?select=id&limit=1
{"message":"Invalid API key", ...}

$ curl -H "apikey: <publishable>" -H "Authorization: Bearer <token>" ...
{"code":"PGRST301","details":"None of the keys was able to decode the JWT",
 "message":"No suitable key or wrong key type"}
```

The second is the verdict. The gateway accepted the publishable key, PostgREST
received the token, and none of its keys could decode it - *"wrong key type"* is
an EC keyset being handed an HMAC token. The Legacy HS256 secret is listed
under "Previously used keys" in the dashboard, but that applies to Supabase Auth
sessions, not to REST verification.

So: HS256 is not accepted, and ES256 needs a private key Supabase never
releases. **Nothing the engine can sign itself will ever be accepted.** The only
tokens that work are ones Supabase issues.

## The idea

Give the engine a Supabase Auth account, and use a **Custom Access Token hook**
to set `role: kickio_content_reader` on the tokens issued to that one account.

Supabase signs it with the current key, so there is no legacy dependency and
nothing to re-mint. PostgREST reads the role claim and switches into the role we
already built, so every guarantee from 2026-09-19 stays enforced by the
database:

| | Enforced by |
|---|---|
| Cannot write to Kickio | No INSERT/UPDATE/DELETE grants on the role |
| Cannot read `collections.paid_cents` | Column never granted |
| Cannot read `collection_snapshots` | Table never granted |
| Cannot see opted-out collectors | Row policies on the role |
| Cannot see unapproved sales | Row policy on the role |

## Why not a plain service account

Because `authenticated` is not a restricted role on Kickio. Supabase's default
grants are in place, and it holds **SELECT, INSERT, UPDATE, DELETE, TRUNCATE**
on `sales_history`, `collections`, `collector_profile` and
`collection_snapshots`. RLS is the only thing holding it back.

An engine authenticating as plain `authenticated` would therefore:

- **be able to read `paid_cents`**, because the grant is table-level. Today that
  is structurally impossible; it would become a matter of the application not
  asking.
- **be able to write its own rows.** `collections_owner` is `FOR ALL TO public
  USING (user_id = auth.uid())`, and with the grants above that is a real write
  path into the live marketplace. Same for `collector_profile_owner_insert` and
  `collection_highlights_owner_all`.

It could not touch anyone else's data, and could not insert sales
(`sales_history_insert_admin` requires `has_role(uid,'admin')`, and a new
account gets `'user'`). But "the engine is structurally incapable of writing to
Kickio" would stop being true, and that sentence is the whole point of
`CLAUDE.md` and of the three layers in `src/lib/kickio/client.ts`.

The hook is what keeps the strong version.

## The cost, stated plainly

**The hook runs on every token Kickio issues, for every user.** That is the
blast radius, and it is larger than anything else proposed in this project. A
function that throws would stop logins working.

Three things make that survivable, and they are load-bearing rather than
decorative:

1. **It returns early for everyone else.** The first statement compares the
   user id to one constant. Every other user's claims are returned untouched,
   by the same object that came in.
2. **It cannot throw.** The body is wrapped so that any error returns the
   original event unchanged. A bug degrades to "the engine does not get its
   role" - which the engine already reports honestly - rather than "nobody can
   log in".
3. **It is one statement to disable**, from the dashboard, without a deploy.

If that is still not an acceptable place to put code, say so: the alternative
is an aggregated view readable with the publishable key, which needs no auth at
all. It publishes per-variant sale summaries to anyone holding the browser key,
which is a different trade, not a free one.

## Creating the account is not inert

Kickio has a signup trigger, `on_auth_user_created` -> `public.handle_new_user`.
Creating this account will also insert:

- a row in `public.profiles` - **publicly readable**, so the account is visible
  on the marketplace like any user
- a row in `public.wallets`
- a row in `public.user_roles` with role `'user'`

Three consequences:

1. **It must be excluded from the collector recipes.** `profiles` is what
   `loadCollectors()` reads, and `collection_public` defaults to true. Without
   this, the engine becomes a candidate to post about itself - exactly the bug
   caught on 2026-09-19 when all three "collectors" turned out to be house
   accounts. Its id goes in `HOUSE_ACCOUNTS` in
   `src/lib/recipes/collector-access.ts` in the same change, not afterwards.
2. **Give it an obviously non-human name**, because the profile is public.
   Something like `kickio-content-engine`, not a person's name.
3. `'user'`, not `'admin'`, is what keeps it out of
   `sales_history_insert_admin`. Verify it, do not assume it.

## Steps

1. **Create the account** in Supabase Dashboard -> Authentication -> Users ->
   Add user. Use an address you control, a generated password, and confirm the
   email. Note the uid.
2. **Set `collection_public = false`** on its `profiles` row, so the belt as
   well as the braces excludes it from collector recipes.
3. **Install the hook**: run `docs/kickio-service-account.sql` with the uid
   filled in, then enable it in Dashboard -> Authentication -> Hooks ->
   Customize Access Token, pointing at `public.custom_access_token_hook`.
4. **Verify** (below) before any application change.
5. **Change the engine**: `client.ts` signs in with
   `KICKIO_ENGINE_EMAIL`/`KICKIO_ENGINE_PASSWORD` and uses the issued token.
   The role allowlist moves from inspecting a static key to inspecting the
   issued token's claim - same check, same allowlist, later in the process.
   Add the uid to `HOUSE_ACCOUNTS` in the same commit.
6. **Set the two env vars** on the content engine only, and redeploy.

## Verification

Run every one of these. The last is the one people skip.

```sql
-- As the service account's uid, it must not be an admin:
select role from public.user_roles where user_id = '<uid>';
-- expect: user
```

Sign in as the account and decode the returned access token:

```
role  -> kickio_content_reader      not "authenticated"
sub   -> <uid>
```

Then, with that token as `Authorization: Bearer` and the publishable key as
`apikey`:

| Request | Expected |
|---|---|
| `GET /sales_history?select=id&limit=1` | one row |
| `GET /collections?select=paid_cents&limit=1` | permission denied |
| `GET /collection_snapshots?select=total_cents&limit=1` | permission denied |
| `POST /sales_history` with a row body | permission denied |
| `PATCH /collections?id=eq.<any>` | permission denied |

**And the one that matters most:** log in as an ordinary marketplace user and
decode that token. `role` must still be `authenticated`. If the hook has
touched anyone but the service account, stop and disable it.

## Rollback

- **Disable the hook** in Dashboard -> Authentication -> Hooks. Immediate, no
  deploy. The engine loses its role and reports itself blocked, as it does now.
- **Drop the hook function** - the SQL file has the statement.
- **Delete the account** in Authentication -> Users, which leaves the
  `profiles`, `wallets` and `user_roles` rows to be cleaned up by hand.
- The `kickio_content_reader` role and its policies are independent of all of
  this; `kickio-read-only-role.sql` has its own rollback.

## Residual risk

- **The password is a credential.** It yields read access at
  `kickio_content_reader` level and nothing more - no writes, no `paid_cents` -
  but it is a real login. Server-side env var only, never `NEXT_PUBLIC_`.
- **The account is a visible profile** on the marketplace.
- **The hook is in the login path.** Covered above. It is the reason this
  document exists rather than a commit.
- **Sessions expire hourly.** The engine signs in per process rather than
  storing a refresh token, so a leaked access token is short-lived. The
  password is the thing to protect.
