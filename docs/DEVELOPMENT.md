# Development setup and GitHub access

## Local checkout

```bash
cd /Users/jorge/ai-moveout-automation-agent
```

Origin: `https://github.com/ShivamSpm/ai-moveout-automation-agent.git`.
At clone time the public repository had no commits. Local bootstrap branch:
`codex/hackathon-bootstrap`. The remote's configured default branch is `main`.
Teammates initialized main during setup. The planning branch is rebased onto
real origin/main; see PR_PREPARATION.md for the feature-branch PR sequence.
The teammate website (PR #1, origin/website) is the app at web/; build on it, don't replace it.

## Start either development assistant

```bash
claude 'Read CLAUDE.md and docs/STATUS.md. Read START_HERE.md and continue from the captured requirements without restarting discovery.'
```

```bash
codex 'Read AGENTS.md and docs/STATUS.md. Read START_HERE.md and continue from the captured requirements without restarting discovery.'
```

Both CLIs are installed on Jorge's Mac. These commands start interactive sessions;
the bootstrap process has not launched interactive sessions or made model calls.
Codex Doctor confirms configured authentication and provider reachability; Claude
model authentication has not been checked.
Starting in this directory loads repository instructions. CLI trust/login prompts
may still apply. Global user settings can still be inherited; no global settings
were changed by this setup.

The `.claude/agents/` Markdown files and `.codex/agents/` TOML files define matching
development roles. They inherit model choices; they do not auto-run. See official
[Claude instructions](https://code.claude.com/docs/en/memory),
[Claude roles](https://code.claude.com/docs/en/sub-agents),
[Codex instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
and [Codex roles](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## GitHub permissions

Read-only checks during setup identified `jg-ctfbio` as the active `gh` identity.
GitHub reported repository permission `WRITE` and REST `permissions.push=true`;
`admin=false`. Ordinary pushes do not require admin privileges. Branch rules can
still require PRs/checks. Git operations also need working credentials for the
remote transport; this bootstrap has not attempted a push.

Claude and Codex use the credentials available in their execution environment;
they do not require separate GitHub collaborator roles. If another machine or
cloud session uses a different identity/token, verify that identity independently.
Do not grant admin access just to address a token, SSH or branch-rule problem.

Checks that do not publish anything:

```bash
gh api user --jq .login
gh repo view ShivamSpm/ai-moveout-automation-agent --json viewerPermission
git remote -v
git status --short --branch
```

For simultaneous development after the first commit, use separate worktrees or
clones with distinct branches and file ownership. Running `claude` and `codex`
as simultaneous writers in this one checkout is not an isolation mechanism.

## Next implementation step

Following START_HERE.md and MONOREPO.md, scaffold the web app and real package scripts,
choose pinned dependencies, create project-specific service resources, and deliver
the saved-move journey on a hosted development URL. Record actual environment
variable names and commands here as implementation introduces them.

The Claude product plugin/MCP server, Muse connector and hosted runtime are still
planned. The development instruction files do not create those integrations.

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
