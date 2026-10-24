# Session handoff

## Account workflow repair — October 24, 2026, Codex

PR #24 is open on `feat/continue-launch`; application release pending. Production
schema migrations applied after PR opening under Jorge's explicit instruction; no
existing renter records or personal files changed.
Production read-only verification found the reported move/contact/deposit/date saved,
but no renter name, structured ZIP, documents, tasks, listings or chat history.
Do not copy personal details or screenshots into this repository.

- Root cause: `/dashboard` and `/items` always rendered fixtures; `/start` discarded
  the selected lease before submitting. The two move forms captured different fields.
- `/start` and `/move` now share the same form with renter name, street/unit/city/state/ZIP,
  date, deposit, management company, manager name/email and optional phone/apartment size.
  Legacy full addresses are preserved and prefilled for renter confirmation.
- Onboarding uploads the selected PDF to private storage after saving the move,
  then registers/reads it. Upload failure leaves move details intact and offers recovery.
- Dashboard uses the connector's user-scoped checklist/document/finding/activity readers,
  real inventory/approvals, empty states and persisted chat. No sample records are inserted.
  Chat context excludes private move address/contact fields and treats source text as data.
- Public examples moved to `/demo` and `/demo/items`; private item URLs require ownership.
  Cleaning simulation endpoints now derive identity from the authenticated session.
- Two additive migrations authored and applied locally: `20261024233001_property_management_company`
  and `20261024233002_structured_move_address`. Generated application DB types refreshed.
  Applied both to production along with the already-merged `20261024233000_landlord_calls`.
  All 10 migration versions are recorded; public/private/storage schema diff is empty.
  The CLI-created files were resequenced after the future-dated teammate migration
  before publication; local history was reconciled without changing schema. Jorge
  authorized production migration application after PR opening (October 24).
- Validation: npm ci (0 vulnerabilities), route typegen, TypeScript, lint, 271 tests,
  production build (37 routes), local database lint and diff whitespace checks passed.
  Root/plugin validation passed; plugin directory submission still flags missing license,
  icon and privacy-policy metadata (not changed here).
- Authenticated local HTTP checks confirmed account dashboard data, form prefill,
  empty inventory, public demo separation and anonymous redirect. Browser click-through
  remains unverified because native Chrome actions were interrupted by active-window changes.
  Hosted preview `/start` and `/demo` returned 200 with the new form and labeled
  examples. Real model calls and outgoing calls/messages/posts not run.
- Next: finish PR checks and application release, then reattach the user's original
  lease and confirm newly collected fields through the application. Do not label extraction
  complete until the original and cited findings are visible in that account.


Updated: October 24, 2026, 2:10 PM PDT. Phase: production live on Vercel with the Muse bridge,
signup and Claude connector; custom domain, SMTP and live Muse test pending.

## Production state (orchestrator: Jorge + Claude Code)

- **Live:** https://ai-moveout-automation-agent-tau.vercel.app, built from `main`
  (Vercel team `ai-moveout-automation-agent`, repo `ShivamSpm/ai-moveout-automation-agent`,
  root `web`, Next.js, `npm ci`, `npm run build`, production branch `main`).
  Shivam's personal Vercel project also builds this repo; disconnect it to avoid two production copies.
- **Merged to main:** PR #3 (Muse bridge, MCP/A2A, schema, login, `/start` signup),
  PR #10 (`/api/chat` signed-in only + 20 turns/10 min per renter; hosted isolation check).
  Claude connector (tools, MCP Apps progress card, plugin 0.2.0, marketplace `vacate`) is in the next PR.
- **Hosted Supabase `sejfkcrmcbsiidftraek`:** migration history matches the repo (2 migrations); RLS on
  every public table; `move-files` private with owner policies. `web/scripts/hosted-isolation-check.mjs`
  passed 13/13 (two throwaway users, deleted after). Free plan: **no backups**, project pauses when idle.
- **Fixed:** the Supabase secret key in Vercel and the share file had been copied masked (CLI needs
  `--reveal`); replaced and verified by a signed-in `muse_list_tasks` call on production.
