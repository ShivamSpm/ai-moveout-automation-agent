# Vacate status — October 24, 2026

## Claude sales tools — October 24, 2026

- Plugin 0.5.0 adds `/moving-assistant:telegram`. Renter-only MCP tools read sales
  and prepare connection links, draft Telegram listings/replies/pickups, and execute
  separately approved exact versions. Uses existing items/photos, no prompt copying.
- New Claude-prepared listings bind the destination, bot username, caption and photo
  hash. Their buyer messages wait for review; automatic replies and price drops are
  bypassed. Legacy website listing behavior remains unchanged. New pickup sends hold
  inventory, keep holds on unknown outcomes, and never announce a reserved item sold.
- `prepare_muse_handoff` returns an approved task/version-specific prompt for authorized
  browser tools. It does not invoke a personal Muse API. General Facebook feed/group
  posting and fully in-chat Muse control remain unsupported, not advertised as done.
- Local real-DB/mock-provider verification covers ownership, exact approval, changed
  targets/photos, duplicates, timeouts, pickup holds and executor tool scope. Full suite
  passed (379 tests before the additional successful-pickup regression); lint/build pass.
  No live Telegram/Muse sends, posts or account connections were executed.
- No migrations. Next: verify release tool availability and run an explicitly reviewed
  real Telegram listing and Muse browser flow before claiming live end-to-end completion.

## Claude-first public onboarding

- Public home page links to `/claude` before any Vacate login. The guide explains
  plugin installation, signup from connector sign-in, email confirmation, consent,
  first-move setup, and the difference from browser-local guest sessions.
- Plugin/catalog version 0.4.0 adds `start` and `muse` commands. Muse coordination
  uses existing reviewed tools; optional Claude Code Chrome guidance is unverified
  end to end. No personal Muse conversation API or general Facebook post adapter
  is implemented. Required Muse sign-in/connection/publish prompts stay with user.
- Verification: lint, TypeScript/production build and both plugin manifest
  validations pass. Directory submission still has the pre-existing missing
  license/icon/privacy metadata; no directory submission is claimed.
- No migrations or authentication changes. No accounts created, tokens issued,
  messages sent, or Facebook posts published during this change.

## Dashboard assistant setup

Added Dashboard buttons for `/muse` and `/claude`, each with a brief capability
description. The new Claude guide covers marketplace/plugin installation and renter
authentication. This change adds no migrations.

## Live application and database

Canonical app: https://ai-moveout-automation-agent-tau.vercel.app, shared Vercel
project/team `ai-moveout-automation-agent`, deployed from main. Next.js app in `web/`.
Supabase production: `sejfkcrmcbsiidftraek`. All 13 migrations through
`20261024234500_service_selections.sql` applied and histories match; public/private/storage
schema drift is empty. The service-selection migration was applied by approved CLI
release after discovering already-merged code ahead of its production schema.

Merged: Telegram nonce security #28, cleaning owner isolation #30, real dashboard
and chat context #32, service selections #31, chat tool loop #35, vision schema
repair #33, Telegram feedback/paste fallback #36. Final verification includes the
remaining local header/content scrolling fix and corrected documentation.

Implemented: saved move details, authenticated renter chat with bounded tool loop,
private lease PDFs and item photos, sourced lease checklist, owner-scoped dashboard,
item dispositions and vision suggestions, durable reviewed-action foundations,
Claude connector and Muse handoff interfaces. Anonymous dashboard is labeled example
data; signed-in readers use saved data. Local integration tests exercise real Supabase
ownership and storage rules, with fake external/model transports.

## Simulated, incomplete and deferred

Cleaning/moving selections save simulated booking references, not real provider bookings.
Gmail/Calendar live send/event adapters are not connected. Consumer Muse/Facebook access
must be proven separately from installed SDKs. No live post, buyer send, call or booking
was performed in the final audit. Both complete original demo journeys remain partial.

Telegram group links now expire in 15 minutes, consume once, and bind to the Telegram
user established in private chat. Separate legacy gaps remain: automatic buyer replies
and price edits bypass per-message review; pickup-send timeouts need unknown-outcome
reconciliation; reserved items must not be announced as sold. These are not covered by
the nonce security fix. Resolve before presenting Telegram as fully review-gated.

Custom domain, Cloudflare support routing and full SMTP setup are deferred by Jorge
for the hackathon. PR #34 is closed; its clean branch is retained. No purchase,
DNS/hosted auth redirect/config changes were made. Use the current Vercel URL.

## Verification

Final worktree based on `5273821`: 42 test files / 358 tests pass, type generation,
TypeScript, lint and production build pass. Local HTTP checks pass for signed-in
/dashboard, /start, /move, /items, /demo and the anonymous example dashboard.
Database lint passes. Both plugin manifest validations pass; directory submission
still reports missing license and warns about icon/privacy metadata.

[FINAL_REVIEW.md](verification/FINAL_REVIEW.md) covers all 81 requirements and 22
acceptance scenarios with explicit gaps. This is not a claim of full browser,
accessibility, live-provider or adversarial security certification.

## Blockers and next owners

| Owner | Next step |
| --- | --- |
| Shivam + Jorge | Resolve Telegram automatic-action review and ambiguous pickup-send outcomes; confirm intended reviewed interaction. |
| Shivam | Add Actions SUPABASE_ACCESS_TOKEN and require the migration check. CLI applied this release; CI automation is not credited. |
| Google Cloud project owner / Jorge | Configure Gmail/Calendar consent, scopes and test users; implement/test actual reviewed send/event adapters. |
| Deployment owner / Jorge | Verify Telegram bot token, username, channel, webhook secret and CRON_SECRET in shared Vercel; avoid live automatic selling until review gaps resolve. |
| ibm777p2 / Supabase org admin | Free a staging project slot or approve a suitable plan. |
| Shivam | Disconnect personal Vercel project; retain shared team deployment. |
| Repo owner | Choose license, publish privacy policy and provide icon before plugin-directory submission. |
| Jorge (deferred) | Buy vacate.dev later, then supply Cloudflare zone/token and team support@ destinations; choose custom SMTP. Built-in auth email limits remain. |

## Local work disposition

The original checkout's uncommitted layout/nav work was copied into the isolated
verification branch; the original is preserved. Older whiteboard staging commits
are superseded by the sanitized image already on main; do not restore metadata.
Feature branches/worktrees are retained. No force push or destructive cleanup.
