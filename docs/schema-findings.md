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

- `sales_history.product_id` is only populated on 7,967 of 29,779 rows, but
  `listing_id` is populated on 29,775. Join through `listing_id` for
  like-for-like work.
- 136 products have >= 8 approved sales in 90d — a usable like-for-like pool.
- Prices cluster on repeated points (£75.99, £85.99, £98.99), consistent
  with scraped asking prices. Treat single-source medians with care.
- `listings.status` breakdown: active 1,630 / pending 15,650 / removed
  34,089 / sold 9. Only `active` is publishable.
