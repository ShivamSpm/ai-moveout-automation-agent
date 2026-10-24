# Vacate status — October 24, 2026

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
