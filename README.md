# Kickio Content Engine

Generates publish-ready social posts for X, Instagram and TikTok from Kickio's
marketplace data, and queues them for one-tap approval.

## The rule that shapes the architecture

**Kickio's database is read-only from this project.** Enforced in three layers:

1. **Credential** — `src/lib/kickio/client.ts` accepts only a publishable (anon)
   key and throws on a service-role key, which would bypass RLS.
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

## Recipes

| Recipe | Cadence | Status |
|---|---|---|
| `grail_of_the_day` | Daily | Working — 1,633 eligible listings |
| `price_trends` | Weekly (Tue) | Working — like-for-like figures only |
| `sold_this_week` | Weekly (Fri) | **Blocked** — needs read access to `sales_history` |

Selection logic is code (each recipe queries a different shape of data and
carries its own integrity rules). Thresholds, cadence, platforms and the copy
brief are rows in the `recipes` table, editable without a redeploy.

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
