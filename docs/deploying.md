# Deploying to Vercel

The repo has a single branch, `claude/modest-fermi-b5fgw1`, and it is the
repository's default branch — so Vercel treats it as production. Nothing needs
merging first.

## 1. Project

Linked to `clickthroo/kicksocial` via Vercel's GitHub integration, so every push
deploys. Next.js is auto-detected; no build settings needed.

## 2. Protect the dashboard — do this before the first real run

**The app has no authentication of its own.** Anyone with the URL can approve or
reject drafts and read the source-data panel. Protection comes from Vercel:

> Project → Settings → Deployment Protection → **Vercel Authentication: Enabled**
> (applies to Production and Preview)

Only people logged into the Vercel account can then open the URL.

This does **not** break the cron job. Vercel's scheduler calls `/api/cron`
internally with `Authorization: Bearer $CRON_SECRET`, which bypasses deployment
protection. The route checks that header itself and 401s without it.

## 3. Environment variables

Set on **Production** (and Preview, if you want previews to work).

| Variable | Value | Secret? |
|---|---|---|
| `KICKIO_SUPABASE_URL` | `https://rlveellvebfzgyobceru.supabase.co` | No |
| `KICKIO_SUPABASE_PUBLISHABLE_KEY` | Kickio's publishable key — Supabase → Kickio → Settings → API Keys | No, it's public by design |
| `ENGINE_SUPABASE_URL` | `https://dsbrvpzfniosjtaxzpxm.supabase.co` | No |
| `ENGINE_SUPABASE_SERVICE_KEY` | Supabase → **Kickio Content Engine** → Settings → API Keys → `service_role` | **Yes** |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | **Yes** |
| `CRON_SECRET` | Any long random string | **Yes** |

Two things to get right:

- `ENGINE_SUPABASE_SERVICE_KEY` must be the **Content Engine** project's key, not
  Kickio's. The engine refuses to start if `ENGINE_SUPABASE_URL` equals
  `KICKIO_SUPABASE_URL`, but it cannot detect a Kickio *key* paired with the
  engine URL. Copy it from the right project.
- `KICKIO_SUPABASE_PUBLISHABLE_KEY` must be the **publishable/anon** key. A
  service-role key is rejected at startup — the client allowlists roles that
  cannot write.

## 4. First run

Once deployed and the env vars are set:

```
POST https://<your-deployment>/api/run/grail_of_the_day
```

Expect one of:

- `{"status":"created","draftId":"…"}` — open `/` and the draft is in the queue
- `{"status":"skipped","reason":"…"}` — the recipe ran but found nothing; the
  reason says why
- `{"status":"failed","reason":"…"}` — usually a missing or wrong env var

Every outcome is also written to `recipe_runs` in the engine database.

`sold_this_week` will skip with an RLS message until the read-only role exists —
see `unblocking-sold-this-week.md`. That is expected, not a deployment fault.

## 5. Cron

`vercel.json` schedules `/api/cron` at 09:00 UTC daily: Grail every day, Price
Trends on Tuesdays, Sold This Week on Fridays. Vercel picks this up on deploy —
check Project → Settings → Cron Jobs after the first deployment.

Note that Hobby-plan Vercel accounts are limited to one cron invocation per day,
which this schedule fits. If cron jobs do not appear, check the plan.

## Rolling back

Vercel keeps every deployment. Project → Deployments → pick a previous one →
Promote to Production. Nothing in the engine database is affected by a rollback.
