# Requirements catalog — v0.2

This is the detailed build reference. Nothing here is claimed to be implemented.
User decisions take precedence over proposed elaborations.

## Legend and demo contract

Source: **U** = explicit user requirement/clarification; **Wnn** = whiteboard item;
**P** = proposed detail added to make behavior concrete. Multiple sources mean
the feature is requested but some implementation details are proposed.

Priority: **MUST** = required for the two confirmed demo flows or their basic
correctness; **NEXT** = useful completion of the broader product; **STRETCH** =
explicitly optional today. MUST rows marked P are recommended acceptance details,
not a claim that the user specified every interaction.

The demo needs both (A) lease → checklist → reviewed email → calendar and
(B) photos → keep/sell/donate → reviewed posting → buyer pickup coordination.
At least one selected marketplace must publish for B to count as fully live.
Facebook Marketplace through Muse is the user's priority; access needs testing
and live buyer messaging is the goal. All named channels remain in broader scope.
Draft/manual fallbacks must be visible and do not satisfy a live-posting claim.

## Renter, move and conversation

| ID | Priority/source | Requirement and observable acceptance |
| --- | --- | --- |
| CASE-01 | MUST U/W01/P | Create a move with move-out and move-in dates, timezone and origin/destination; unknown destination is allowed without inventing it. |
| CASE-02 | MUST P | Capture renter name, landlord contact, relevant apartment, move goal and constraints; missing fields block only dependent actions. |
| CASE-03 | MUST U/P | Chat and dashboard share saved move state; a refresh retains messages, checklist, items and pending actions. |
| CASE-04 | MUST P | Chat distinguishes proposal, user-confirmed fact and provider result; corrections update the affected records visibly. |
| CASE-05 | NEXT P | Household/roommate collaboration is invite-based with explicit ownership; shared tenancy never implies authority over another person's belongings. |
| CASE-06 | NEXT P | Multiple moves and two leases can coexist; each document/action belongs to the correct home and move. |

## Lease agreement review

| ID | Priority/source | Requirement and observable acceptance |
| --- | --- | --- |
| LEASE-01 | MUST U/W04/P | Upload a PDF or supported image; show processing, success and actionable failure states; preserve the original privately. |
| LEASE-02 | MUST U/P | Extract lease dates, notice clauses, cleaning/repair requirements, inspection/key-return instructions and deposit-related terms with page/section references. |
| LEASE-03 | MUST P | Separate exact source text, extracted meaning and suggested task; missing/illegible/conflicting clauses appear as unresolved. |
| LEASE-04 | MUST P | User confirms critical dates/contact details before downstream actions; show deadline inputs and calculation rather than an unexplained date. |
| LEASE-05 | MUST P | A lease term is not a verified statement of applicable law. Do not invent statutory periods, enforceability or notice delivery rules. |
| LEASE-06 | NEXT P | Replacement leases/addenda version findings, flag conflicts and identify affected pending tasks/drafts; retain source history. |

## Checklist, dependencies and schedule

| ID | Priority/source | Requirement and observable acceptance |
| --- | --- | --- |
| PLAN-01 | MUST U/W03 | Generate an editable checklist from the lease and move dates; separate move-in/out tasks and show sources. |
| PLAN-02 | MUST P | Each task has a due date or an explicit missing-date state, status, dependency and next action. |
| PLAN-03 | MUST P | Distinguish task completion by user from external confirmation; submitted email is not landlord agreement. |
| PLAN-04 | MUST P | Changing a move date previews affected tasks/events; do not silently move an existing appointment or resend an approved message. |
| PLAN-05 | NEXT P | Reminders, overdue tasks and blocked dependencies surface in a "Needs you / Waiting / Done" view with quiet-hours preferences. |

## Landlord email and negotiation

| ID | Priority/source | Requirement and observable acceptance |
| --- | --- | --- |
| MAIL-01 | MUST U/W02 | Draft a landlord email using confirmed dates and lease findings; show recipient, subject, body and attachments for review. |
| MAIL-02 | MUST U/P | Send only after review/approval of that version; show provider acceptance/reference and avoid duplicate sends. |
| MAIL-03 | MUST P | Email delivery is not proof of legally effective lease notice; respect the specified notice channel and flag unverified requirements. |
| MAIL-04 | NEXT U/W02/P | Read only authorized relevant threads, summarize requests, associate replies with the move, and prepare reviewed responses. |
| NEG-01 | NEXT U/W11/P | Capture negotiation objective, desired outcome, acceptable concessions and prohibited commitments before drafting a proposal. |
| NEG-02 | MUST U/P | Do not accept fees, waive claims, concede damages or commit to new terms without the user's reviewed decision. |
| NEG-03 | NEXT P | Record offer, counteroffer and confirmed outcome separately; unsupported or ambiguous agreement remains pending. |

