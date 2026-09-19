# Unblocking Sold This Week

The `sold_this_week` recipe is built and tested but cannot run: Kickio's
`sales_history` has an INSERT policy and no SELECT policy, so the public key
reads zero rows. The same wall blocks `value_pick` and `collection_index`.

No code change is needed to fix this. The engine needs a credential for a role
that can read the table.

## Status

- [x] **The role exists.** `docs/kickio-read-only-role.sql` was applied to
      Kickio on 2026-09-19 with the owner's explicit consent. As
      `kickio_content_reader` the database returns 28,858 approved sales, 23
      collection rows and 4 consenting collectors; every write and every
      ungranted column is refused. Results are recorded in the SQL file, and
      `anon` still reads zero sales, so nothing was published.
- [ ] **The engine still connects as `anon`.** Until
      `KICKIO_SUPABASE_PUBLISHABLE_KEY` holds a JWT carrying the
      `kickio_content_reader` role claim, every recipe above stays blocked and
      will say so. See "Connecting as the role" below — it needs Kickio's JWT
      secret from the Supabase dashboard, so it is a hands-on step.

## The approach

`docs/kickio-read-only-role.sql` creates a dedicated `kickio_content_reader`
role.

The important property: the policy is scoped `TO kickio_content_reader`, not
`TO anon`. That distinction is the whole point.

| | Scoped role (this proposal) | `anon` SELECT policy (rejected) |
|---|---|---|
| Who can read the data | The engine's server-side credential | Anyone who views the marketplace's page source |
| Data modified | None | None |
| Can write to Kickio | No — no write grants | No |
| Reversible | Yes, 3 statements | Yes |

`anon` is the key Kickio's own frontend ships to every visitor's browser. A
policy scoped to it would publish ~28,700 rows of aggregated market pricing —
data normalised from CFS, VFS, eBay and Shopify — to anyone who wants it.

Worth noting the current state looks deliberate rather than accidental: `anon`
can already read `listings`, `products`, `teams` and the derived
`price_index_aggregates`, but **not** raw `sales_history`. Publishing the index
while keeping the underlying comparables private is a coherent position, and
worth confirming with whoever set it up before changing it.

## The role is used for every query, not just sales

Once `KICKIO_SUPABASE_PUBLISHABLE_KEY` holds the role's token, the engine
authenticates as `kickio_content_reader` for **all** of its Kickio reads. So the
grant list has to cover everything in `KickioTable`, not just `sales_history`.

Two of those are easy to overlook, and they fail differently:

| Table | Used for | If the grant is missing |
|---|---|---|
| `profiles` | Seller checkboxes in Settings | `listSellers()` throws — visible error banner |
| `marketplace_settings` | Buyer protection fee → the price in every post | **Silent.** `buyerFeeSettings()` falls back to hardcoded defaults on error, so posts keep working and keep matching the site — until Kickio changes the fee, at which point every price is quietly wrong |

The second is the dangerous one, and it is the same failure shape as the bugs
this project keeps hitting: nothing errors, the output looks plausible, and the
number is wrong. Run the verification block.

## Connecting as the role

The role is `NOLOGIN` — the engine never logs in directly, so there is no
database password to manage. PostgREST switches into the role for the duration
of a request, based on the `role` claim in the JWT.

1. Mint a JWT signed with Kickio's JWT secret (Supabase dashboard → Settings →
   API → JWT Settings):

   ```json
   { "role": "kickio_content_reader", "iss": "supabase", "exp": <far future> }
   ```

2. Set it as `KICKIO_SUPABASE_PUBLISHABLE_KEY` on the content engine only.

The client already accepts it — `kickio_content_reader` is on the allowlist in
`src/lib/kickio/client.ts`. Nothing else changes, and the read-only guarantee
still holds in all three layers, now with Postgres grants as a fourth.

## Residual risk, stated plainly

This is smaller than public exposure, not zero:

- **The JWT is a secret.** Treat it like the service key — server-side env var
  only, never in client code. If it leaks, the holder can read approved sales
  data. They still cannot write anything.
- **A long-lived JWT cannot be revoked individually.** Rotating it means
  rotating Kickio's JWT secret, which invalidates every token including live
  user sessions. If that matters, set a shorter `exp` and re-mint on a schedule,
  or drop the role to cut access instantly (`drop policy` + `drop role` — the
  rollback block in the SQL file).
- **Row scope is enforced, not conventional.** The policy's `USING` clause
  restricts the role to `review_state = 'approved'` with no exclusions, so the
  engine cannot read rows still under review or ones an admin rejected as bad
  data. That is a correctness guarantee as well as a privacy one: a post can't
  be built on a figure your team already threw out.

## Verifying it worked

The SQL file has a verification block. The part worth running regardless:

```sql
set role kickio_content_reader;
insert into sales_history (sold_at, price_cents, currency, source)
  values (now(), 1, 'GBP', 'test');
-- expect: ERROR permission denied for table sales_history
reset role;
```

If that insert succeeds, roll back immediately — the role is not read-only.
