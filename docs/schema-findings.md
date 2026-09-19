# Kickio schema findings (2026-09-16)

Inventory of the Kickio database (read-only) to decide which recipes are
actually supported by real data. Per the brief's build order, recipes are
finalised against real fields, not assumptions.

## Projects

| Role | Supabase project | Access |
|---|---|---|
| Kickio marketplace | `rlveellvebfzgyobceru` (eu-west-2) | **read-only, always** |
| Content engine | `dsbrvpzfniosjtaxzpxm` (eu-west-2) | engine's own state |

## Recipe viability

### Grail of the Day — VIABLE
1,630 active listings, **all** with at least one image. Rich attributes on
`listings`: `team`, `season`, `shirt_type`, `issue` (incl. "Match Issue"),
`signed`, `special_edition`, `condition`, `player_name`, `manufacturer`.
Top of the pool is strong material — 90s Man Utd/Man City, Barcelona Match
Issue, Maradona and Ronaldinho shirts, £484–£945, up to 10 photos each.

Filters: `status='active' AND deleted_at IS NULL AND stock_quantity > 0
AND jsonb_array_length(images) > 0`.

### Price Trends — VIABLE, WITH A TRAP
28,711 approved sales; 27,388 in the last 90 days; range 2026-05-19 to
2026-09-16.

**Do not compute team-level median price change.** A naive query over
`sales_history` produces headlines like "AC Milan down 42% this month"
(£118.99 -> £68.49). That is **cohort mix-shift** — a different set of
shirts sold in each window — not a price movement. Publishing it would be
a false claim.

Kickio already solved this. `price_index_aggregates` carries
`change_basis` marking each figure `like_for_like` or `pooled`:

| key | pct_change_90d | change_basis |
|---|---|---|
| `era:1990` | +8.58 | like_for_like |
| `era:2010` | +13.78 | like_for_like |
| `club:england` | -6.18 | like_for_like |
| `club:germany` | +34.51 | like_for_like |
| `condition_band:very_good` | +15.45 | like_for_like |
| `club:arsenal` | +17.69 | **pooled** — do not publish |

Rule: publish only rows where `change_basis = 'like_for_like'`, with
minimum `cohort_count` / `total_sales` thresholds. `price_index_history`
gives the daily series for the trend graphic.

### Sold This Week — VIABLE, WITH A FRAMING CONSTRAINT
Sales are overwhelmingly third-party scrapers: `cfs` 18,579, `vfs` 9,913,
`ebay` 597, `shopify` 611 — and only **8** from `kickio` itself.

Therefore these posts must be framed as **the market**, never as
"sold on Kickio". Claiming Kickio sales volume it doesn't have would be
both false and easy for a collector to catch.

Useful columns: `sold_at`, `price_cents`, `currency`, `team`, `season`,
`shirt_type`, `condition`, `item_kind` ('shirt' 28,648). Filter
`excluded_at IS NULL AND dismissed_at IS NULL AND review_state='approved'`.

### Featured Collection — VIABLE (built)
Not the collector-led post that was deferred below. The viable version is
Kickio's own curation: `collection_sets` holds named lists whose slots are
filled in by hand as a matching product appears.

- 26 sets, but only one has any slots: `kickio-grail-list`, "Kickio Grail
  List", curated, public, **136 slots**. The rest (`generated` kind, plus two
  empty curated ones) have none.
- **The slots belong to the SET, not to a user.** `collection_set_slots` has
  no `user_id`/`owner_id` column — one row per slot, shared by everyone. The
  per-user layer is `collection_set_prefs` (hidden/extra shirt types, pinned,
  season override) and `collection_set_milestones` (user_id, set_id,
  milestone, achieved_at): preferences and achievements, not a copy of the
  list. A collector's own progress is computed by intersecting `collections`
  (user_id, product_id) with the set's slots, and is not stored. So a post
  from this recipe is about Kickio's shelf, never "UserA has 63 of 136" —
  which is just as well, since `collections` holds 9 rows in total.
- **Three counts that look like one, and only one is postable:**
  - 77 slots point at a product
  - 65 of those products are catalogue-active
  - **39 have a listing you can actually buy** (37 of those with a photo the
    renderer can use)

  `products` is the **catalogue** — a shirt record exists whether or not
  anyone is selling one — and `listings` is the **shelf**. Counting catalogue
  rows and calling them "listed" puts 26 dead ends in a post whose entire
  purpose is to send people to go and look. Count from `listings`, with the
  same filter Grail of the Day uses (`status='active'`, `deleted_at` null,
  `stock_quantity > 0`, `removed_at` null, `consecutive_gone_count = 0`).
  Slot breakdown: 39 buyable + 26 catalogue-only + 59 never filled + 12
  pending/archived = 136.