## Google Calendar

| ID | Priority/source | Requirement and observable acceptance |
| --- | --- | --- |
| CAL-01 | MUST U/P | Create a reviewed deadline or appointment with explicit timezone, start/end or all-day dates, calendar and reminders. |
| CAL-02 | MUST U/P | Show attendees and whether invitations will be sent; user approval includes recipient list and event details. |
| CAL-03 | MUST P | Display the resulting event ID/link; repeated tool execution does not create a second event. |
| CAL-04 | NEXT P | Check availability/conflicts where authorized; edits/cancellations are separate reviewed actions, with stale external changes reconciled. |

## Photos, apartment condition and item inventory

| ID | Priority/source | Requirement and observable acceptance |
| --- | --- | --- |
| PHOTO-01 | MUST U/W11/P | Accept phone photos; explicitly support or clearly convert HEIC as well as chosen JPEG/PNG formats; show file limits and upload progress. |
| PHOTO-02 | MUST U/P | Suggest item/room labels and visible condition; user can correct or confirm them before using them in a listing or evidence record. |
| PHOTO-03 | MUST U/P | Preserve immutable originals; listing derivatives are separate and exclude unnecessary identifying metadata/background details. |
| PHOTO-04 | NEXT U/P | Match move-in/out room photos with user confirmation; show visible differences and uncertainty, without asserting who caused damage. |
| PHOTO-05 | NEXT U/P | Link condition photos/cleaning receipts to relevant lease tasks; export a dated evidence index with source references. |
| PHOTO-06 | MUST P | Never infer exact dimensions, brand, hidden defects or legal proof from an image alone; upload timestamps are not asserted capture times. |
| ITEM-01 | MUST U | User chooses **keep, sell or donate** per item, including an undecided state. Kept items are excluded from sale/giving queues. |
| ITEM-02 | MUST P | Capture quantity, ownership, condition, dimensions if known and pickup constraints; multiple photos can belong to one item. |
| ITEM-03 | MUST P | Distinguish two similar items from duplicate photos; user can merge/split inventory entries without losing originals. |
| ITEM-04 | NEXT P | Kept items become a packing/destination-room list; incomplete item measurements are surfaced to movers. |

## Marketplaces, offers and pickup

| ID | Priority/source | Requirement and observable acceptance |
| --- | --- | --- |
| LIST-01 | MUST U/W06/W07 | Prepare channel-specific sale/donation listings with selected photos, title, description, condition, price/free designation and general location. |
| LIST-02 | MUST U/P | Review the exact channel, account and public listing before publishing; success requires actual provider evidence and a listing reference. |
| LIST-03 | MUST U/P | Demonstrate one live supported channel; keep capability states for Facebook Marketplace/Muse, Craigslist, Buy Nothing and Vinted individually. |
| LIST-04 | MUST P | Distinguish sale from donation/giveaway; do not imply an item is free when the user selected sale. |
| LIST-05 | NEXT P | Record asking price, minimum acceptable offer and date-based fallback preference; changes or cross-posts require review. |
| LIST-06 | MUST P | Keep one item availability state across channels; prevent concurrent accepted reservations. Report channels awaiting removal after completion. |
| PICK-01 | MUST U/P | Associate inquiries with the correct listing/item, participant and channel; show whether messages are live-imported or entered by the user. |
| PICK-02 | MUST U/P | Draft and review buyer replies, proposed price and pickup windows; sending and accepting an offer require the appropriate reviewed action. |
| PICK-03 | MUST U/P | Reserve for one buyer, confirm time/location with the user, and link pickup to Calendar if requested; proposed and confirmed are distinct. |
| PICK-04 | MUST P | Keep exact address/access instructions private until the user approves sharing with the specific recipient. Never claim the user is home without confirmation. |
| PICK-05 | NEXT P | Handle no-shows, buyer cancellation, reservation expiry and alternate buyers; require confirmation of completed handoff before marking sold/donated. |
| PICK-06 | NEXT P | Track price actually received separately from asking/accepted price; do not treat buyer chat as verified payment. |

## Movers, cleaners, truck rental and calls

