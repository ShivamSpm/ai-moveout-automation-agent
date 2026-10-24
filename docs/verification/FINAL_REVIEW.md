# Final review — October 24, 2026

## Files changed

Final worktree `verify/final`, based on main `5273821`: application layout/navigation,
services picker lint cleanup, local HTTP journey checker, chat integration-test adapter,
environment documentation, README, START_HERE, AGENTS, DEVELOPMENT, STATUS, ACCEPTANCE,
and this report. Protected Muse/connector implementation paths were not edited.

## Fixes made

- Preserved the local header fix: body fills the viewport; the content region scrolls independently.
- Adapted the real-database chat isolation test to the new agent loop with an injected fake model transport.
  Tests perform no paid model calls.
- Updated the local journey checker for the public example dashboard and port 3105; reject nonlocal URLs.
- Removed an unused component binding and stale scaffold-only documentation.
- Applied already-merged service-selection migration to production after the approved dry run.
  All 13 migration versions match and public/private/storage drift is empty.

## Check output

Release checks are recorded below after execution. Local tests use synthetic example.test identities.
The model and external-send transports in automated tests are substitutes; these results are not live provider receipts.

- `npm ci`: `added 480 packages, and audited 481 packages`; `found 0 vulnerabilities`. ESLint deprecation/install-script policy warnings remain.
- `npx next typegen`: `Types generated successfully`; `npx tsc --noEmit`: exit 0, no diagnostics.
- `npm run lint`: exit 0, no diagnostics.
- `npm test`: `Test Files 42 passed (42)`; `Tests 358 passed (358)`.
- `npm run build`: exit 0, production routes generated.
- `node --env-file=.env.local scripts/local-workflow-check.mjs`: six PASS account/demo separation checks.
- Read-only hosted check using the deferred domain branch script with `--app-only`: `7/7 passed; 0 failed.` TLS, home/login, Agent Card, OAuth metadata, MCP 401 challenge and Supabase discovery.
- `git diff --check`: exit 0, no diagnostics.
- `claude plugin validate .`: `✔ Validation passed`.
- `claude plugin validate ./plugins/moving-assistant`: `✔ Validation passed`, but directory submission reports
  LICENSE_MISSING and warns ICON_MISSING / PRIVACY_URL_MISSING. Runtime manifest validation is not directory approval.
- `supabase db lint --local`: `No schema errors found`.
- `supabase migration list`: 13 local/remote versions agree, through `20261024234500`.
- `supabase db diff --linked --schema public,private,storage`: `No schema changes found`.

## The traceability summary

Every requirement below is retained, including future/stretch scope. Conservative `partial` means
some associated code/tests exist, not that every clause in the requirement has passed. No primary
journey is claimed fully live. Flow A is tested in pieces through local auth, private documents,
lease/tasks and dashboard/chat; Gmail/Calendar stop at drafts. Flow B is tested through inventory,
photo/action binding and simulated connector reports; no real listing, buyer message or pickup was sent.