- `products.has_active_listing` agreed exactly with a real count from
  `listings` here — 0 disagreements either way across all 77. Still not what
  the post quotes: `teams.listings_count` also looked fine until it was
  checked, and was out by a factor of two.
- Kickio's `products_read` policy returns **any row that is not soft-deleted,
  whatever its status**, so a naive join also hands back the 12 pending and
  archived records. Filter on `status = 'active'` explicitly.
- RLS is already open to us: `collection_sets` and `collection_set_slots` both
  carry a PUBLIC (roles NULL) SELECT policy gated on
  `visibility = 'public'`, and anon holds the table GRANT. **No new role or
  policy is needed** — unlike `sales_history`.
- The empty slots are the best material on the list: `Argentina 1986 Home`,
  `Napoli 1988/89 Home - Mars`, `Brazil 1982 Home`, `USSR 1988 Home`. A
  collector who owns one has a reason to reply.
- `featured_collections` (a different table: a user's collection promoted for
  a date range) has **0 rows**. It is the collector-led idea below, and is
  still not viable.

### Featured Set — VIABLE (built)
The other 24 public sets have **no slots at all**. They carry a `rule` and
their contents are computed:

```json
{"teams":["Juventus"],"season_from":1980,
 "shirt_types":["Home","Away","Third"],"type_season_from":{"third":2000}}
```

Size is seasons × shirt types, and expanding the rule reproduces Kickio's own
published totals exactly — Juventus Home 47, Home & Away 94, Full Collection
121 (47 + 47 + 27, Third counted only from 2000). That agreement is what
licenses the recipe to print a denominator: a post that disagrees with the page
it links to is worse than no post. Kickio writes both `team`/`teams` and
`shirt_type`/`shirt_types`, so the parser accepts either.

Depth today (active products, then those with a live listing):

| Set | On Kickio | Buyable |
|---|---|---|
| The Full Manchester United Collection | 154 | 99 |
| Man Utd Home & Away | 131 | 84 |
| Man Utd Home | 80 | 47 |
| The Full Juventus Collection | 48 | 27 |

### Collector Spotlight — BUILT, waiting on access
Kickio is **opt-out and both switches default to true**:

```
profiles.collection_public         DEFAULT true
collector_profile.featured_consent DEFAULT true
```

So most collectors are eligible from signup and the switches are an exclusion
list, not a waiting list. Both are still read on every run, and the role SQL
enforces them in the database as well.

Structure, which is easy to misread:
- `collection_sets` are **shared templates**, not per-user copies —
  `collection_set_slots` has no user column. What is per-user is *progress*.
- `collector_profile.sets_snapshot` caches that progress per user (id, name,
  slug, total, filled, percent). The engine is **not** granted it; progress is
  recomputed from `collections` so the number is derived, not trusted.
- A user with no `collector_profile` row has never been shown the switch, so
  both the app and the policy treat that as **not consent**. Today that is 6 of
  9 profiles.

**The three "collectors" today are all house or test accounts.** Verified by
reading them directly: `kickio` / "Kickio Direct" (5 shirts, 4 clubs), the
`approved_partner_seller` fixture (3 shirts), and a `+test1` account (1 shirt).
All three have both consent switches true and look exactly like a collector to
every check. Without an exclusion the first Collector Spotlight would have been
Kickio posting "look at this collector" about itself — so `HOUSE_ACCOUNTS`
reuses the two UUIDs grail-of-the-day already knows as "this is us", and
blocked accounts are filtered before the queue rather than by the `available`
flag, since queueing deliberately overrides `available`.

Excluding them, there are currently **zero real collectors**, which is the
honest pre-launch state and what Settings now says.

**Everything collector-side is own-row-only under RLS** — `collections`,
`collector_profile`, `collection_highlights`, `collection_snapshots`,
`collection_set_prefs`, `collection_set_milestones`. The engine reads **zero
rows with no error** from all of them. That is a permission problem, not a
waiting problem: it does not resolve as users sign up.
`collector-access.ts` tells blind apart from empty by reading `profiles`
(which anon *can* read) in the same run, and names the missing grant.

