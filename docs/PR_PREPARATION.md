# Publishing the prepared planning branch

Remote: `ShivamSpm/ai-moveout-automation-agent`. GitHub reports WRITE/push access
for `jg-ctfbio`; ordinary pushes do not require admin permission.

The remote was empty at clone time, but teammates initialized it during this session.
The planning branch was rebased onto real `origin/main` (`6004408`), preserving the
teammate README. Local `main` now tracks that base. Do not publish an orphan baseline.
No remote push or PR creation was performed.

Review, then publish the feature branch and create the PR when requested:

```bash
git fetch origin
git diff origin/main...HEAD --stat
git push -u origin codex/hackathon-bootstrap
gh pr create --repo ShivamSpm/ai-moveout-automation-agent --base main --head codex/hackathon-bootstrap --title 'Define moving assistant requirements and monorepo agent framework' --body-file docs/PR_BODY.md
```

If main advances, integrate its changes before publishing. Never force-push main
or overwrite teammate history. `origin/website` contains a Next.js app under `web/`
(commit `88fc962` at inspection); this planning branch does not merge or relocate it.
Coordinate the proposed `apps/web` layout before integrating that branch.

The private whiteboard and real renter data remain excluded. The PR description
is prepared; it is not evidence that a remote PR already exists.
