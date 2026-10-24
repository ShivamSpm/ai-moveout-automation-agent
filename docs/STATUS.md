# Session handoff

Updated: October 24, 2026, 12:00 PM PDT. Phase: website integration planned; build next.

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
| Supabase | CLI 2.118; no project chosen | Dedicated project/org (not CTFBio); URL + keys into Vercel env |
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