Never read, let alone published: `collections.paid_cents` and
`collection_snapshots.total_cents`. The role SQL uses **column-level grants**
so the engine cannot read them at all — a named collector beside a valuation is
a shopping list for a burglar.

### Collection Index — BUILT, and an audit of the valuation

Kickio values a collection from recorded sales of the same item. Verified to
the penny on one case: the shirt snapshotted at £142.99 has exactly two
approved sales, both £142.99, both from `cfs`.

**But that basis does not cover most of what people own.**

| | |
|---|---|
| Active products | 2,599 |
| …with any approved sale | 1,648 (63%) |
| …with 2+ | 872 (34%) |
| …with 3+ | 575 (22%) |
| Currently-owned shirts with any sale | **10 of 23 (43%)** |

One account holds 14 shirts and is snapshotted at **£777.95**. Only 5 have a
recorded sale; those five sum to **£534.95**. The remaining **£243 comes from
nine shirts with no sale history at all**. Checked via both
`sales_history.product_id` and via `listing_id` → `listings.product_id`;
neither closes the gap. So the stored total mixes recorded sales with
something else for shirts that have none.

**The failure this creates.** Account `a4444f77` appears to gain **64%** —
£87.00 → £142.99 on 30 August. That shirt's only recorded sales are £142.99,
in June and July, both *before* the £87 snapshot. Nothing about the shirt
changed: the valuation switched from a fallback to the sale price, and the
difference between two methods surfaced as growth. **This is live in the
Monday collection emails**, not just here.

So `collection_index` does not read `collection_snapshots` at all. It
recomputes from `collections` + `sales_history`, same method at both ends, and
only includes a shirt that had a recorded sale **on or before the window
start** — a shirt whose first sale lands mid-window is the same bug wearing a
different hat.

Valuation rule: median of sales in the last 180 days before the date; where
there are none, the last sale before it is carried forward. Medianing across a
300-day gap put half of a shirt's "today" price on a price from three seasons
ago.

`collections.acquired_at` is **NULL on every row**; `created_at` is populated
on all of them, so it is the only evidence of when a shirt entered a
collection — which is what proves a rise is revaluation and not a purchase. It
is in the role SQL grant for that reason.

### Value Pick — BUILT
Live listings priced below what that exact shirt (same size, same condition)
has sold for.

- 1,649 live listings; **178 match a recorded sale on product + size +
  condition** (11%). 66 are >20% below the last such sale. **14 survive** the
  strict filter (2+ matching sales, most recent within 180 days).
- `sales_history` carries both `size` and `condition`, populated on ~98% of the
  6,948 rows whose product resolves. Vocabulary lines up with `listings`
  (L/M/XL/S/XXL/XS dominate both).
- `listings.size` also holds `Default Title`, `M, L`, `Medium`, `Not specified`
  and `N/A`, so the match uses a size **allowlist** — a near-match is a
  different shirt, and the whole claim rests on the two being identical.

Three things the audit changed:

1. **The last sale is not the price.** A 1990-91 England XL sits 41% below its
   last sale of £325.99 — the only other recorded sale was **£190.99**. The
   comparison is the **median**, and a spread wider than the discount refuses
   the post: if it trades between £191 and £326, "38% below" is a fact about
   which sale you stood next to.
2. **"A one-off" is usually false.** The 1988-90 Netherlands L in Very Good has
   **two live listings at the same price**; that product has five across
   variants. Scarcity is graded from live listings across *all* sellers —
   only-on-Kickio, only-this-variant, or no claim at all.
3. **Compare what a buyer pays.** The listing price excludes buyer protection;
   comparing it to a sale price overstates every discount by ~4%, systematically
   and in our favour.

The data supports *what* the gap is, never *why* the seller priced it there.
The brief forbids guessing motive, and a shirt can be cheap for a reason no
column records — which is what the approval step is for.

### Featured Collector — NOT VIABLE YET
The marketplace is pre-launch:

- 9 rows in `collections` (9 items across all users)
- 3 collectors with `collector_profile.featured_consent = true`
- 3 distinct sellers across all active listings
- 17 orders

There is nobody to feature. Revisit once real collectors are onboarded.
Note `featured_consent` exists — when this recipe is built, it must be
honoured: never feature a collector who hasn't opted in.

## Data-quality notes

- Some `products.season` values do not start with a four-digit year, so
  `substring(season from 1 for 4)::int` throws. Parse with the tolerant
  `seasonYear()` helper, which returns null rather than guessing.
