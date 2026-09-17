# Kickio Content Engine

Generates publish-ready social posts for X, Instagram and TikTok from Kickio's
marketplace data, and queues them for one-tap approval.

## The rule that shapes the architecture

**Kickio's database is read-only from this project.** Enforced in three layers:

1. **Credential** — `src/lib/kickio/client.ts` allowlists the roles it will
   connect as (`anon`, `kickio_content_reader`) and refuses everything else, so
   a privileged key cannot be dropped into the env and quietly gain writes.
2. **Surface** — the Kickio client exposes `select` and nothing else. There is no
   `insert`/`update`/`delete` to reach for.
3. **Database** — Kickio's own RLS grants the anon role SELECT on public data and
   no write policy, so a write is refused server-side regardless.

The engine's own state lives in a **separate Supabase project**, so it never
holds write credentials to the marketplace. `src/lib/engine/client.ts` refuses to
start if the two URLs match.

## Architecture

```
Kickio Supabase (read-only)          Engine Supabase (own project)
  listings                             recipes        - config per post type
  price_index_aggregates               post_drafts    - the approval queue
  price_index_history                  publish_log    - what went out
  teams                                recipe_runs    - why a day produced nothing
        │                                    ▲
        └──► recipe selects + verifies ──► Claude writes copy ──► draft
                                                                    │
                                                    Next.js PWA approval queue
```

Recipes run on a Vercel cron (`vercel.json`), or on demand via
`POST /api/run/<recipe_key>`.

**Settings** (`/admin`) edits each recipe's configuration — enabled, which
sellers may be featured, price floor, cooldown, stock-check window, and the copy
brief — without a redeploy.

## Recipes

| Recipe | Cadence | Status |
|---|---|---|
| `grail_of_the_day` | Daily | Working — 378 eligible listings |
| `price_trends` | Weekly (Tue) | Working — like-for-like figures only |
| `sold_this_week` | Weekly (Fri) | **Blocked** — see `docs/unblocking-sold-this-week.md` |

Selection logic is code (each recipe queries a different shape of data and
carries its own integrity rules). Thresholds, cadence, platforms and the copy
brief are rows in the `recipes` table, editable without a redeploy.

### What counts as a live listing

`listings.status = 'active'` is **not** sufficient on its own. A listing can be
active while:

- `removed_at` is set — including `removed_reason = 'sold_detected'`, meaning it
  already sold somewhere else
- its linked product is still in Kickio's review queue (`products.status` is
  `pending`, `rejected` or `archived` — 905 products are currently in one of
  those states)
- its product is soft-deleted
- the stock checker has stopped finding it (`consecutive_gone_count > 0`)
- it is reserved for a buyer mid-checkout
- **its seller's listings do not appear on kickio.com at all** — see below

Grail of the Day excludes all of these, both in the query and again in
`isLive()` after fetching, so editing the query cannot silently drop a rule.
That takes the pool from 409 to 157.

### Whether a listing is live on kickio.com is a property of the SELLER

No column on a listing or product records it. What decides it is who is selling:

| Seller | Active listings | On kickio.com |
|---|---|---|
| `kickio` ("Kickio Direct") | 722 | yes |
| `approved_partner_seller` | 785 | yes |
| `classic_football_shirts` | 140 | no |

So the recipe carries an explicit `allowedSellerIds`, editable in **Settings**.

**`last_stock_checked_at` is a scraper timestamp, not a liveness signal.** It
only exists for listings pulled from an external site. Kickio Direct stock has
no external source, so it is null for all 722 of those listings. Requiring it
unconditionally excluded every Kickio Direct listing and left only scraped
inventory — which is how eBay items ended up in the drafts. It is now applied
only where `source = 'scrape'`.

Note also that `is_partner_listing = false` does **not** mean "a Kickio seller's
own stock" — most non-partner listings are still scraped, with `source_url`
pointing at eBay.

So each draft carries two distinct references, labelled apart in the dashboard
so a reviewer is never misled about which they are opening:

- `kickio_url` — the listing's page on Kickio, built from `products.slug` as
  `https://kickio.com/marketplace/{slug}`. Override with `KICKIO_SITE_URL` /
  `KICKIO_PRODUCT_PATH` only if the site moves.
- `origin_url` — where Kickio scraped it from, shown as "Source: scrape ↗"

Sold This Week applies the equivalent rule to sales: `review_state = 'approved'`
with no `excluded_at` or `dismissed_at`, so figures never come from rows Kickio's
own team rejected.

### Attribute signals are allowlists, and fail closed

Rarity signals (match issue, special edition, boxed, condition) are read from an
**allowlist of recognised values**, verified against every distinct value in
`listings`.

They were originally written as negations — "special unless it reads
no/none/standard". Kickio writes **"Not A Special Edition"** and **"Not A Boxed
Edition"**, neither of which matched, so 1,335 and 1,310 listings were flagged
as rare and a draft went out claiming a shirt was "still boxed" when its listing
said otherwise. Negation fails open: an unexpected value becomes a confident
false claim.

An unrecognised value now claims nothing and is recorded in
`unknown_attribute_values` on the draft, so new vocabulary shows up in review
rather than in a post. The real values are asserted directly in
`grail-of-the-day.test.ts`, so a vocabulary change breaks a test.

Note the same distinction in labelling: `player_name` is a **printed name**, not
a player-issue shirt (that is `issue = 'Authentic/Player Version'`). They were
conflated, which put the wrong word in the copy.

### How repeats are prevented

Deduplication is keyed on the **product**, not the listing: 52 products in the
candidate pool carry more than one listing, so a listing-level key lets the same
shirt return the next day under a different id.

Three windows, configurable in Settings:

| Rule | Default | Strength |
|---|---|---|
| Same shirt (product) | 365 days | **Hard** — removed from the pool |
| Same kit (team + season + type) | 120 days | Soft — deprioritised |
| Same club | 14 days | Soft — deprioritised |

365 days is not arbitrary: 354 distinct products at one post a day is roughly a
year of material, so there is no reason to repeat inside one.

The kit window exists because 29 team/season/type combinations span several
distinct products — Chelsea 2020-21 Home has four — which read as the same shirt
to a follower even though the database disagrees.

Soft rules **reorder** rather than remove, so a thin day still produces a post
rather than nothing.

**A rejected shirt never returns.** Rejecting means "not this one"; releasing the
subject, as an earlier version did, hands the same shirt back on the next run
since it is still the highest-scoring candidate, and the reviewer would have to
reject it every day. Price Trends and Sold This Week cover subjects that recur by
nature (a club's trend, a given week), so there a rejection serves the normal
cooldown rather than blocking permanently.

### Placeholders are not facts

Several Kickio columns carry stand-ins for "we don't know" rather than being
null: `player_name` is literally **"Unknown"** on 7 active listings and empty on
27, `manufacturer` is **"Other"** on 12, `size` is **"N/A"** on one. Passed
through, these become copy — one card carried a badge reading "Unknown
printing".

`src/lib/kickio/values.ts` strips them before any fact reaches the prompt or the
card, so the post simply says less. The brand voice also forbids narrating a gap
("manufacturer unclear", "season unconfirmed") — absent facts were removed
deliberately and are not a subject to comment on.

### Posted prices are buyer-facing, not asking prices

`listings.price_cents` is what the seller asks. kickio.com adds a **buyer
protection fee** on top — 4% + £0.40, rounded up to the next amount ending in
.50 or .99 — so a £332.99 listing displays as **£346.99**. Quoting the asking
price understates what a reader sees on arrival.

The fee parameters are read at run time from Kickio's `marketplace_settings`,
so a change on their side flows through rather than silently making every post
wrong. `src/lib/kickio/pricing.ts` owns the calculation and is tested against
the real observed figure.

Two related rules:

- **Cheapest listing per product.** A product can carry several listings and the
  page headlines the lowest ("lowest asking price"). Featuring a dearer one
  contradicts the page, so candidates are deduplicated to the cheapest.
- **Pence are not rounded away.** £945 loses its decimals, £346.99 keeps them —
  rounding it to "£347" overstates the price against the page.

### Why posts get suppressed

Both published recipes discard data they could otherwise use:

- **Price Trends** publishes only figures Kickio marks `change_basis =
  'like_for_like'`. A naive team-median comparison yields headlines like "AC
  Milan down 42%", which is cohort mix-shift — a different mix of shirts sold in
  each window — not a price movement. This correctly rejects the attractive
  `club:arsenal +17.69%` figure, which is `pooled`.
- **Sold This Week** is framed as market-wide, never "sold on Kickio": only 8 of
  29,779 sales rows originate from Kickio itself.

A wrong number costs more credibility with collectors than a missed post costs
in reach. Every draft carries its `claims` — each number paired with the value
and column it came from — so a reviewer can check before approving.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev
```

| Variable | Notes |
|---|---|
| `KICKIO_SUPABASE_URL` | Kickio project |
| `KICKIO_SUPABASE_PUBLISHABLE_KEY` | **Publishable key only** — service-role is rejected |
| `ENGINE_SUPABASE_URL` | The engine's own project |
| `ENGINE_SUPABASE_SERVICE_KEY` | Service key for the engine project |
| `ANTHROPIC_API_KEY` | Copy generation |
| `CRON_SECRET` | Vercel sends it as `Authorization: Bearer …` |

```bash
npm run typecheck
npm test
npm run build
```

## Visual templates

Rendered to PNG by Satori (`next/og`), so they run on Vercel with no headless
browser. Two sizes: `ig` (1080×1350, 4:5) and `x` (1200×675, 16:9).

| Template | Visual |
|---|---|
| `grail_card` | The seller's own photo, full bleed, type over a scrim |
| `trend_chart` | Hero number + supporting sparkline |
| `roundup_card` | Ranked list of sales |

Iterate on a design without waiting for a real draft:

```
/api/render/preview?template=trend_chart&format=x
```

Two things worth knowing before editing them:

- **Satori supports a CSS subset** — flexbox only, no grid, and any element with
  more than one child needs an explicit `display: flex`.
- **No glyphs outside the bundled font.** `▲`/`▼` render as tofu boxes, so the
  trend arrow is drawn as SVG. Check any new glyph actually renders.
- **No WebP.** Satori silently renders an empty frame — no error, no warning.
  536 of Kickio's images are WebP, and a draft reached review with a black hole
  where the shirt should be. Recipes therefore require a `jpg`/`jpeg`/`png`
  source (`imageUrls()`), and the card prints "No renderable photo — do not
  post" if one is ever missing, so the failure is loud rather than dark.

The trend card's direction colours (`#0ca30c` rising / `#9085e9` falling) were
picked with the dataviz validator against the dark surface: deutan ΔE 25.6,
tritan 10.2. Red/green was rejected — it measures deutan ΔE 4.1, indistinguishable
to a red-green colourblind viewer. Direction is also carried by an arrow and a
signed number, so it never rests on colour alone.

## Not built yet

- **TikTok video** — scripts are generated; the animated render is not built.
- **Publishing** — v1 is export-only by design: download the PNG, copy the text.
  `publish_log` exists; no platform API is wired up.
- **Featured Collector** — deferred, no data. See `docs/schema-findings.md`.
