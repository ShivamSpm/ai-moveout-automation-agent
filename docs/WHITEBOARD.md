# Whiteboard analysis — October 24, 2026

## Source and handling

Source: user-provided `IMG_4268.heic`. Inspected through a local PNG conversion at
`private/whiteboard/IMG_4268.png`. At the user's subsequent explicit request, a
[shareable JPEG](brainstorming/pictures/2026-10-24-moving-assistant-whiteboard.jpg)
is included in `docs/brainstorming/pictures/`. The private PNG remains ignored and
the original in Messages was not changed. This document records text and interpretation,
not a claim that every brainstormed feature was specified on the board.

## What is visible

| ID | Board text / shape, with spelling normalized | Interpretation and confidence |
| --- | --- | --- |
| W01 | "Move Out / Move In" | Both ends of a renter's transition. High confidence. |
| W02 | "User", "Email" arrow to "Landlord", curved return arrow | Two-way landlord communication. High confidence in labels; return-arrow meaning is inferred. |
| W03 | Box labeled "agent" near user; "Creates checklist" | Assistant creates a checklist. High confidence. |
| W04 | "Docs related move out things" above a second "agent" box | Documents inform moving tasks. Wording readable; exact data-flow direction is inferred. |
| W05 | Arrows toward "Rents Uhaul" and "Contact move out companies" | Coordinate moving services. High confidence. |
| W06 | "Selling/Donating personal items" | Help dispose of belongings. High confidence. |
| W07 | "Craigslist", "Buy Nothing" | Named listing/giving destinations. High confidence. |
| W08 | "Marketplace for services" | Service discovery/coordination; whether an internal marketplace is intended was not specified. |
| W09 | "Bland - Voice" | Voice/calling provider. High confidence. |
| W10 | "Vercel", "Muse", "Supabase", "Apify" | Proposed platform/integration choices; responsibilities are not spelled out. |
| W11 | "OpenRouter - Vision"; "Negotiation" written nearby | Vision and negotiation capabilities. Exact grouping of negotiation with OpenRouter is uncertain. |
| W12 | "Anti-eviction" at lower left | Meaning clarified by user: guardrail against landlord-side eviction assistance. |
| W13 | Two boxes labeled "agent", linked around user/documents | Coordinated functions; does not establish a requirement for separate models, processes or autonomous agents. |

## User clarifications after inspection

1. **Anti-eviction is an exclusion:** the agent must not support eviction from a
   landlord's perspective. It is not a newly requested eviction-support module.
2. **Primary demo A:** lease review → checklist → landlord email → calendar.
3. **Primary demo B:** photos → keep/sell/donate → marketplace posting → pickup
   coordination with buyers.
4. **Stretch:** find and schedule movers and cleaners.
5. **Action policy:** prepare freely; user reviews sends, calls, posts and bookings.
6. **Marketplace priority:** Facebook Marketplace through Muse; Muse access needs
   testing and live messaging is the goal.

Earlier confirmed context: web app with chat first; Vinted, not vintage.com;
Gmail/Google Calendar; four teammates; 4:30 PM build deadline.

## Product interpretation

The core product is a renter's moving workspace: shared facts and documents feed
two linked workflows, lease completion and belongings disposition. Chat should
create inspectable task cards and action drafts, then show results and follow-up.
It should retain state when the browser closes.

A single coordinator with specialized tools is a proposed implementation. "Agent"
on the board does not require a general-purpose agent-to-agent framework today.
The future Muse bridge is one execution adapter whose actual account capabilities
must be verified. The chosen web-first interface supersedes earlier Claude-first
interface brainstorming, while retaining Claude as the proposed model.

## Details added by analysis, not literally on the board

Source citations; versioned lease findings; deadlines and dependency recalculation;
photo provenance; confirmed item matching; offer/reservation state; single-buyer
commitment; per-action review; recoverable execution; private files; export and
account disconnection. See REQUIREMENTS.md for provenance and delivery labels.

No inference of legal deadlines, automatic booking authority, official marketplace
API access, or approved team assignments is made from the board.