- `sales_history.product_id` is only populated on 7,967 of 29,779 rows, but
  `listing_id` is populated on 29,775. Join through `listing_id` for
  like-for-like work.
- 136 products have >= 8 approved sales in 90d — a usable like-for-like pool.
- Prices cluster on repeated points (£75.99, £85.99, £98.99), consistent
  with scraped asking prices. Treat single-source medians with care.
- `listings.status` breakdown: active 1,630 / pending 15,650 / removed
  34,089 / sold 9. Only `active` is publishable.

### Reading Kickio through PostgREST — two transport limits

Found by asking why Value Pick's first run said "Nothing to post". It had not
found nothing; it had failed, and the failure was dressed up as an empty
result. Both limits below are transport facts, not data facts, and both matter
to any recipe that scans the marketplace rather than one collection.

**The row cap is not the limit you asked for.** PostgREST caps a response at
`db-max-rows`, which is 1,000 on Kickio. `.limit(5000)` does not raise it. The
edge log for the run shows the listings read returning `content-range: 0-999/*`
with HTTP 200 and no error, against 1,649 live listings — 39% of the
marketplace invisible, silently.

That is not just a short count. Scarcity is counted from the live listings, so
against a truncated set:

| | |
|---|---|
| Live listings | 1,649 |
| Seen under the cap | 1,000 |
| Products undercounted | 585 |
| **Products that would be called "the only one" while another live listing existed** | **100** |
| Products entirely invisible | 458 |

A wrong number would have been safer. This was a false statement with a
citation attached.

**`.in()` becomes a URL, and URLs run out.** The filter list is sent in the
query string. 1,171 product ids came to 29,276 characters and the gateway
answered 400 Bad Request. A 19,510-character request is known to pass, so the
chunk size is set to 200 ids (~8KB) — a deliberate margin, since the ceiling
belongs to a gateway we do not control.

Both are handled in `src/lib/kickio/page.ts` (`pageAll`, `pageIn`). It throws
rather than returning a reason, because `runRecipe` records a thrown error as
`failed` and a returned `{ ok: false }` as `skipped` — which is shown to a
human as "Nothing to post". A broken read and a quiet day must not arrive at
the same place.

Other `.in()` call sites are bounded by their subject and are not at risk
today: 136 slots per collection set, 14 items in the largest collection, 240
products for the largest team. Value Pick is the only recipe that scans the
whole marketplace.

Once fixed, 1,426 candidate listings carry a usable size and condition, 176
have a matching recorded sale, 55 have two or more, 10 sit 20% or more below
the median, and **9 survive the spread guard**. Top pick: 2008-09 Portugal Away
Ronaldo #7, XL, Very Good — £75.27 against a £164.49 median of two sales
(£161.99 / £166.99), 54% below, 3% spread, the only live listing of that
product.

### Value Pick is blocked by the same wall as Sold This Week

After the transport fixes above, the run reported:

> No live listing is far enough below what that exact shirt sells for
> `{ considered: 1426, rejected: [] }`

`rejected: []` is the tell. A listing only lands in `rejected` once it has
cleared the discount threshold, so an empty list with 1,426 candidates means no
listing was ever compared to anything. Confirmed directly against Kickio:

```sql
set local role anon;
select count(*) from sales_history;  -->  0
select count(*) from listings;       -->  1661
select count(*) from products;       -->  3581
```

`sales_history` has an INSERT policy for `authenticated` and **no SELECT policy
at all**. Under RLS the `anon` key reads zero rows and receives HTTP 200 with an
empty array — no error, nothing logged.

This was already known: `docs/unblocking-sold-this-week.md` documents it, and
`sold_this_week` is disabled for it. Value Pick was built on the same table
anyway. The audit behind it — "178 listings match, 66 are 20% below, 14
survive" — was run through an admin connection that bypasses RLS, so every one
of those 14 was a row the engine itself could never read. The number was right
about the marketplace and wrong about the engine, which is the same mistake as
trusting a stored aggregate, one layer down.

Value Pick now calls `salesAccess()` before any comparison and reports the
permissions fault instead of a claim about the market. It stays blocked until
the credential changes; no code will unblock it.

Recipes that read `sales_history`, and how each stands:

| Recipe | State |
|---|---|
| `sold_this_week` | Disabled for this reason |
| `grail_sale` | Designed around it — the admin types the price |
| `price_trends` | Knows it, and labels its montage as examples rather than comparables |
| `collection_index` | Same silent false negative as Value Pick, not yet guarded |
| `value_pick` | Guarded as of this change |
