# Start the next Claude Code session here

## Read in this order

1. `AGENTS.md` and `docs/STATUS.md` — working rules and actual state.
2. `docs/PRODUCT.md` and `docs/DECISIONS.md` — confirmed scope.
3. `docs/MONOREPO.md` and `docs/AGENT_STANDARDS.md` — repository and SDK design.
4. Relevant sections of `docs/REQUIREMENTS.md`, `docs/JOURNEYS.md` and
   `docs/ACCEPTANCE.md` for the work you are doing.

Do not reread the entire previous chat; the decisions are captured in the repo.
Whiteboard transcription: `docs/WHITEBOARD.md`. Original image conversion is local
and git-ignored under `private/whiteboard/`; it will not travel with the PR.

## User's confirmed intent

- Web app with chat first, in one monorepo including tools, Supabase migrations,
  Muse developer SDK/runtime, Muse connector and both coding-agent frameworks.
- Flow A: lease review → checklist → reviewed landlord email → Calendar.
- Flow B: photos → keep/sell/donate → reviewed Facebook Marketplace publication
  through Muse → live buyer messaging goal → reviewed pickup coordination.
- Muse access needs testing. SDK availability does not prove Facebook access.
- Movers and cleaners discovery/scheduling are stretch.
- Prepare freely; review sends, calls, posts and bookings.
- Anti-eviction means no landlord-perspective eviction assistance; authorized
  renters' voluntary moves remain in scope.
- Vercel, Supabase, Apify, OpenRouter, Bland; Craigslist, Buy Nothing and Vinted
  are additional marketplace targets. Do not silently drop them from the vision.
- Team: Vincent, Steven, Shivam, Jorge. Build cutoff 4:30 PM; presentation/video
  4:30–6 PM today, October 24, 2026. Pacific time inferred from Jorge's Mac.

## Immediate next work

Confirm current time, git status and teammate ownership. `origin/website` already
contains a Next.js app under `web/` (88fc962 at inspection); inspect and coordinate
integration instead of generating a competing app. `apps/web` is the target proposal.
If authorized to build,
scaffold the monorepo's first working web/auth/saved-move slice and immediately
test dedicated service access. Prioritize the Muse capability spike and Google
OAuth because both primary flows depend on them. Install/pin the real SDK only
after checking current docs and a compatible Muse host; record the selected pair.

Do not restart product discovery or replace these two flows with a generic chat
demo. Remaining questions are in DECISIONS.md; proposed defaults may unblock
ordinary implementation. External sends/posts/bookings still require reviewed
action details. Team assignments are proposals, not accepted work allocations.

## Local start

```bash
cd /Users/jorge/ai-moveout-automation-agent
claude 'Read CLAUDE.md and START_HERE.md. Continue from the captured requirements. Confirm remaining implementation blockers and prepare the first monorepo build slice without restarting discovery.'
```

Both assistant frameworks and shared skills are prepared. This planning branch adds no app/provider SDK, database or hosted environment.
Teammate website work exists remotely and has not been tested here. See `docs/PR_PREPARATION.md`
for publishing the local plan; no remote push is part of this handoff.
