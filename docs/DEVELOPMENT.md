# Development setup and GitHub access

## Local checkout

```bash
cd /Users/jorge/ai-moveout-automation-agent
```

Origin: `https://github.com/ShivamSpm/ai-moveout-automation-agent.git`.
At clone time the public repository had no commits. Local bootstrap branch:
`codex/hackathon-bootstrap`. The remote's configured default branch is `main`.
Teammates initialized main during setup. The planning branch is rebased onto
real origin/main; see PR_PREPARATION.md for the feature-branch PR sequence.
A separate origin/website branch contains a Next.js app at web/; preserve it.

## Start either development assistant

```bash
claude 'Read CLAUDE.md and docs/STATUS.md. Read START_HERE.md and continue from the captured requirements without restarting discovery.'
```

```bash
codex 'Read AGENTS.md and docs/STATUS.md. Read START_HERE.md and continue from the captured requirements without restarting discovery.'
```

Both CLIs are installed on Jorge's Mac. These commands start interactive sessions;
the bootstrap process has not launched interactive sessions or made model calls.
Codex Doctor confirms configured authentication and provider reachability; Claude
model authentication has not been checked.
Starting in this directory loads repository instructions. CLI trust/login prompts
may still apply. Global user settings can still be inherited; no global settings
were changed by this setup.

The `.claude/agents/` Markdown files and `.codex/agents/` TOML files define matching
development roles. They inherit model choices; they do not auto-run. See official
[Claude instructions](https://code.claude.com/docs/en/memory),
[Claude roles](https://code.claude.com/docs/en/sub-agents),
[Codex instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
and [Codex roles](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## GitHub permissions

Read-only checks during setup identified `jg-ctfbio` as the active `gh` identity.
GitHub reported repository permission `WRITE` and REST `permissions.push=true`;
`admin=false`. Ordinary pushes do not require admin privileges. Branch rules can
still require PRs/checks. Git operations also need working credentials for the
remote transport; this bootstrap has not attempted a push.

Claude and Codex use the credentials available in their execution environment;
they do not require separate GitHub collaborator roles. If another machine or
cloud session uses a different identity/token, verify that identity independently.
Do not grant admin access just to address a token, SSH or branch-rule problem.

Checks that do not publish anything:

```bash
gh api user --jq .login
gh repo view ShivamSpm/ai-moveout-automation-agent --json viewerPermission
git remote -v
git status --short --branch
```

For simultaneous development after the first commit, use separate worktrees or
clones with distinct branches and file ownership. Running `claude` and `codex`
as simultaneous writers in this one checkout is not an isolation mechanism.

## Next implementation step

Following START_HERE.md and MONOREPO.md, scaffold the web app and real package scripts,
choose pinned dependencies, create project-specific service resources, and deliver
the saved-move journey on a hosted development URL. Record actual environment
variable names and commands here as implementation introduces them.

The Claude product plugin/MCP server, Muse connector and hosted runtime are still
planned. The development instruction files do not create those integrations.