- **Blocked:**
  - Staging Supabase for previews — a second free project is refused because org admin ibm777p2 already
    has two free projects. Previews still use the production database.
  - `vacate.dev` — Vercel requires the user to buy it interactively. Then nameservers → Cloudflare
    (Email Routing `support@` → team), Vercel records DNS-only, `APP_URL`, Supabase site URL/redirects.
  - Custom SMTP (external sign-up confirmation), OpenRouter key, Google/Microsoft providers.
- **In progress (Codex worktrees):** `feat/lease-storage` (upload, households, `/plan`, `/account`,
  account deletion), `feat/custom-domain` (runbook, redirects, `domain:check`). Prepared brief:
  dashboard real data + renter chat context (start after lease-storage merges).
- **Connector review notes:** `get_move_status` creates an empty move (so `readOnlyHint:false`);
  task page numbers come only from a saved "Lease p.N" source; listing/reservation history is
  snapshot-only; landlord messages are draft-only in chat; `resource_link` omitted; MCP Apps rendering
  in Claude and all Claude-client tests are not yet verified. Links to `/plan` and `/account*` 404
  until the lease-storage branch merges.

## Start signup feature — local worktree, October 24, 2026

- Prepared on `feat/start-signup` in `ai-moveout-start-signup`; uncommitted for
  Claude Code review. No migration, hosted configuration or deployment changes.
- `/start` is public with session refresh; email/password signup or existing-account
  sign-in saves a renter-owned move, including deposit cents. Returning renters
  see saved values. Optional Google/Azure buttons use cached public Auth settings.
- Non-secret sessionStorage drafts support confirmation/OAuth return; lease files
  remain local and must be re-attached. Four-step success animation opens dashboard.
- Verified: `npx tsc --noEmit`, `npm run lint`, `npm test` (103 tests, 12 files),
  `npm run build` (20 pages). Generated route types with `npx next typegen` first.
  Real local Auth/SSR-cookie integration checks signup, ownership isolation,
  update without duplicates, and existing-account sign-in; confirmation branches
  have mocked unit coverage. Browser signup → dashboard → `/start` reload passed
  on port 3101 with synthetic example.test data; dev server stopped afterward.
- Limits: dashboard still uses its existing demo data. Hosted Google/Microsoft
  redirects and actual email delivery were not exercised. Draft restoration is
  scoped to the same browser tab; lease upload/parsing remains out of scope.
- Next runnable step: orchestrator reviews the diff; enable desired hosted Auth
  providers/custom SMTP following DEVELOPMENT.md, then verify hosted redirects.

## Muse lane (Jorge) — branch `feat/primary-flows`

Built (local stack only; nothing hosted, nothing posted):
- Muse bridge: renter-approved Facebook Marketplace listings, buyer replies and pickup
  confirmations become a work queue for the renter's own Muse agent. Served over
  **A2A 1.0** (`/api/a2a`, Agent Card at `/.well-known/agent-card.json`, official
  `@a2a-js/sdk@1.3.0`) and **MCP** (`/api/mcp`, `@modelcontextprotocol/sdk@1.32.1`).
- One MCP server for Claude.ai/Desktop/Code, Muse and Muse Code. OAuth 2.1 through the
  Supabase OAuth server (dynamic client registration, consent page `/oauth/consent`)
  gives the full renter toolset as that renter; `vac_` connector tokens give Muse the
  executor tools only. Claude plugin in `plugins/moving-assistant` (validated).
- `/muse` page: items, keep/sell/donate, listing review cards bound to payload hash,
  connector tokens, buyer threads, honest status labels ("Done by Muse · reported").
- Migrations `20261024190219_init_moving_assistant`, `20261024191716_muse_bridge`
  (applied to the local stack only). `@muse-code/sdk@1.4.4` + `npm run muse:check`.

Verified:
- `npm test`: 30 passing (unit + integration on local Supabase: A03, A04, A06, A08,
  A09, A13, A15, A2A JSON-RPC round trip, MCP tool scoping). Lint, typecheck, build pass.
- `npm run oauth:check`: discovery → DCR (201) → PKCE authorize → consent → token →
  MCP `2025-11-25` tools/list (14 tools) as the signed-in renter.
- Browser on `localhost:3100`: sign up, add item, sell, draft, approve, create token.
  Official A2A client discovered the card and listed/claimed/reported over HTTP; the
  report used a **simulated** Marketplace URL. Nothing was posted to Facebook.