| ID | Status | Evidence | Gap |
| --- | --- | --- | --- |
| CASE-01 | partial | `web/tests/integration/dashboard-chat.test.ts; start-signup.test.ts` | Saved moves/chat tested; complete correction provenance and multi-move UI not demonstrated. |
| CASE-02 | partial | `web/tests/integration/dashboard-chat.test.ts; start-signup.test.ts` | Saved moves/chat tested; complete correction provenance and multi-move UI not demonstrated. |
| CASE-03 | partial | `web/tests/integration/dashboard-chat.test.ts; start-signup.test.ts` | Saved moves/chat tested; complete correction provenance and multi-move UI not demonstrated. |
| CASE-04 | partial | `web/tests/integration/dashboard-chat.test.ts; start-signup.test.ts` | Saved moves/chat tested; complete correction provenance and multi-move UI not demonstrated. |
| CASE-05 | partial | `web/tests/integration/dashboard-chat.test.ts; start-signup.test.ts` | Saved moves/chat tested; complete correction provenance and multi-move UI not demonstrated. |
| CASE-06 | partial | `web/tests/integration/dashboard-chat.test.ts; start-signup.test.ts` | Saved moves/chat tested; complete correction provenance and multi-move UI not demonstrated. |
| HOUSE-01 | partial | `web/tests/integration/household-documents.test.ts` | Membership isolation tested; full concurrent household chat/item conflict journey unverified. |
| HOUSE-02 | partial | `web/tests/integration/household-documents.test.ts` | Membership isolation tested; full concurrent household chat/item conflict journey unverified. |
| HOUSE-03 | partial | `web/tests/integration/household-documents.test.ts` | Membership isolation tested; full concurrent household chat/item conflict journey unverified. |
| HOUSE-04 | partial | `web/tests/integration/household-documents.test.ts` | Membership isolation tested; full concurrent household chat/item conflict journey unverified. |
| HOUSE-05 | partial | `web/tests/integration/household-documents.test.ts` | Membership isolation tested; full concurrent household chat/item conflict journey unverified. |
| LEASE-01 | partial | `web/tests/unit/lease.test.ts; upload-lease.test.ts; lease-task-sync.test.ts` | PDF extraction and sourced tasks tested; image OCR, exhaustive clause accuracy and replacement-version conflicts incomplete. |
| LEASE-02 | partial | `web/tests/unit/lease.test.ts; upload-lease.test.ts; lease-task-sync.test.ts` | PDF extraction and sourced tasks tested; image OCR, exhaustive clause accuracy and replacement-version conflicts incomplete. |
| LEASE-03 | partial | `web/tests/unit/lease.test.ts; upload-lease.test.ts; lease-task-sync.test.ts` | PDF extraction and sourced tasks tested; image OCR, exhaustive clause accuracy and replacement-version conflicts incomplete. |
| LEASE-04 | partial | `web/tests/unit/lease.test.ts; upload-lease.test.ts; lease-task-sync.test.ts` | PDF extraction and sourced tasks tested; image OCR, exhaustive clause accuracy and replacement-version conflicts incomplete. |
| LEASE-05 | partial | `web/tests/unit/lease.test.ts; upload-lease.test.ts; lease-task-sync.test.ts` | PDF extraction and sourced tasks tested; image OCR, exhaustive clause accuracy and replacement-version conflicts incomplete. |
| LEASE-06 | partial | `web/tests/unit/lease.test.ts; upload-lease.test.ts; lease-task-sync.test.ts` | PDF extraction and sourced tasks tested; image OCR, exhaustive clause accuracy and replacement-version conflicts incomplete. |
| PLAN-01 | partial | `web/tests/unit/lease-task-sync.test.ts; integration/dashboard-chat.test.ts` | Saved checklist/source display tested; dependency rescheduling preview and quiet hours incomplete. |
| PLAN-02 | partial | `web/tests/unit/lease-task-sync.test.ts; integration/dashboard-chat.test.ts` | Saved checklist/source display tested; dependency rescheduling preview and quiet hours incomplete. |
| PLAN-03 | partial | `web/tests/unit/lease-task-sync.test.ts; integration/dashboard-chat.test.ts` | Saved checklist/source display tested; dependency rescheduling preview and quiet hours incomplete. |
| PLAN-04 | partial | `web/tests/unit/lease-task-sync.test.ts; integration/dashboard-chat.test.ts` | Saved checklist/source display tested; dependency rescheduling preview and quiet hours incomplete. |
| PLAN-05 | partial | `web/tests/unit/lease-task-sync.test.ts; integration/dashboard-chat.test.ts` | Saved checklist/source display tested; dependency rescheduling preview and quiet hours incomplete. |
| MAIL-01 | blocked: needs Google OAuth owner | `web/tests/unit/drafts.test.ts; web/src/server/tools` | Draft contract exists; Gmail sending/reading and real delivery reference unverified. |
| MAIL-02 | blocked: needs Google OAuth owner | `web/tests/unit/drafts.test.ts; web/src/server/tools` | Draft contract exists; Gmail sending/reading and real delivery reference unverified. |
| MAIL-03 | blocked: needs Google OAuth owner | `web/tests/unit/drafts.test.ts; web/src/server/tools` | Draft contract exists; Gmail sending/reading and real delivery reference unverified. |
| MAIL-04 | blocked: needs Google OAuth owner | `web/tests/unit/drafts.test.ts; web/src/server/tools` | Draft contract exists; Gmail sending/reading and real delivery reference unverified. |
| NEG-01 | partial | `web/src/server/tools; docs/INTEGRATIONS.md` | Draft/review foundation only; concession and negotiation-history journey incomplete. |
| NEG-02 | partial | `web/src/server/tools; docs/INTEGRATIONS.md` | Draft/review foundation only; concession and negotiation-history journey incomplete. |
| NEG-03 | partial | `web/src/server/tools; docs/INTEGRATIONS.md` | Draft/review foundation only; concession and negotiation-history journey incomplete. |
| CAL-01 | blocked: needs Google OAuth owner | `docs/INTEGRATIONS.md; web/src/contracts/index.ts` | No verified live Calendar adapter/event receipt or conflict reconciliation. |
| CAL-02 | blocked: needs Google OAuth owner | `docs/INTEGRATIONS.md; web/src/contracts/index.ts` | No verified live Calendar adapter/event receipt or conflict reconciliation. |
| CAL-03 | blocked: needs Google OAuth owner | `docs/INTEGRATIONS.md; web/src/contracts/index.ts` | No verified live Calendar adapter/event receipt or conflict reconciliation. |
| CAL-04 | blocked: needs Google OAuth owner | `docs/INTEGRATIONS.md; web/src/contracts/index.ts` | No verified live Calendar adapter/event receipt or conflict reconciliation. |
| PHOTO-01 | partial | `web/tests/integration/item-photos.test.ts; unit/item-analysis.test.ts` | Private originals, hashes and unconfirmed vision suggestions tested; HEIC, derivatives, room comparison and evidence export incomplete. |
| PHOTO-02 | partial | `web/tests/integration/item-photos.test.ts; unit/item-analysis.test.ts` | Private originals, hashes and unconfirmed vision suggestions tested; HEIC, derivatives, room comparison and evidence export incomplete. |
| PHOTO-03 | partial | `web/tests/integration/item-photos.test.ts; unit/item-analysis.test.ts` | Private originals, hashes and unconfirmed vision suggestions tested; HEIC, derivatives, room comparison and evidence export incomplete. |
| PHOTO-04 | partial | `web/tests/integration/item-photos.test.ts; unit/item-analysis.test.ts` | Private originals, hashes and unconfirmed vision suggestions tested; HEIC, derivatives, room comparison and evidence export incomplete. |
| PHOTO-05 | partial | `web/tests/integration/item-photos.test.ts; unit/item-analysis.test.ts` | Private originals, hashes and unconfirmed vision suggestions tested; HEIC, derivatives, room comparison and evidence export incomplete. |
| PHOTO-06 | partial | `web/tests/integration/item-photos.test.ts; unit/item-analysis.test.ts` | Private originals, hashes and unconfirmed vision suggestions tested; HEIC, derivatives, room comparison and evidence export incomplete. |
| ITEM-01 | partial | `web/tests/unit/inventory-contract.test.ts; integration/item-photos.test.ts` | Inventory dispositions/photo attachment tested; merge/split and packing destination workflow incomplete. |
| ITEM-02 | partial | `web/tests/unit/inventory-contract.test.ts; integration/item-photos.test.ts` | Inventory dispositions/photo attachment tested; merge/split and packing destination workflow incomplete. |
| ITEM-03 | partial | `web/tests/unit/inventory-contract.test.ts; integration/item-photos.test.ts` | Inventory dispositions/photo attachment tested; merge/split and packing destination workflow incomplete. |
| ITEM-04 | partial | `web/tests/unit/inventory-contract.test.ts; integration/item-photos.test.ts` | Inventory dispositions/photo attachment tested; merge/split and packing destination workflow incomplete. |
| LIST-01 | partial | `web/tests/integration/muse-bridge.test.ts; unit/selling-policy.test.ts` | Reviewed listing/handoff foundation tested; no live post in this review; price-drop review and cross-channel reconciliation gaps. |
| LIST-02 | partial | `web/tests/integration/muse-bridge.test.ts; unit/selling-policy.test.ts` | Reviewed listing/handoff foundation tested; no live post in this review; price-drop review and cross-channel reconciliation gaps. |
| LIST-03 | partial | `web/tests/integration/muse-bridge.test.ts; unit/selling-policy.test.ts` | Reviewed listing/handoff foundation tested; no live post in this review; price-drop review and cross-channel reconciliation gaps. |
| LIST-04 | partial | `web/tests/integration/muse-bridge.test.ts; unit/selling-policy.test.ts` | Reviewed listing/handoff foundation tested; no live post in this review; price-drop review and cross-channel reconciliation gaps. |
| LIST-05 | partial | `web/tests/integration/muse-bridge.test.ts; unit/selling-policy.test.ts` | Reviewed listing/handoff foundation tested; no live post in this review; price-drop review and cross-channel reconciliation gaps. |
| LIST-06 | partial | `web/tests/integration/muse-bridge.test.ts; unit/selling-policy.test.ts` | Reviewed listing/handoff foundation tested; no live post in this review; price-drop review and cross-channel reconciliation gaps. |
| PICK-01 | partial | `web/src/server/selling/telegram-sales.ts; web/tests/integration/muse-bridge.test.ts` | Telegram automatic replies bypass individual review; timeout handling and sold-versus-reserved semantics need repair. No live pickup verified. |
| PICK-02 | partial | `web/src/server/selling/telegram-sales.ts; web/tests/integration/muse-bridge.test.ts` | Telegram automatic replies bypass individual review; timeout handling and sold-versus-reserved semantics need repair. No live pickup verified. |
| PICK-03 | partial | `web/src/server/selling/telegram-sales.ts; web/tests/integration/muse-bridge.test.ts` | Telegram automatic replies bypass individual review; timeout handling and sold-versus-reserved semantics need repair. No live pickup verified. |
| PICK-04 | partial | `web/src/server/selling/telegram-sales.ts; web/tests/integration/muse-bridge.test.ts` | Telegram automatic replies bypass individual review; timeout handling and sold-versus-reserved semantics need repair. No live pickup verified. |
| PICK-05 | partial | `web/src/server/selling/telegram-sales.ts; web/tests/integration/muse-bridge.test.ts` | Telegram automatic replies bypass individual review; timeout handling and sold-versus-reserved semantics need repair. No live pickup verified. |
| PICK-06 | partial | `web/src/server/selling/telegram-sales.ts; web/tests/integration/muse-bridge.test.ts` | Telegram automatic replies bypass individual review; timeout handling and sold-versus-reserved semantics need repair. No live pickup verified. |
| SERV-01 | simulated | `web/tests/unit/simulated-booking.test.ts; cleaning.test.ts; moving.test.ts; landlord-call.test.ts` | Catalog selection persists; simulated confirmation is not provider booking. No real call made. |
| SERV-02 | simulated | `web/tests/unit/simulated-booking.test.ts; cleaning.test.ts; moving.test.ts; landlord-call.test.ts` | Catalog selection persists; simulated confirmation is not provider booking. No real call made. |
| SERV-03 | simulated | `web/tests/unit/simulated-booking.test.ts; cleaning.test.ts; moving.test.ts; landlord-call.test.ts` | Catalog selection persists; simulated confirmation is not provider booking. No real call made. |
| SERV-04 | simulated | `web/tests/unit/simulated-booking.test.ts; cleaning.test.ts; moving.test.ts; landlord-call.test.ts` | Catalog selection persists; simulated confirmation is not provider booking. No real call made. |
| SERV-05 | simulated | `web/tests/unit/simulated-booking.test.ts; cleaning.test.ts; moving.test.ts; landlord-call.test.ts` | Catalog selection persists; simulated confirmation is not provider booking. No real call made. |
| SERV-06 | simulated | `web/tests/unit/simulated-booking.test.ts; cleaning.test.ts; moving.test.ts; landlord-call.test.ts` | Catalog selection persists; simulated confirmation is not provider booking. No real call made. |
| SCOPE-01 | partial | `web/tests/unit/scope.test.ts; connector.test.ts; agent-loop.test.ts` | Renter allow/refuse tests pass; keyword checks do not prove resistance to every adversarial formulation. |
| SCOPE-02 | partial | `web/tests/unit/scope.test.ts; connector.test.ts; agent-loop.test.ts` | Renter allow/refuse tests pass; keyword checks do not prove resistance to every adversarial formulation. |
| SCOPE-03 | partial | `web/tests/unit/scope.test.ts; connector.test.ts; agent-loop.test.ts` | Renter allow/refuse tests pass; keyword checks do not prove resistance to every adversarial formulation. |
| SCOPE-04 | partial | `web/tests/unit/scope.test.ts; connector.test.ts; agent-loop.test.ts` | Renter allow/refuse tests pass; keyword checks do not prove resistance to every adversarial formulation. |
| SCOPE-05 | partial | `web/tests/unit/scope.test.ts; connector.test.ts; agent-loop.test.ts` | Renter allow/refuse tests pass; keyword checks do not prove resistance to every adversarial formulation. |
| EXEC-01 | partial | `web/tests/integration/muse-bridge.test.ts; claude-connector.test.ts; web/src/server/selling/telegram-sales.ts` | Durable action/hash/claim foundation tested; Telegram automatic sends/edits and ambiguous pickup-send failure remain gaps. |
| EXEC-02 | partial | `web/tests/integration/muse-bridge.test.ts; claude-connector.test.ts; web/src/server/selling/telegram-sales.ts` | Durable action/hash/claim foundation tested; Telegram automatic sends/edits and ambiguous pickup-send failure remain gaps. |
| EXEC-03 | partial | `web/tests/integration/muse-bridge.test.ts; claude-connector.test.ts; web/src/server/selling/telegram-sales.ts` | Durable action/hash/claim foundation tested; Telegram automatic sends/edits and ambiguous pickup-send failure remain gaps. |
| EXEC-04 | partial | `web/tests/integration/muse-bridge.test.ts; claude-connector.test.ts; web/src/server/selling/telegram-sales.ts` | Durable action/hash/claim foundation tested; Telegram automatic sends/edits and ambiguous pickup-send failure remain gaps. |
| EXEC-05 | partial | `web/tests/integration/muse-bridge.test.ts; claude-connector.test.ts; web/src/server/selling/telegram-sales.ts` | Durable action/hash/claim foundation tested; Telegram automatic sends/edits and ambiguous pickup-send failure remain gaps. |
| DATA-01 | partial | `web/tests/integration/household-documents.test.ts; cleaning-owner.test.ts; item-photos.test.ts` | Owner isolation tested locally; complete retention/export and provider log redaction audit unfinished. |
| DATA-02 | partial | `web/tests/integration/household-documents.test.ts; cleaning-owner.test.ts; item-photos.test.ts` | Owner isolation tested locally; complete retention/export and provider log redaction audit unfinished. |
| DATA-03 | partial | `web/tests/integration/household-documents.test.ts; cleaning-owner.test.ts; item-photos.test.ts` | Owner isolation tested locally; complete retention/export and provider log redaction audit unfinished. |
| OPS-01 | partial | `docs/verification/FINAL_REVIEW.md; web/tests/unit/spend-ledger.test.ts` | Build/tests and hosted smoke checked; full live journeys, monitoring and durable cross-instance spend limit incomplete. |
| OPS-02 | partial | `docs/verification/FINAL_REVIEW.md; web/tests/unit/spend-ledger.test.ts` | Build/tests and hosted smoke checked; full live journeys, monitoring and durable cross-instance spend limit incomplete. |
| OPS-03 | partial | `docs/verification/FINAL_REVIEW.md; web/tests/unit/spend-ledger.test.ts` | Build/tests and hosted smoke checked; full live journeys, monitoring and durable cross-instance spend limit incomplete. |
| OPS-04 | partial | `docs/verification/FINAL_REVIEW.md; web/tests/unit/spend-ledger.test.ts` | Build/tests and hosted smoke checked; full live journeys, monitoring and durable cross-instance spend limit incomplete. |
| TECH-01 | implemented+tested | `web/package.json; supabase/migrations; plugin validation; full build` | No monorepo boundary gap identified. |
| TECH-02 | partial | `web/package.json; web/tests/integration/claude-connector.test.ts; muse-bridge.test.ts` | Pinned SDK/contracts tested locally; live consumer Muse access and directory submission remain unverified. |
| TECH-03 | partial | `web/package.json; web/tests/integration/claude-connector.test.ts; muse-bridge.test.ts` | Pinned SDK/contracts tested locally; live consumer Muse access and directory submission remain unverified. |

