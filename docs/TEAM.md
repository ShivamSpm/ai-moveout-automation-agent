# Team and ownership

Confirmed team: **Vincent, Steven, Shivam and Jorge**. The assignments below are
proposals for discussion; no one has been contacted or assigned work externally.

| Proposed owner | Workstream | Suggested files | Done criterion |
| --- | --- | --- | --- |
| Vincent | Web chat and move dashboard | `apps/web/` | Hosted user can operate the full agreed journey |
| Steven | Lease/photo intelligence and model adapter | `packages/tools/lease`, `packages/tools/photos`, `packages/integrations/openrouter/` | Cited obligations and confirmed keep/sell/donate inventory |
| Shivam | Persistence, auth and Google actions | `supabase/`, `packages/db/`, `packages/integrations/google/` | Private saved move plus verified Gmail/Calendar path |
| Jorge | Facebook/Muse publication and buyer pickup path | `apps/agent-worker/`, `connectors/muse/`, Meta/marketplace adapters | Real listing reference and reviewed pickup workflow; Apify/Bland services are stretch |

Shared domain/tool types need one named owner before parallel implementation.
Assign root package files and lockfile to the app scaffold owner initially. Other
contributors request dependency additions to avoid conflicting installs. Rebalance
the scope if the backend lane becomes the bottleneck.

## Coordination protocol

1. Agree schema/tool contracts and first-journey acceptance criteria together.
2. Establish the initial remote commit, then work from separate branches/checkouts.
3. Claim exact files and dependencies here or in the team's chosen issue tracker.
4. Do not edit another person's active files; request the needed interface instead.
5. Integrate small changes continuously; do not leave the first integration to 4 PM.
6. Record the tested revision, blockers and next action in `STATUS.md` at handoff.

Coding agents follow the same boundaries. Defining roles does not launch them or
grant authority to contact landlords, vendors, buyers or teammates.

## Current claims

| Owner | Scope | State |
| --- | --- | --- |
| Codex bootstrap session | README, shared instructions, agent definitions, planning docs, ignores | Completed; files released for next session; no application files claimed |

No other claims are known. Check current git state and with the team before edits.
