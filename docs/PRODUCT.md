# Product brief — v0.2 after whiteboard review

## Confirmed requirements

The user is moving into or out of an apartment and wants an assistant to do the
coordination, not merely provide advice. The first interface is a **web app with
chat**. Claude powers the proposed conversational experience; a Claude plugin
and Muse connector can later reuse the same tools and state.

See [WHITEBOARD.md](WHITEBOARD.md) for source analysis, [REQUIREMENTS.md](REQUIREMENTS.md)
for identified requirements, [JOURNEYS.md](JOURNEYS.md) for interactions and
[DECISIONS.md](DECISIONS.md) for confirmed choices versus proposals.

The full requested scope is:

1. Accept the lease and extract dates, notice requirements, cleaning/repair
   obligations, move-in/out procedures and deposit-related clauses with citations.
2. Create editable checklists, dependencies and reminders for both homes.
3. Draft and, with authorization, send Gmail messages to landlords and providers;
   track replies and help negotiate terms within user-defined boundaries.
4. Schedule Google Calendar events, calls, inspections, handoffs and service visits.
5. Capture/upload apartment and item photos, suggest matching items/rooms,
   document condition and produce a record tied to relevant lease requirements.
6. Classify items as keep/sell/donate; prepare, publish where supported, and manage listings
   across Facebook Marketplace, Craigslist, Buy Nothing and Vinted; add other
   destinations through a capability-based adapter interface.
7. Coordinate buyers, prices and pickup windows; prevent duplicate sale commitments.
8. Find and arrange housekeeping/cleaning, a U-Haul or professional movers,
   including quotes, availability, booking records and follow-up.
9. Use Vercel, Supabase, Apify, OpenRouter and Bland where each serves a concrete
   role. Support calls without pretending a requested call is a confirmed booking.
10. Deliver a hosted functional development environment by 4:30 PM, with a
    documented path to production deployment; reserve 4:30–6:00 PM for demo assets.
11. Prepare freely; require user review for sends, calls, posts and bookings.
12. Enforce the anti-eviction boundary: no landlord-side eviction assistance.
    This is not a requested eviction-support feature; authorized renters' own
    voluntary notices and moving arrangements remain in scope.

## Two primary journeys confirmed for today

"I'm moving out on this date and into this apartment. Here is my lease and photos."

**A. Lease review → checklist → landlord email → Calendar.** Extract cited
obligations, confirm unclear facts, generate an editable checklist, review/send a
landlord email and review/create an event with real provider references.

**B. Photos → keep/sell/donate → marketplace posting → buyer pickup coordination.**
Confirm inventory, choose disposition, review/publish a listing and coordinate
reviewed buyer replies and pickup. Facebook Marketplace through Muse is the priority.
Muse access needs testing; live buyer messaging is the goal, not a verified capability.

**Stretch:** find and schedule movers and cleaners, including calls to providers.

Acceptance criteria:

- User can sign in and return to the same saved move, conversation and checklist.
- Lease findings link to source pages; unreadable or missing clauses are marked.
- Move-in and move-out dates remain distinct, including timezone and dependencies.
- Photo match suggestions require user confirmation and preserve the originals.
- Both primary journeys complete on the hosted development app: Gmail send,
  Calendar creation, real marketplace publication and the agreed pickup flow.
- Listing previews clearly disclose whether publishing is live, manual or unavailable.
- A failed/uncertain action is recoverable without duplicate sends or bookings.
- A second user cannot access the first user's move, files or tool results.

All named channels remain in the vision; Facebook/Muse is the live-demo priority.
Draft/manual fallback is useful output but does not satisfy live-posting or live
messaging goals. Track actual evidence in [ACCEPTANCE.md](ACCEPTANCE.md).

## Repository and developer runtime

User requests one monorepo covering website, tools, Supabase migrations, Muse
developer SDK, Muse connector and Claude/Codex agents and skills. See
[MONOREPO.md](MONOREPO.md) for package ownership and [AGENT_STANDARDS.md](AGENT_STANDARDS.md)
for official Muse Code SDK, A2A and MCP guidance. SDK access and personal
Marketplace access remain separate capabilities.

## Inputs still needed

- Further requirements beyond the supplied whiteboard; keep confirmed/inferred/
  proposed details separate.
- Team agreement on owners, sponsor judging criteria and must-show integrations.
- Available project-specific service accounts, Google OAuth test users and Muse
  access/connector status. Share credentials through secure setup, not git/chat.
- Demo city, move dates, timezone, inventory and a synthetic or redacted lease.
- Whether a real call/email is part of the demo and the consenting recipient.
- Muse account/connector capability evidence for Facebook posting and messaging.
  Service booking is confirmed as stretch.

Vinted is confirmed; the earlier "vintage.com" spelling was corrected by Jorge.
