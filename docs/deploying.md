# Deploying to Vercel

`main` is the production branch. Development happens on
`claude/modest-fermi-b5fgw1`; merging it into `main` is what ships.

## 1. Project

Linked to `clickthroo/kicksocial` via Vercel's GitHub integration, so every push
deploys. Next.js is auto-detected; no build settings needed.

## 2. The dashboard login

The app has its own sign-in. Everything is behind it except `/login` and the two
trigger endpoints, `/api/cron` and `/api/run`, which carry a bearer token
instead because Vercel's scheduler has no cookie.

### Set SESSION_SECRET first

`SESSION_SECRET` signs the session cookie, and it is **required**. With it unset
every page returns 503 saying so, rather than letting anyone in. Set it in
Vercel before the deploy that first carries the login, or the dashboard goes
down between the two.

    openssl rand -base64 48

Changing it later signs everybody out, which is also how you sign everybody out.

### Who can sign in

Accounts live in the engine database, in `admin_users`, not in Supabase Auth.
This project has one kind of user, the app never acts as that user against
either database, and the engine project had signups reachable with a
publishable key. A table we control is smaller and the blast radius is one
screen.

Passwords are bcrypt and are never compared in application code. `verify_admin`
does the comparison inside the database, so the hash never travels and the
password is a bound parameter rather than part of a statement. That function
also keeps the lockout: five wrong attempts locks an account for fifteen
minutes, and a missing account still runs a hash so it cannot be timed apart
from a wrong password.

Add someone:

```sql
insert into admin_users (email, password_hash, display_name, must_change)
values ('them@kickio.com',
        extensions.crypt('a temporary password', extensions.gen_salt('bf', 12)),
        'Their Name', true);
```

`must_change` makes the first sign-in stop and ask for a new password before it
will hand out a session. Turn an account off with
`update admin_users set disabled = true where email = '...'`, which is better
than deleting the row because it keeps the last-login record.

### Vercel Deployment Protection

Still worth leaving on if you have it. Two locks on one door is not wasted, and
it keeps preview deployments private. It does not break the cron job: Vercel
calls `/api/cron` internally with `Authorization: Bearer $CRON_SECRET`, which
bypasses deployment protection, and the route checks that header itself.

## 3. Environment variables

Set on **Production** (and Preview, if you want previews to work).

| Variable | Value | Secret? |
|---|---|---|
| `KICKIO_SUPABASE_URL` | `https://rlveellvebfzgyobceru.supabase.co` | No |
| `KICKIO_SUPABASE_PUBLISHABLE_KEY` | Kickio's publishable key, from Supabase → Kickio → Settings → API Keys | No, it's public by design |
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
  service-role key is rejected at startup: the client allowlists roles that
  cannot write.

## 4. First run

Once deployed and the env vars are set:

```
POST https://<your-deployment>/api/run/grail_of_the_day
```

Expect one of:

- `{"status":"created","draftId":"…"}`: open `/` and the draft is in the queue
- `{"status":"skipped","reason":"…"}`: the recipe ran but found nothing; the
  reason says why
- `{"status":"failed","reason":"…"}`: usually a missing or wrong env var

Every outcome is also written to `recipe_runs` in the engine database.

`sold_this_week` will skip with an RLS message until the read-only role exists,
see `unblocking-sold-this-week.md`. That is expected, not a deployment fault.

## 5. Cron

`vercel.json` schedules `/api/cron` at 09:00 UTC daily: Grail every day, Price
Trends on Tuesdays, Sold This Week on Fridays. Vercel picks this up on deploy,
check Project → Settings → Cron Jobs after the first deployment.

Note that Hobby-plan Vercel accounts are limited to one cron invocation per day,
which this schedule fits. If cron jobs do not appear, check the plan.

## Troubleshooting

### "No Production Deployment" and the Deployments list is empty

Zero deployments means Vercel has never attempted a build: the GitHub webhook
is not reaching it. Distinguish it from a *failed* build, which would appear in
the list in red. Check in this order:

1. **Production Branch**: Project → Settings → Git. If it names a branch that
   does not exist, no production deployment is ever created. It must be `main`.
2. **GitHub App repository access**: github.com/settings/installations →
   Vercel → confirm `clickthroo/kicksocial` is in the allowed list. Vercel's UI
   can show a repo as "Connected" while the GitHub App still lacks permission
   to send events for it. This is the most common cause of a silent webhook.
3. **Webhook deliveries**: the repo's Settings → Webhooks → the Vercel hook →
   Recent Deliveries. Green ticks mean GitHub sent them and the problem is on
   Vercel's side; no deliveries at all confirms the app-permission cause above.
4. **Force a build**: push any commit to `main`, or use Deploy in the Vercel
   project. If a push produces nothing, it is definitely (2).

### Build succeeds but every recipe run fails

Almost always environment variables. They are scoped per environment, so check
they are ticked for **Production** and not only Preview.

## Rolling back

Vercel keeps every deployment. Project → Deployments → pick a previous one →
Promote to Production. Nothing in the engine database is affected by a rollback.
