# Decisions and open requirements

Updated October 24, 2026 after whiteboard review. "Proposed" is not an approval.

## Confirmed decisions

| ID | Decision | Source |
| --- | --- | --- |
| D01 | Web app with chat is the first product interface. | User reply |
| D02 | Primary A: lease review → checklist → landlord email → Calendar. | User reply during whiteboard analysis |
| D03 | Primary B: photos → keep/sell/donate → marketplace posting → buyer pickup. | User reply during whiteboard analysis |
| D04 | Movers/cleaners discovery and scheduling are stretch goals today. | User reply |
| D05 | Prepare freely; review sends, calls, posts and bookings. | User reply |
| D06 | Anti-eviction means no landlord-perspective eviction assistance. | User clarification of W12 |
| D07 | Vinted is the intended platform. | User spelling correction |
| D08 | Team is Vincent, Steven, Shivam and Jorge; build cutoff 4:30 PM, presentation/video 4:30–6 PM. | User reply |
| D09 | Independent repository under Jorge's home folder. | User request |
| D10 | Facebook Marketplace through Muse is the priority live marketplace path. | User reply during whiteboard analysis |
| D11 | Muse access needs testing; live buyer messaging is the goal. | User reply; no working account capability established |

| D12 | One monorepository owns website, tools, Supabase migrations, Muse connector and development agents/skills. | User latest direction |
| D13 | Build with the developer Muse SDK and current A2A standards. | User latest direction; official Muse Code SDK identified |
| D14 | Prepare a clean Claude Code handoff and local PR-ready branch promptly. | User latest direction |

## Proposed defaults, pending implementation agreement

One TypeScript monorepo using the organization in MONOREPO.md; one coordinating
chat plus a Muse Code SDK worker boundary; A2A and MCP as described in
AGENT_STANDARDS.md; persistent
task/action state; Claude model via OpenRouter; Supabase private documents and
ownership-based data access; a shared reviewed-action service reusable by future
Claude/Muse connectors. Initial single-renter ownership; household collaboration
later. Pacific timezone follows Jorge's environment but event timezone is unconfirmed.

## Blocking decisions for the two live flows

| ID | Question | Proposed starting point / consequence |
| --- | --- | --- |
| Q01 | Can Facebook/Muse meet the live publication requirement today? | Priority is confirmed; run MUSE_SPIKE.md and return actual evidence. Other channels are not silently substituted. |
| Q02 | Is Muse account/connector access usable? | User says it needs testing; identify session/connectors available and actual invocation path. |
| Q03 | Can buyer messages be read and reviewed replies sent live? | Live messaging is the confirmed goal. Manual inquiry entry is only a disclosed fallback requiring scope agreement. |
| Q04 | Which dedicated Google account and OAuth test users can be used? | A consenting test recipient and test calendar; no credentials in planning docs. |
| Q05 | Which Vercel/Supabase/OpenRouter projects and accounts does the team already control? | Dedicated hackathon resources; verify access and model availability before scaffolding adapters. |
| Q06 | Who owns each workstream and shared contracts? | TEAM.md is a proposal; confirm before concurrent edits. |
| Q07 | Which city/jurisdiction, move dates and source lease will the demo use? | Synthetic fixture; real jurisdiction only if legal facts are being verified. |

## Product decisions that can use defaults for today

| ID | Question | Proposed default / later expansion |
| --- | --- | --- |
| Q08 | Tenant vs household permissions? | One renter owns each move; no implicit roommate authority. |
| Q09 | Both old/new leases on day one? | One lease and two move dates first; label which home it governs. |
| Q10 | What is "negotiation" today? | Draft landlord requests and buyer responses; no autonomous concessions or acceptance. |
| Q11 | Calendar deadline or actual appointment? | One reviewed event; appointments require participant confirmation distinct from event creation. |
| Q12 | Sale price setting and donation fallback? | User confirms price/free status; no automatic price cuts or donate-after-date rule until chosen. |
| Q13 | Pickup address policy? | General area in listing, exact location shared only in a reviewed recipient-specific action. |
| Q14 | Supported files and limits? | PDF + JPEG/PNG/HEIC conversion; choose explicit size/page/count limits during implementation. |
| Q15 | Vision scope? | Item identification/description and confirmed photo grouping first; before/after evidence comparison next. |
| Q16 | Payment handling? | Record user-confirmed amounts; no escrow, payment collection or card data in chat. |
| Q17 | Service marketplace meaning? | Search existing providers; no internal marketplace with provider onboarding today. |
| Q18 | Storage retention/export? | Private storage and revocation first; select a documented retention policy before production use. |
| Q19 | Notifications? | In-app status first; external reminders require configured delivery and authorization. |
| Q20 | Languages/accessibility? | Plain-language English, mobile-friendly review cards; ask about additional languages and accessibility needs. |
| Q21 | Claude plugin in today's demo? | Shared architecture only unless both web flows are complete early. |
| Q22 | What counts as production-ready? | Tested hosted dev plus build/config/migration/deployment evidence; unknown integrations remain blockers, not "ready" labels. |
| Q23 | What are per-user/demo spend and call-duration limits? | Set numeric caps before live model/Actor/call execution; no unlimited retries or implicit paid bookings. |
| Q24 | Product name and demo visual identity? | Working name "Moving assistant"; no naming decision implied by repository name. |

## Changes from the bootstrap plan

- Replaced "at least one external action" with two required live user journeys.
- Marketplace publication and pickup coordination are primary, not optional polish.
- Mover/cleaner calls and bookings are stretch, protecting time for the primary flows.
- Removed the initial inference that anti-eviction requests a tenant-support feature.
- Recorded review-first external action policy as a confirmed user decision.
- Confirmed Facebook/Muse priority and live messaging goal, with access untested.