Added 12:55 PM:
- Merged main (PR #4 `/api/chat`) and the teammate Google-login commit from `website`
  (not yet on main): `/login` offers Google and email; site-wide proxy protects `/muse`;
  one safe-redirect helper for both auth paths. 31 tests, lint, typecheck, build pass.
- **Manual Muse relay** for local use: an approved listing shows the exact text to give
  Muse; the renter records the Marketplace URL Muse returns (same claim/hash checks,
  `external_ref = relayed-by-renter`). Needed because cloud Muse cannot reach localhost.
- The deployed app (ai-moveout-automation-agent.vercel.app) serves main without the
  bridge; this Mac's Vercel login (CTFBio team) has no access to that project.

Hosted setup (1:20 PM, Jorge):
- Supabase org `ai-moveout-automation-agent`, project `sejfkcrmcbsiidftraek` (us-east-1).
  Both migrations applied with `supabase db push`; `db lint` clean. Auth settings from
  `[remotes.production]` in `supabase/config.toml` via `supabase config push`: site URL,
  production + localhost redirects, OAuth 2.1 server with dynamic registration and
  `/oauth/consent`. Hosted email confirmation and TOTP stay on.
- Vercel team `ai-moveout-automation-agent` (Pro; members jg-ctfbio owner, ibm777p2,
  spmshivam-9122, yw8676-3655), project `ai-moveout-automation-agent`, root `web/`.
  Env: Supabase URL, publishable key, secret key (sensitive; production + preview).
  Production domain https://ai-moveout-automation-agent-tau.vercel.app is public;
  per-deployment URLs require Vercel login.
- First deployment came from the CLI on `feat/primary-flows` (39a4d09) and became
  production because no Git repository is connected yet. Connecting Git needs the
  Vercel GitHub app on ShivamSpm's account; then production follows `main`.
- Not configured yet: Google provider in the new Supabase project, OpenRouter key
  (`/api/chat` returns 503), custom SMTP (Supabase's built-in email only reaches org
  members, so outside sign-ups cannot confirm).

Not yet verified (blockers for the live demo):
- `muse` host not installed / not signed in (`npm run muse:check` reports it).
- Consumer Muse custom connector: whether it accepts MCP, A2A or an API key is
  undocumented. Needs a public HTTPS URL and Jorge's Muse + Facebook account.
- Public URL: Vercel preview with Vincent's hosted Supabase, or a deliberate tunnel.
- Port 3000 is used by another local app; this app runs on 3100.


## Backlog addition — family/household collaboration (October 24, 2026)

- User requested "family" invitations as stretch, allowing spouses, caregivers
  and patients, or parents and children to add item photos and use the moving
  personal agent/application together for apartment or college dorm moves.
- Updated CASE-05 from proposed NEXT to user-requested STRETCH; added HOUSE-01–05,
  decision D17, product scope and H01–H04 acceptance specifications.
- Invitation lifecycle, shared visibility, attribution, revocation and delegated
  authority are proposed acceptance details; no feature implementation is claimed.
- Verification: documentation diff/whitespace and requirement/acceptance ID checks.
  No runtime checks needed for this documentation-only addition.
- Next step when prioritizing this stretch goal: settle member permissions and
  shared-chat visibility before designing membership/storage access or invitations.

## Website integration review (PR #1, `origin/website` at 88fc962)

Author `ibm777p2`; PR already has one approval; repository owner `ShivamSpm`.
Checked in an isolated worktree on Node 24.21 / npm 11.19: `npm ci`, `npm run lint`
and `npm run build` (Next 16.4.3, includes typecheck) pass. Plain `tsc --noEmit` fails
only on Next-generated `PageProps`/`LayoutProps` globals; use `next build` or run
`next typegen` first. Not checked in a browser here.

What it is: a front-end demo on static data (`web/src/lib/demo.ts`): landing, `/start`
form, `/dashboard` (dated plan, deposit meter, approval queue, activity, lease clauses),
`/items` and an item page with a rule-based buyer chat. No backend, auth or providers.
Reusable as is: `LeaseRules` → `buildPlan()` (dates computed in code, not by the model)
is the right extraction target for Flow A; the approval queue is the review-card UI.

Gaps against confirmed requirements (requests to the web owner, not edits made here):

1. **Simulated state shown as done.** "Approve & send" stamps "Sent" with nothing sent.
   Label "Approved · simulated" until the execute route exists (AGENTS.md visibility rule).
2. **No renter chat (D01).** Add a chat panel to `/dashboard` backed by `POST /api/chat`.
3. **Flow B intake missing.** Items are pre-seeded; add photo upload → proposed
   keep/sell/donate → user confirmation before anything is listed.
4. **Flow A input is cosmetic.** Lease upload is not stored or read; form values are ignored.
5. **Legal citations are hard-coded** (CA Civil Code §1950.5, Vehicle Code §14600, SFMTA).
   Mark them "California general information, verify" or source them from the lease
   extraction with page references; do not show them as extracted from the user's lease.
6. **Marketplace channel.** Buyer chat lives on a Vacate page. D10's live path is
   Facebook Marketplace via Muse; keep the page chat labeled as an in-app channel.
7. **Demo-only seller floor** sits in client props; when wired, keep the floor server-side.

Proposed web↔agent contract (teammate) mapped onto shared tools, as Next route handlers
in `web/` first: `POST /api/moves/:id/start` (store lease, extract `LeaseRules` with page
refs, draft notice as a pending action), `POST /api/actions/:id/execute` (owner check,
payload-hash match, idempotency key, durable claim, provider call, reconcile),
`POST /api/items/:id/chat` (`{ reply, proposedDeal? }`; deals stay pending seller OK).

## First implementation steps (in order, owners proposed)

1. Done 11:57 AM: PR #1 merged to main (9ed9c93); this branch rebased onto it.
2. Create dedicated hackathon Supabase + Vercel projects (root dir `web`); see blockers.
3. Migration 0001 at root `supabase/migrations`: `moves`, `documents`, `obligations`,
   `items`, `item_photos`, `actions` (payload hash, idempotency key, state), `listings`,
   `conversations`, `messages`; owner RLS; private `leases`/`photos` buckets. Shivam.
4. Supabase Auth in `web/` and replace `demo.ts` reads with a server repository; move
   demo values to `supabase/seed.sql` as synthetic data. Vincent + Shivam.
5. `/api/chat` with OpenRouter (Claude) and a small tool registry: `extract_lease_rules`,
   `build_checklist`, `draft_landlord_email`, `propose_item_dispositions`. Steven.
6. In parallel from step 1: Muse spike per MUSE_SPIKE.md, 20-minute timebox. Jorge.
7. Google OAuth (gmail.send, calendar.events) for test users, wired to execute route.
8. Deploy preview; run ACCEPTANCE.md Flow A, then Flow B, on the hosted URL.

## Service-access blockers (observed 12:00 PM)

| Service | Observed | Needed to unblock |
| --- | --- | --- |
| GitHub | `jg-ctfbio` has write, not admin; PR #1 merged | Agree branch flow; repo is public |
| Vercel | CLI 58.8 logged in as `jg-ctfbio` (CTFBio account) | Which team/account hosts this; GitHub app on `ShivamSpm` repo needs owner, or deploy via CLI |
| Supabase | Local stack for this repo runs; hosted is Vincent's dedicated instance (D16) | Vincent applies `supabase/migrations`, shares URL + publishable key; secret key into Vercel env |
| OpenRouter | No key in environment | Key with spend cap (Q23); confirm Claude model id available |
| Google | No OAuth client | Dedicated GCP project, consent screen in testing, test users (Q04) |
| Muse | `muse` CLI not installed; Facebook access untested | Run spike; Q01–Q03, Q25 |
| Apify / Bland | No keys | Stretch only |

No accounts were connected, no resources created and nothing was sent or published.

## Completed

- Cloned the empty public teammate repository into the macOS home folder at
  `/Users/jorge/ai-moveout-automation-agent`, outside `ctf_mvp`.
- Verified `origin` and active GitHub identity `jg-ctfbio`; repository reports
  `WRITE` / `push=true`, without admin access.
- Created `codex/hackathon-bootstrap`; the planning commits are now based on real origin/main.
- Added shared `AGENTS.md`, Claude entry instructions, three role definitions for
  each assistant, a small Codex config, ignores and planning documents.
- Recorded web app with chat as first interface; Vinted spelling confirmed.
- Recorded team and 4:30 PM build / 4:30–6 PM presentation schedule.
- Inspected the supplied HEIC whiteboard via a git-ignored local PNG; original unchanged.
- Added source transcription, requirement catalog, user journeys, decisions,
  acceptance scenarios and a Facebook/Muse capability-check plan.
- Confirmed two primary flows: lease/checklist/email/Calendar and
  photos/keep-sell-donate/posting/buyer pickup. Movers/cleaners are stretch.
- Confirmed review policy and anti-eviction meaning: no landlord-side eviction help.
- Confirmed Facebook/Muse priority; access needs testing; live messaging is the goal.

- Added canonical monorepo structure, verified Muse Code SDK/A2A/MCP references,
  three shared development skills and a next-session START_HERE.md.
- Latest user priority is a prompt clean handoff; runtime implementation remains next.

## Current boundaries

Planning commits are prepared on real origin/main for PR publication; no pushes.
No app scaffold, dependencies, migrations, provider
connections or cloud resources created. No emails/calls/listings/bookings executed.
No production readiness claim. No Claude/Codex child sessions launched.

## Next actions

1. Resolve remaining implementation decisions in DECISIONS.md; confirm team owners.
2. Test Facebook/Muse capabilities using MUSE_SPIKE.md; verify dedicated Google access.
3. Publish the prepared feature branch and PR when requested; see PR_PREPARATION.md.
4. Scaffold web chat + auth + saved move and deploy a development preview.
5. Execute the timed plan, keeping actual capability evidence current.

## Pending decisions

Team ownership; dedicated service accounts; synthetic demo data; Muse posting,
message access and task activation; deployed auth configuration; timezone if
different from America/Los_Angeles. See DECISIONS.md for proposed defaults/questions.

## Verification

- Passed: Codex config and all three role TOML files parse; required role fields present.
- Passed: Claude role frontmatter field checks (not a live role invocation).
- Passed: local Markdown links and whitespace checks across all 18 bootstrap files.
- Passed: private-input/credential paths are ignored; shared instructions are trackable.
- Passed: remote read succeeds and still reports no branch heads at final verification.
- Codex Doctor: configuration loaded, auth configured, provider reachable; zero
  failures. It reports an existing global session-history scan warning and notes
  about history size and unrestricted sandbox settings. No global settings changed.
- The system `python3` lacks `tomllib`; validation used installed `python3.11`.
  `codex --strict-config features` is unsupported; config loading was checked with
  Codex Doctor instead.
- Not run: application tests/build, model inference, Claude role invocation,
  GitHub push or live product-provider operations. No implementation exists yet.

## Final requirements/handoff verification

- 76 unique requirement IDs; local Markdown links and configuration syntax checked.
- Three shared skills pass the Skill Creator validator; Claude discovery link resolves.
- Private whiteboard PNG remains ignored and excluded from commits.
- Planning branch rebased onto teammate main; no remote publication.
- No application tests/build or live SDK/connector operations are claimed.

## Concurrent teammate work discovered at final verification

- Remote main: `6004408` (project README). Remote website: `88fc962` (Next.js app
  under `web/`, branded Vacate in its commit). Neither existed at initial clone.
- Planning branch rebased onto main; teammate README preserved. Local main tracks
  origin/main. No teammate application code was modified or merged.
- The `apps/web` monorepo path is a proposal; coordinate migration of the existing
  `web/` branch before moving it. Do not scaffold a competing website blindly.
- Teammate README mentions San Francisco and Muse vision; keep these as teammate
  context and confirm model responsibilities against the user's explicit choices.

## User-approved whiteboard publication

- User requested adding the whiteboard image to the repository. A visually checked
  JPEG is now in `docs/brainstorming/pictures/2026-10-24-moving-assistant-whiteboard.jpg`.
- Original HEIC/private PNG remain unchanged and uncommitted.
- This addition was prepared on `codex/whiteboard-image` in a separate worktree
  while Claude Code was active. Bring its commit into the planning branch before
  publishing the requirements PR; preserve any in-flight Claude changes.
