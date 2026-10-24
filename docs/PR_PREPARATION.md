# Publishing this planning branch

Remote: `ShivamSpm/ai-moveout-automation-agent`. GitHub reported WRITE/push access
for `jg-ctfbio`; no admin permission is needed for ordinary branch pushes.

The remote was empty at session start. A local `main` baseline containing only
`.gitignore` and a feature branch `codex/hackathon-bootstrap` are prepared so the
requirements can be reviewed in a PR. No remote push or PR creation was performed.

Before publication, run `git ls-remote --heads origin`. If still empty, publish the
local baseline first, then the feature branch and create the PR:

```bash
git push -u origin main
git push -u origin codex/hackathon-bootstrap
gh pr create --repo ShivamSpm/ai-moveout-automation-agent --base main --head codex/hackathon-bootstrap --title 'Define moving assistant requirements and monorepo agent framework' --body-file docs/PR_BODY.md
```

If a teammate has initialized the remote in the meantime, fetch and integrate the
planning changes onto that real default branch before publishing. Do not force-push
the local baseline or overwrite their history. Review branch rules if a push is denied.

Review with `git diff main...codex/hackathon-bootstrap --stat` and inspect the actual
diff. Real leases, photos, tokens and local whiteboard files must remain excluded.
The PR body is a prepared description, not evidence that a PR already exists.