| ID | Priority/source | Requirement and observable acceptance |
| --- | --- | --- |
| SERV-01 | STRETCH U/W05/W08 | Search movers/cleaners using location, dates, access constraints and user budget; present source links and freshness. |
| SERV-02 | STRETCH U/P | Compare quote scope, duration, inclusions, fees, cancellation terms and availability; estimates stay labeled estimates. |
| SERV-03 | STRETCH U/W09 | Prepare an inquiry/call brief; review phone number, purpose, information disclosed and call budget before a Bland call. |
| SERV-04 | STRETCH U/P | Capture call/job ID, status and outcome; a call placed or a quote received is not a confirmed booking. |
| SERV-05 | STRETCH U/W05 | Review and book a cleaner, mover or U-Haul only through supported authorized mechanisms; retain confirmation/cancellation details. |
| SERV-06 | STRETCH P | Cleaning follows item removal; moving and pickup windows respect building access/elevator rules and calendar conflicts. |

## Renter scope and anti-eviction guardrail

| ID | Priority/source | Requirement and observable acceptance |
| --- | --- | --- |
| SCOPE-01 | MUST U/W12 | Serve the renter's personal move and property disposition. Do not assist landlord-side eviction planning or execution. |
| SCOPE-02 | MUST U/P | Refuse requests to draft/send eviction demands, organize forced displacement, pressure occupants to leave or dispose of a tenant's belongings on a landlord's behalf. |
| SCOPE-03 | MUST P | Distinguish an authorized renter's voluntary notice/pickup/cleaning from a landlord eviction workflow; ask when role/authority is unclear. |
| SCOPE-04 | MUST P | Enforce the same scope at chat, tool and connector entry points; relabeling a disallowed task as "move-out coordination" does not authorize it. |
| SCOPE-05 | NEXT P | A renter may organize their own incoming documents without the system initiating landlord eviction actions; no legal-representation feature is implied. |

## Shared execution, privacy and operation

| ID | Priority/source | Requirement and observable acceptance |
| --- | --- | --- |
| EXEC-01 | MUST U | Prepare freely; review sends, calls, posts and bookings. Calendar invitations, offer acceptance and address disclosure follow the same reviewed-action principle. |
| EXEC-02 | MUST P | Approval binds to exact action/account/payload version; edits invalidate prior approval. Already-approved unchanged execution does not prompt again. |
| EXEC-03 | MUST P | Store status durably; show awaiting review, executing, confirmed, failed or outcome unknown; reload does not lose work. |
| EXEC-04 | MUST P | Use atomic claims/idempotency and provider reconciliation; double-click, retry and duplicate webhook cannot duplicate the external action. |
| EXEC-05 | MUST P | External content cannot grant permission or override instructions; caller identity and ownership come from authenticated server context. |
| DATA-01 | MUST P | Sign-in, ownership policies and private storage prevent cross-user access to documents, photos, chats and actions. |
| DATA-02 | MUST P | Keys/OAuth tokens remain server-side and logs omit private payloads; disconnect prevents new provider actions. |
| DATA-03 | NEXT P | User can export/delete their move and revoke access; define retention and explain copies already sent to external providers. |
| OPS-01 | MUST U/P | Hosted development environment completes both agreed flows; document production configuration and known gaps by 4:30 PM. |
| OPS-02 | MUST P | Show live/draft/manual/simulated/unsupported status per capability; no fake receipts, listing links or booking success. |
| OPS-03 | MUST P | Bound model/tool spend, run duration and retries; failure yields a recoverable user-facing result. |
| OPS-04 | NEXT P | Monitor per-provider failures, action latency and unresolved outcomes without collecting unnecessary personal data. |

## Monorepo and agent interoperability

| ID | Priority/source | Requirement and observable acceptance |
| --- | --- | --- |
| TECH-01 | MUST U | One monorepo owns web, tools, migrations, Muse connector and coding-agent frameworks; boundaries follow MONOREPO.md. |
| TECH-02 | MUST U/P | Integrate official Muse Code developer SDK behind a pinned host/SDK adapter; verify MSP session operation separately from personal Muse/Facebook access. |
| TECH-03 | MUST U/P | Use current mutually supported A2A/MCP contracts, capability discovery and shared authorization; document exact versions and exercise compatibility tests. |

## Scope boundaries

No automatic launch of coding subagents is required by this catalog. No new legal
eviction-support product, internal two-sided services marketplace, payment escrow,
automatic rent/deposit transfer or property-management system is implied. Those
would be separately scoped decisions, not hidden prerequisites for moving help.
