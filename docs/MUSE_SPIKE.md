# Facebook/Muse capability check — proposed next implementation task

User priority: Facebook Marketplace through Muse. Access is untested; live buyer
messaging is the goal. This document is a plan, not an executed test or permission
to publish a listing/message. Initial target: 20 minutes to establish feasible path
and blockers, not to force a full integration through unavailable access.

## Questions to answer independently

1. Can the user's Muse account operate on their own Facebook Marketplace account?
2. Can this Muse session connect to our service using a supported connector path?
3. How is a task initiated: user starts Muse, connector task pickup, or a documented
   external invocation? Do not assume a push/webhook API into personal Muse.
4. Can Muse prepare and publish a permitted listing after the user's review?
5. Can it return a real listing reference/status to the shared application state?
6. Can it read an inquiry for that listing and send an exact reviewed reply?
7. Can it report the result with the correct participant, listing and action ID?
8. Which approval steps must occur inside Muse, and can the web flow represent them?

Posting, messaging and external activation are separate capabilities. A successful
chat with a Muse model answers none of these account-control questions by itself.

## Check sequence

- Inspect available account UI/settings and current official connector documentation.
  Record capabilities and restrictions; do not expose credentials/session cookies.
- If supported, test our connector with a harmless synthetic task/result round trip.
  Proposed task operations are ours; verify permitted schema/auth/hosting rather
  than inventing Meta endpoints.
- Prepare a listing draft for a real permitted item or an authorized test environment.
  Stop before publication until the user reviews the actual account/content.
- With that reviewed authorization, execute once, capture reference and verify status.
- Test messaging only with an authorized participant and reviewed exact message.
- Record latency, manual handoffs, permission prompts and failures as observations.

Do not bypass login challenges, connector review, Meta's permission controls or
marketplace restrictions. Do not publish dummy public listings merely to make a demo.

## Minimal bridge contract to validate

Task: authenticated owner, move/item reference, action type, immutable reviewed
payload/version, approved scope, correlation/idempotency ID and expiration.

Result: task ID, observed execution state, provider listing/conversation reference,
timestamp, failure/unknown details and evidence sufficient to verify the outcome.

Tool descriptions and server checks must scope access to the connected user.
Never return the lease or entire inbox when a title, price and selected photos suffice.
Do not transmit a web approval as permission to bypass a required Muse approval.

## Outcome report

| Capability | Current state | Evidence to fill |
| --- | --- | --- |
| Muse account + Facebook access | Not tested | Account capability observation, no credentials |
| Supported connector setup | Not tested | Official setup path and successful authentication |
| Task/result round trip | Not tested | Synthetic task ID and returned result |
| Listing publication | Not tested | Reviewed action and real listing reference |
| Inquiry read | Not tested | Authorized listing-bound message reference |
| Reviewed reply send | Not tested | Matching recipient/content and provider outcome |
| Background activation | Unknown | Documented or observed supported mechanism |

If only manual activation works, call it a manual Muse handoff, not autonomous
background integration. If posting works but messaging does not, primary B is
partially complete. Ask the user to choose any scope reduction; keep the technical
gap explicit in the plan and presentation.