| Scenario | Status | Evidence | Gap |
| --- | --- | --- | --- |
| A01 | partial | `unit/lease.test.ts; integration/household-documents.test.ts` | Known-fixture/private-storage pieces tested; full browser upload not repeated. |
| A02 | partial | `integration/dashboard-chat.test.ts; unit/lease-task-sync.test.ts` | Dependencies not fully exercised. |
| A03 | partial | `integration/muse-bridge.test.ts` | Hash invalidation tested; Gmail adapter absent. |
| A04 | blocked: needs Google OAuth owner | `unit/drafts.test.ts` | No real send. |
| A05 | blocked: needs Google OAuth owner | `docs/INTEGRATIONS.md` | No real event. |
| A06 | partial | `integration/item-photos.test.ts; unit/inventory-contract.test.ts` | Merge/split and HEIC incomplete. |
| A07 | implemented-untested | `web/src/server/selling/telegram-sales.ts` | No authorized live publication in this audit. |
| A08 | partial | `integration/muse-bridge.test.ts` | Telegram reservation/other-buyer semantics need follow-up. |
| A09 | partial | `web/src/server/selling/telegram-sales.ts` | Exact-address review exists; automatic buyer replies violate individual review policy. |
| A10 | blocked: needs Google OAuth owner | `docs/INTEGRATIONS.md` | Calendar execution unavailable. |
| A11 | partial | `integration/dashboard-chat.test.ts; muse-bridge.test.ts` | Local persistence tested, full hosted refresh/action journey not repeated. |
| A12 | partial | `integration/muse-bridge.test.ts` | Telegram confirmDeal marks uncertain sends failed and releases reservation; reconcile before retry is needed. |
| A13 | implemented+tested | `integration/cleaning-owner.test.ts; household-documents.test.ts; item-photos.test.ts` | Local real-database isolation; no production-account mutations during this audit. |
| A14 | partial | `unit/agent-loop.test.ts; connector.test.ts` | Structural validation tested; not an exhaustive adversarial evaluation. |
| A15 | implemented+tested | `unit/scope.test.ts; connector.test.ts` | Tested known landlord-side requests; classifier limitations remain. |
| A16 | partial | `unit/scope.test.ts; drafts.test.ts` | Allowed renter scope tested; actual Gmail send unavailable. |
| A17 | partial | `unit/lease-task-sync.test.ts` | No complete dependent event-change preview. |
| A18 | partial | `integration/muse-bridge.test.ts; unit/simulated-booking.test.ts` | Simulation labels tested; live capability proof remains separate. |
| H01 | partial | `integration/household-documents.test.ts` | Database membership tested; full invite browser journey not repeated. |
| H02 | partial | `integration/household-documents.test.ts` | Concurrent edit/conflict and shared agent journey incomplete. |
| H03 | implemented+tested | `integration/household-documents.test.ts` | Local member/storage isolation tests pass. |
| H04 | partial | `integration/household-documents.test.ts; muse-bridge.test.ts` | Membership restrictions tested; complete concurrent delegated execution unverified. |

