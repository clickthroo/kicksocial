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
  price_index_history                  publish_log    - what went out, per platform
  teams                                recipe_runs    - why a day produced nothing
        │                                    ▲
        └──► recipe selects + verifies ──► Claude writes copy ──► draft
                                                                    │
                                                    Next.js PWA approval queue
```

Recipes run on a Vercel cron (`vercel.json`), from the **Run now** button on
`/runs`, or on demand via `POST /api/run/<recipe_key>`.

Both HTTP triggers require `Authorization: Bearer $CRON_SECRET`. **If
`CRON_SECRET` is unset they return 503 rather than running.** The check was
originally written as "verify the secret if one is configured", which meant an
unset variable turned it off and left a public URL that spends Anthropic credits
on every call. The button is a server action, so the dashboard still works
either way.

**Settings** (`/admin`) edits each recipe's configuration — enabled, which
sellers may be featured, price floor, cooldown, stock-check window, and the copy
brief — without a redeploy.

**Run history** (`/runs`) answers "why was there no post today?". Every run is
recorded, skips included, so a quiet day is explainable without reading logs — a
recipe that finds nothing worth posting is working as intended, and the screen
leads with the latest outcome per recipe and the reason it gives, with the
selection diagnostics behind a disclosure.

## Recipes

| Recipe | Cadence | Status |
|---|---|---|
| `grail_of_the_day` | Daily | Working — 378 eligible listings |
| `price_trends` | Weekly (Tue) | Working — like-for-like figures only |
| `sold_this_week` | Weekly (Fri) | **Blocked** — see `docs/unblocking-sold-this-week.md`. Disabled in Settings meanwhile |
| `grail_sale` | On demand | Working — an admin names the sale (`/sold`) |
| `market_index` | Weekly (Thu) | **Skipping** — the index's basket is still filling; see below |
| `club_archive` | Weekly (Wed) | Working — 21 clubs have the depth; Man Utd leads with 164 shirts, 1975–2025 |

Every variant carries **kickio.com** in its body text, and each network gets its
own hashtag count (see below).

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

### Grail Sale: where a fact came from is part of the post

`sold_this_week` reads Kickio's `sales_history` and is blocked by RLS. `grail_sale`
needs no new database access: an admin pastes the Kickio link of something that
sold and types what it went for, at `/sold`.

Only the URL is user input, and it is validated against an **allowlist** — host
and path both have to match, and a bare slug is accepted. A parser that hunted
for a slug-shaped substring would happily take an eBay link, miss, and look up
something else entirely.

Everything describing the shirt — name, club, season, maker, rarity attributes,
photography — is read from Kickio's `products` row. Nothing is parsed out of a
web page, so there is no HTML to break and no third-party image to borrow.

**The price is the exception, and the draft says so.** Every other recipe can
point a reviewer at the column a number came from; this one cannot, so the claim
reads `source: entered by an admin, not read from Kickio` rather than dressing a
typed figure up as a verified one. A reviewer checking this post is checking the
admin, and should be able to see that.

No buyer protection fee is applied here. Elsewhere the engine adds it because
`listings.price_cents` is an asking price and the site shows more; here the admin
enters what was actually paid, so adding a fee would invent money that never
changed hands.

The lookup is a separate step from generation: confirming the shirt first means a
wrong link costs a database read rather than a Claude call and a draft to reject.

### Approving is not publishing

v1 posts by export: a person downloads the card and posts it. The engine cannot
observe that happening, and must not pretend otherwise — so the two are separate
states, and the person who posted confirms it.

- **Approve** (`/`) means *cleared to post*. It does not send anything.
- **Publish** (`/publish`) holds everything cleared but not yet out, with the
  image and text for each network, and a per-platform confirmation.
- A draft becomes `published` only once **every platform it carries copy for**
  has been confirmed. Until then it stays `approved` and keeps showing up.

The draft's status is **derived** from `publish_log` rather than tracked
alongside it (`nextStatus()`), so the two cannot drift apart. Undoing a mark
moves the draft back to `approved`. A rejected or unreviewed draft is never
pulled into the flow by a stray log row, and a draft with no platforms is never
called published — completeness over an empty list is vacuously true, which
would put a post in the log that was never written.

A partial unique index enforces one success per `(draft_id, platform)`, so a
double tap updates the row it already wrote instead of claiming the post went out
twice. `method` is `export` throughout; when a platform API is wired up it writes
its own rows and none of this logic changes.

Before this, approving was a dead end — the draft left the queue, nothing
recorded where it went, and the rendered assets became unreachable.

### Club Archive counts what Kickio has, not what exists

"50 years of Manchester United" describes **Kickio's shelf**, not football. The
1975 shirt is the oldest Kickio has listed, not the club's oldest kit, and 164
shirts is not a complete archive of anything. Every fact is framed "on Kickio",
the card says so, and the brief forbids implying completeness — a collector who
owns a 1972 shirt should read this and see a marketplace's holdings, not a claim
they can disprove in one reply.

It is deliberately the safest post the engine makes: every number is a count of
rows. No index, no percentage, no comparable cohort — nothing that can be
arithmetically correct and still mislead.

Two data traps it works around:

- **`teams.listings_count` is not the number to print.** It reports 65 for
  England where 140 active products exist, and 54 for Arsenal against 86. Good
  enough to shortlist candidates cheaply; never good enough to publish, so the
  winner's figures are recounted from `products`.
- **`products.season_end_year` is null on all 2,597 active rows.** Seasons are
  text (`"1990-91"`), parseable on 2,596 of them. The era montage in Price Trends
  filtered on that column and so matched nothing, silently — fixed to a string
  prefix at the same time.

A club also has to *span* something: 20 shirts from three seasons is a shelf, not
an archive, so `minSpanYears` (15) rejects it rather than calling it one.

**The club can be pinned in Settings.** Left on automatic, the deepest club not
on cooldown is chosen. Pick one and it runs for that club, cooldown or not — an
admin asking for Arsenal is asking for Arsenal, not for a reminder that Arsenal
ran in June. It does **not** bypass the depth and span checks, so a thin choice
is refused by name rather than turned into a thin post.

### Market Index, and why it refuses

`price_index_history` is a single market-wide index with no scope column — the
same table that was wrongly drawn under club headlines. Here it **is** the
subject, so plotting it is finally legitimate. Quoting it usually is not.

An index is a basket, and Kickio's basket is still filling:

| Window | Basket | Index |
|---|---|---|
| 30 days | 1,261 → 2,036 (**+61.5%**) | −0.6% |
| 60 days | 1,005 → 2,036 (**+102.6%**) | −1.4% |
| 97 days (all) | 0 → ~1,900 | −2.3% |

A basket that doubles is not measuring prices; it is measuring how much of the
market Kickio has got round to tracking. The first row on record has
`cohort_count = 0` at exactly `100.00` — that is the *definition* of an index's
first day, not a reading, and anchoring a percentage to it invents a movement.

So `maxCohortDriftPct` (15%) is the integrity rule of this recipe, exactly as
`change_basis = like_for_like` is for Price Trends: the mix-shift trap one level
up, and harder to spot because the number looks so calm. The recipe **skips
today** and names the figure that disqualified it. It starts working on its own
the week coverage plateaus — nothing needs changing for that.

`warmupFloorPct` trims the leading days where the basket was empty or far below
the window's normal size, so the percentage is never anchored to a definition.

### Platform limits, and the one that survives X Premium

`src/lib/copy/limits.ts` — its own module because the dashboard needs it, and a
client component importing `generate.ts` would pull the Anthropic SDK into the
browser bundle.

| Network | Post | Hashtags |
|---|---|---|
| X | **25,000** (Premium) | 15 |
| Instagram | 2,200 | **30** (the platform cap) |
| TikTok | 2,200 | 12 |

**Kickio posts from an X Premium account**, so the 280-character limit does not
apply and hashtags no longer come out of the same budget as the writing — which
is what made three the right number on a free account.

**The first 280 characters still decide everything.** Past that, X collapses the
post behind "Show more", so `x.lead` is the part that has to stand alone. That is
a writing constraint rather than a platform one, and it is the only part of the
old limit worth keeping. The brand voice says so: lead with the most surprising
concrete fact, never let it straddle the boundary, and don't pad to fill the room
Premium bought. The queue greys out everything past the lead and reports
`lead 268/280 · 412 total` instead of a meaningless count against 25,000.

Hashtags are built in layers — the shirt (club, season, player, maker), the
category (era, kit type), then the broad ones collectors browse — and the model
is told to stop short of the number rather than invent tags or pad with
near-duplicates. A padded set is worse than a short one.

`src/lib/copy/export.ts` owns the text that gets pasted, so the queue and the
publish screen cannot disagree about it.

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
| `grail_sale_card` | Lit plate on a dark studio field, result set beneath |

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

### Branding lives in the app, not in the code

**Settings → Branding** holds the logo and the card colours, in the engine's own
`brand_settings` table (one row, enforced by a check constraint — two rows would
mean cards rendering in whichever branding the query happened to return).

The logo is **uploaded, not committed**: PNG or JPEG, background knocked out,
re-encoded to a 512px square PNG and stored inline as a data URI.

**The background knockout is a flood fill from the edges, not "make white
transparent".** Kickio's badge is a black disc on an opaque white square, and on
a near-black card that reads as a white box with a logo in it — resizing onto a
transparent canvas does not help, because the white is in the source pixels. But
the badge's ring and its lettering are white too, so removing every white pixel
would hollow it out. The fill therefore starts at the border and spreads only
through touching pixels of the same colour: the surround goes, anything enclosed
by the artwork stays. It runs **before** the square resize, since `fit: contain`
pads with transparency and would leave the detector looking at transparent
corners. It declines when the corners disagree — a logo on a gradient or a
photograph has no single background to remove, and guessing one would eat the
artwork. Inlined rather than linked because
Satori needs the bytes at render time — a URL means a network round trip on every
card, and a different answer in dev, preview and production if the file moves.
Re-encoded because the uploaded file would otherwise decide the cost of every
render for good. With no logo uploaded, cards fall back to the KICKIO wordmark.

Four colours: `accent` and `accentDeep` (the SOLD badge, "SOLD FOR",
kickio.com), and `rising`/`falling` for price trends.

**The direction pair is re-checked as you type.** Rising and falling were chosen
so a red-green colourblind reader can still tell them apart, and nothing about a
colour picker communicates that — so the editor reports the live ΔE and contrast
figures. `src/lib/brand/colour.ts` is ported from the dataviz skill's validator
(Machado et al. 2009 CVD transforms, OKLab ΔE ×100) and its tests assert it
reproduces the validator's numbers exactly, so the app and the README cannot
drift apart. They are **warnings, not refusals**: direction is also carried by an
arrow and a signed number, so colour is never the only cue, and it is the
operator's brand to set.

Branding failures are never fatal — an unreadable row, a bad hex, a failed query
all fall back to the defaults. A card in default colours is a far smaller problem
than a card that does not render.

### Card styles are chosen in the app, not in the code

Six looks for `grail_sale_card`, listed in `src/lib/render/styles.ts`:

| Style | What it is |
|---|---|
| Studio | Rounded white plate, inset on a dark field. The safe default |
| Spotlight | The same plate clipped to a circle on near-black |
| Sweep | Backdrop coloured **from the shirt's own photo** |
| Paper | Warm off-white; no plate, so the photo's pale background blends away |
| Editorial | Photo full-bleed, type over a scrim |
| Frame | Large keylined photo, smaller type |

Set a default per recipe in **Settings**; change any individual draft from the
queue. The picker passes `?style=` to the render route, so tapping through
options re-renders immediately and nothing is saved until one is chosen.
`setDraftStyle` touches only the style key — **changing a look can never change
a fact.**

The first attempt varied only colour and produced six cards that looked like the
same card. Kickio's photos carry their own pale background, and that bright
rectangle dominates whatever sits behind it — so the styles differ in how the
photo itself is *presented* (plate, circle, bare, keyline, bleed), not just in
palette.

**Sweep's colour is sampled from the photograph**, not from
`teams.primary_color`, which is populated for only 180 of 2,959 teams and is a
club brand colour rather than this shirt's. `dominant-colour.ts` samples the
middle half of the frame — the raw dominant colour of a product shot is the
backdrop — and returns null for a near-white, near-black or near-grey shirt,
where a tinted backdrop would look broken rather than minimal. It runs once at
draft creation and is allowed to fail.

Two Satori traps this hit, both worth knowing before editing a template:

- **`border: undefined` throws**, taking the whole render with it. Satori parses
  the value it is given rather than skipping the property, so conditional styles
  must be spread (`...(cond ? {border} : {})`), never set to `undefined`.
- **Paint order is document order**, and z-index is honoured only partially. The
  bleed scrim first went in before the photo and left white type on a pale
  background.

`grail_sale_card` deliberately does not use the Grail treatment. Type over a
photograph suits something you can still buy — the shirt is the offer. A sale is
finished, so it is a dark studio field with the shirt on a lit plate and the
result set beneath. That also removes a risk: type over an unknown photograph is
only as legible as the scrim holds up, and the price is the one element that
must never be hard to read.

**Two things this card learned the hard way.**

*Satori's `radial-gradient` does not behave like CSS.* It renders, but anchored
and scaled quite differently — the first pass put the fall-off in one corner and
swallowed the shirt entirely. The studio light is a `linear-gradient`, which is
already proven here by the Grail card's scrim. Check any radial by rendering it.

*The photo cannot be feathered into the dark field.* Kickio's photography is
catalogue shots on their own pale backgrounds, so on a dark card they read as a
bright rectangle stuck to the surface. Blending that edge needs per-pixel work
the renderer cannot do, and faking it with a gradient just produced a bright
rectangle with a smudge round it. So the plate is deliberate instead — inset,
rounded, lit against the dark — which works with any photo and any background.
Its fill is white because `contain` letterboxes a photo whose aspect does not
match, and a warmer plate left visible bars down the sides.

Colours come from **Settings → Branding**; the constants in `templates.tsx` are
only the fallback for when that read fails.

Portrait gives the photo a smaller share of the frame than instinct suggests. At
0.6 the type panel overflowed and pushed the wordmark off the bottom edge — worth
checking any layout change against both formats, since the landscape one was fine
throughout.

The trend card's direction colours (`#0ca30c` rising / `#9085e9` falling) were
picked with the dataviz validator against the dark surface: deutan ΔE 25.6,
tritan 10.2. Red/green was rejected — it measures deutan ΔE 4.1, indistinguishable
to a red-green colourblind viewer. Direction is also carried by an arrow and a
signed number, so it never rests on colour alone.

## Not built yet

- **TikTok video** — scripts are generated; the animated render is not built.
- **Publishing via platform APIs** — v1 is export-only by design: download the
  PNG, copy the text, confirm it on `/publish`. No platform API is wired up, so
  nothing posts on its own.
- **Featured Collector** — deferred, no data. See `docs/schema-findings.md`.
