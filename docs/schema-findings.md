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
- **77 slots point at a product. Only 63 are postable.** 12 point at a shirt
  whose `status` is `pending` or `archived`; 2 more have only a WebP photo,
  which Satori cannot render. 59 slots have no product at all.
  63 listed + 59 unfilled + 14 unpostable = 136.
- The overcount is easy to make, because Kickio's `products_read` policy
  returns **any row that is not soft-deleted, whatever its status**. A naive
  join hands back all 77 and the post invites readers to buy twelve shirts
  that are not for sale. Filter on `status = 'active'` explicitly.
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
