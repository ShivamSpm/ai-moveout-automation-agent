# Development and release

The app is Next.js 16 in `web/`, deployed from main by Vercel.
Use one writer per isolated worktree; never perform feature edits in the shared checkout.

```bash
git fetch origin
git worktree add ../ai-moveout-task -b feat/task origin/main
# Copy the local, ignored web/.env.local into the worktree without printing it.
cd ../ai-moveout-task/web
npm ci
npx next dev --port 3105
```

Run `npx next typegen`, `npx tsc --noEmit`, `npm run lint`, `npm test` and
`npm run build` from web. From root, run `claude plugin validate .`,
`claude plugin validate ./plugins/moving-assistant`, `supabase db lint --local`
and `git diff --check`. Integration tests use the local Supabase stack and
synthetic example.test accounts; they must not target production.

## Hosted project (team access)

Ask Jorge for an invite to the Vercel team `ai-moveout-automation-agent` and, if you
change the schema, the Supabase org of the same name. Then, from the repo root:

```bash
vercel link --project ai-moveout-automation-agent --scope ai-moveout-automation-agent
vercel env pull web/.env.vercel.local      # hosted values; local dev still uses web/.env.local
supabase link --project-ref sejfkcrmcbsiidftraek
supabase db push --dry-run                 # review, then without --dry-run
supabase config diff                       # hosted auth settings live in [remotes.production]
```

Never put `SUPABASE_SECRET_KEY` in a `NEXT_PUBLIC_` variable. New migrations go through
the local stack and tests first.

## Database migrations in CI

`.github/workflows/supabase-migrations.yml` runs on every pull request that touches
`supabase/`. It checks that each migration version is unique and that new migrations
sort after the newest one on `main`, applies all migrations to a fresh database, lints
the schema, and dry-runs against production. When migrations reach `main`, it applies
them to production (`sejfkcrmcbsiidftraek`) with `supabase db push`.

A repository admin adds these Actions secrets (Settings > Secrets and variables >
Actions, or on the `production` environment):

| Secret | Value |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | A personal access token from supabase.com/dashboard/account/tokens, created by a member of the Supabase org |
| `SUPABASE_DB_PASSWORD` | Optional. The production database password (Project Settings > Database) |

Before merging migration-dependent application code, inspect `supabase db push --dry-run`,
apply the approved migration, and verify `supabase migration list` and
`supabase db diff --linked --schema public,private,storage`. Do not rely on CI until
Shivam installs its access-token secret and makes the migration check required.
Write migrations so that the current code keeps working
(add columns and tables before code uses them; drop them in a later pull request).
Always create migrations with `supabase migration new <name>` on an up-to-date `main`.
Auth settings (`supabase config push`) stay a manual step.

## Enable Google or Microsoft sign-in

In the Supabase dashboard, select hosted project `sejfkcrmcbsiidftraek`, then open
**Authentication → Providers**. Enable Google and/or Azure (Microsoft), enter the
provider's client ID and client secret, and save. Never put client secrets in the browser.
The `/start` page checks public Auth settings on the server and hides disabled
providers; allow up to two minutes for its short cache to expire.

- **Google:** In Google Cloud, configure the OAuth consent screen and a web OAuth
  client. Add the callback below as an authorized redirect URI, then copy the client
  credentials into Supabase's Google provider settings. Add test users if the
  consent screen is in testing mode.
- **Microsoft:** In Microsoft Entra, register an application with accounts in any
  organizational directory **and personal Microsoft accounts**. Add a Web redirect
  URI using the callback below. Create a client secret and copy its **value**, plus
  the Application (client) ID, into Supabase's Azure provider settings. Use tenant
  URL `https://login.microsoftonline.com/common` for personal and work accounts.
  Vacate requests the required `email` scope when starting Azure OAuth.

Register this exact callback with both Google Cloud and Microsoft Entra:

```text
https://sejfkcrmcbsiidftraek.supabase.co/auth/v1/callback
```

In Supabase **Authentication → URL Configuration**, allow the application's
`/auth/callback` URL for production and approved development origins; the app
returns renters to `/start?resume=1`. Set `APP_URL` to the app's origin for email
confirmation redirects (for this worktree's local server, `http://localhost:3101`).
Non-secret move details survive redirects in sessionStorage in the same browser
tab; passwords and lease files are never stored there. Re-attach the PDF on return.

Hosted email confirmation uses Supabase's built-in mailer, which only delivers to
members of the Supabase organization until custom SMTP is configured. Configure
custom SMTP before inviting external renters to sign up. The local stack has
email confirmation disabled, so local signup immediately saves the move.

References: [Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[Azure setup and email scope](https://supabase.com/docs/guides/auth/social-sign-in/auth-azure),
[public Auth settings](https://github.com/supabase/auth/blob/master/internal/api/settings.go),
[SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp).