## Items blocked on a person or account

1. **Jorge + Shivam: Telegram review policy.** Remove automatic buyer replies/public price edits or implement
   exact reviewed payloads before claiming all sends/posts require review. Repair ambiguous confirmation-send
   outcomes: retain reservation and unknown status until reconciliation; reserved does not mean sold.
   The nonce fix does not fix these separate legacy behaviors. No exception was granted in this session.
2. **Shivam: migration automation.** Add Actions `SUPABASE_ACCESS_TOKEN` from a dedicated-org member and make
   the migration check required. This release applied migrations via CLI; do not attribute it to CI.
3. **Jorge/team Google Cloud owner:** configure Gmail/Calendar OAuth client, scopes, consent/test users;
   implement and verify approved send/event adapters. Sign-in OAuth is a different capability.
4. **Jorge/team deployment owner:** verify Telegram bot username/token/channel/webhook secret and CRON_SECRET
   in the shared Vercel project. Do not exercise live automatic selling until review-policy gaps are resolved.
5. **ibm777p2 / Supabase org admin:** free a project slot or approve a plan for isolated preview/staging data.
6. **Shivam:** disconnect the personal Vercel project from this repo; keep the shared project canonical.
7. **Jorge, deferred:** buy vacate.dev only when needed. Then provide the Cloudflare zone, scoped token and
   team forwarding addresses for support@. Choose custom SMTP later. None blocks the existing URL demo;
   built-in auth email delivery limits still apply. No wildcard redirects or hosted auth changes made.
8. **Repo owner:** choose a license and publish a truthful privacy policy before plugin-directory submission;
   provide an icon. This audit does not choose a license on the owners' behalf.

## Anything we were unsure about

No live consumer Muse/Facebook posting session or external-send journey was run. No claim is made that
all pages/themes passed an accessibility audit, that arbitrary adversarial instructions are blocked,
or that every external provider error is redacted. Automatic Telegram messaging is a known release
limitation rather than a passed review-policy test. Deferred domain PR #34 is intentionally excluded.
Old whiteboard staging content is superseded by the sanitized image already on main.

Official documentation consulted for compatibility (not proof of runtime behavior):
[Next.js caching](https://nextjs.org/docs/app/getting-started/cache-components),
[Next.js proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy),
[React Suspense](https://react.dev/reference/react/Suspense),
[Supabase SSR](https://supabase.com/docs/guides/auth/server-side/nextjs),
[MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools),
[A2A](https://a2a-protocol.org/latest/specification/),
[Claude plugins](https://code.claude.com/docs/en/plugins-reference).
