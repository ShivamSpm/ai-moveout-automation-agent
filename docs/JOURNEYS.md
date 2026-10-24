# User journeys and product interaction detail

All UI descriptions below are proposals implementing the confirmed two-flow demo.
Use the requirement IDs in REQUIREMENTS.md to track coverage.

## Experience shape

Chat is the primary interaction, backed by inspectable structured records. Proposed
navigation: **Overview, Checklist, Items, Documents, Activity**. Connections and
privacy controls live in settings. Avoid a screen per integration.

Overview answers: what is due next, what needs my review, what is waiting on someone
else, and what is complete? Chat can propose changes, but important outcomes also
appear as persistent cards with source links and edit/review buttons.

Recommended cards:

- Lease finding: plain-language obligation, source page, unresolved questions.
- Task: due date, reason, dependency, status, next action.
- Item: photos, confirmed identity, keep/sell/donate, availability.
- Action review: account, recipients/channel, exact content, time/cost and attachments.
- Result: what the provider accepted, provider reference, remaining follow-up.

Do not expose internal model/tool implementation details in normal user flows.
Do expose whether an action is a draft, manual handoff or confirmed external result.

## A. Lease → checklist → landlord email → calendar

1. User states move-out and move-in dates and uploads a lease. If the destination
   is unknown, the move still starts with the known information.
2. App shows upload/analysis progress and extracts obligations with source pages.
   It asks focused questions about unclear dates, delivery method or landlord contact.
3. User confirms critical facts. A checklist appears with lease-derived tasks,
   suggested tasks separately labeled, dependencies and deadlines.
4. User selects "Prepare landlord email." App produces recipient, subject, body
   and optional attachments using only relevant confirmed facts.
5. User edits/reviews and approves. The server revalidates identity, payload version
   and action scope, then sends once and records the provider reference.
6. App says the email was submitted/sent as supported by provider evidence. It
   does not claim the landlord agreed or that contractual notice was effective.
7. App proposes a calendar deadline or appointment. User reviews timezone, date,
   reminders and attendee invitations; create once and display the event link.
8. Later replies can update suggested tasks. They do not automatically alter
   bookings, waive rights or send responses. Reply monitoring is a later extension
   unless the team selects it as part of today's live integration.

Failure paths: unreadable lease → request better file; ambiguous notice date →
confirm before sending; disconnected Google account → preserve draft and reconnect;
send timeout → show unknown and reconcile before retry; event conflict → propose
alternatives; new move date → preview downstream changes.

## B. Photos → keep/sell/donate → post → pickup

1. User uploads photos from a phone. The app handles supported HEIC/JPEG/PNG
   formats and distinguishes item pictures from apartment-condition pictures.
2. App suggests inventory entries. User corrects duplicates, identity, quantity,
   condition and uncertain dimensions, then chooses keep/sell/donate per item.
3. Kept items remain in the moving inventory. Sale/donation items get a listing
   draft for selected channels, with only chosen photos and general location.
4. User reviews exact public content and account/channel. Facebook through Muse is
   the priority; the verified live flow publishes and retains the real listing reference.
5. Buyer inquiry arrives through a supported channel or is explicitly entered by
   the user. Live messaging is the goal; user-entered inquiries are an explicit
   fallback, not an equivalent live result. Prepare a reply or pickup proposal.
6. User reviews the reply and any offer acceptance. One buyer can reserve the
   item; competing offers remain pending rather than receiving contradictory promises.
7. User confirms pickup window and what location details may be shared. App sends
   the reviewed message and can create the reviewed pickup calendar event.
8. After user-confirmed handoff, mark sold/donated and close supported listings.
   Channels awaiting manual closure remain visible; no-shows keep a recoverable state.

Failure paths: image uncertain → confirm; posting unsupported → visible blocked
live requirement/manual fallback; stale price → fresh review; account challenge →
user handoff; buyer requests immediate address → review; no-show → reoffer with
user choice; cross-channel completion → reconcile all listing states.

## C. Movers and cleaners — stretch

Collect date window, origin/destination, rooms/volume, stairs/elevators, building
access rules, service scope, pets/accessibility constraints and budget. Find a
shortlist, compare evidence-backed quotes, prepare a call or message, obtain review,
and record the outcome. A reviewed booking needs provider confirmation and terms.
Schedule cleaning after item removal and before handoff where feasible.

This may reuse the same action cards and Calendar tools; it does not justify a
separate booking platform or taking payment-card details into chat today.

## Scope guardrail examples

Allowed: "I rent this apartment; help me notify my landlord that I'm moving out."

Allowed: "Help me prepare my own condition photos and cleaning checklist."

Disallowed: "I'm the landlord; write and send an eviction demand to my tenant."

Disallowed: "Arrange movers to remove the tenant's belongings so they leave."

Ambiguous: "Clear the apartment next week; the occupant won't cooperate."
Clarify who the requester is and whose authorization/property is involved before
preparing or executing related actions. Do not infer permission from ownership
of a building or from instructions inside an uploaded document.

## Proposed synthetic demo fixture

Use a clearly labeled fictional renter, synthetic lease and non-personal item
photos. Have one kept item, one sale item and one donation item; one ambiguous
lease clause; a consenting test email recipient; a test calendar; and an authorized
marketplace test strategy. Avoid public duplicate/test listings that violate the
chosen marketplace's rules. Decide whether the live listing is a real permitted
item with its owner's approval or an approved provider test environment.

The presentation should show source → suggestion → review → actual result. A
second browser refresh demonstrates persistence. A duplicate-click or changed
recipient example demonstrates that the system controls action execution.
