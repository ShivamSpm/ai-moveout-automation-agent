# October 24 hackathon plan

## Time and outcome

Bootstrap clock was **11:16 AM PDT**; whiteboard work began around 11:30 AM.
The **4:30 PM** build cutoff remains fixed. **4:30–6:00 PM** is for video/presentation.
All times below use America/Los_Angeles, inferred from Jorge's environment.

By 4:30: a hosted development app that completes both confirmed demo journeys with
real persistence and selected live integrations, plus production deployment
instructions. Production readiness is a verification outcome, not a label assigned
because the development URL responds.

## Proposed schedule

| Time | Deliverable | Evidence |
| --- | --- | --- |
| By noon | Confirm owners/access; test Facebook/Muse posting and buyer-message path | Capability evidence; no assumption of remote Muse control |
| By 12:15 | Next.js app, auth, Supabase schema/storage, Vercel development deployment | Login and saved move survive refresh on hosted URL |
| 12:15–1:15 | Chat tools, lease extraction/checklist, photo inventory | Cited obligations and confirmed keep/sell/donate items |
| 1:15–2:15 | Gmail/Calendar plus marketplace publishing | Reviewed email/event and real listing references |
| 2:15–3:00 | Buyer replies/reservation/pickup; integrate both flows | Reviewed communication and consistent item availability |
| 3:00–3:45 | Integrate, recover errors, verify isolation and duplicate prevention | Full journey on hosted development environment |
| 3:45–4:15 | Feature freeze, acceptance run, production configuration/runbook | Passing build, checks and deployment checklist |
| 4:15–4:30 | Freeze tested revision, rehearse/reset synthetic demo | Known-good URL/revision and backup walkthrough |
| 4:30–6:00 | Record video and assemble presentation | Story, architecture, real execution and limitations |

These are target checkpoints, not accomplished work. Adjust to the actual clock;
protect integration and rehearsal. Movers/cleaners are stretch only after both
primary flows are green. No automatic delegation is implied.

## Order of implementation

1. Establish shared types and tool/action contracts before splitting implementation.
2. Build a hosted saved-move journey through auth, database and chat.
3. Add lease/photo inputs and the checklist with provenance.
4. Finish reviewed Gmail send/Calendar creation and real marketplace publication.
5. Finish buyer pickup coordination; then consider services/calls as stretch.
6. Validate and document the exact build that will be demonstrated.

Do not start with a general-purpose multi-agent framework or all-marketplace
publisher. Use a small tool registry and explicit adapters. Each provider spike
gets a 20-minute capability check before committing the team to its live demo.

## Scope cuts if access or time blocks a provider

- Muse cannot be connected: discuss an alternate channel or manual fallback with
  the user. This is an explicit scope reduction, not completed primary B.
- Google OAuth unavailable: preserve drafts but mark primary A's live actions
  blocked; another integration cannot silently substitute for the requested flow.
- Phone provider unavailable: retain the service shortlist and editable call brief.
- Booking API unavailable: provide quote request/handoff; never show "booked"
  without provider confirmation.
- Prioritize both primary flows over polish and service-booking stretch work.

Scope cuts require updating the demo claim and acceptance list. Simulated adapters
must carry visible labels; a simulated path does not meet a live-action criterion.

## Release evidence required by cutoff

- Hosted development URL, tested revision and actual typecheck/lint/test/build results.
- Auth works on the deployed origin; two-user data/file isolation is checked.
- Secrets remain server-side; no personal documents are in the public repository.
- External actions use scoped authorization, idempotency and status reconciliation.
- Both primary flows have evidence against ACCEPTANCE.md; the anti-eviction
  boundary permits voluntary renter moves and rejects landlord eviction workflows.
- Provider webhook validation follows the provider's documented mechanism.
- Exact environment-variable names, migrations, OAuth redirects and deployment
  steps are documented without values, plus rollback and known limitations.
- Production resources are distinct from development resources; actual production
  deployment is a separate action when requested.
