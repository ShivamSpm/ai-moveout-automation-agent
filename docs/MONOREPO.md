# Monorepo organization — implementation blueprint

User decision: one repository owns website, agent runtimes, Muse connector, shared
tools, Supabase migrations, development agents/skills, tests and architecture.
This tree is the target layout. Teammate branch `origin/website` already has a
Next.js app at `web/`; preserve it and coordinate any move to `apps/web`. The
planning branch does not merge, rewrite or test that application.

```text
ai-moveout-automation-agent/
├── AGENTS.md                         shared engineering rules
├── CLAUDE.md                         Claude entry point
├── START_HERE.md                     next-session handoff
├── .agents/skills/                   canonical shared development skills
├── .claude/
│   ├── agents/                      Claude development role definitions
│   └── skills -> ../.agents/skills   shared skills, no duplicated bodies
├── .codex/
│   ├── config.toml
│   └── agents/                      Codex development role definitions
├── apps/
│   ├── web/                         Next.js UI, auth callbacks, bounded API routes
│   ├── agent-worker/                durable jobs + isolated Muse Code SDK host
│   └── connector-gateway/           thin authenticated MCP/A2A entry points
├── packages/
│   ├── contracts/                   validated domain/tool/event schemas
│   ├── domain/                      move, item, action and reservation rules
│   ├── tools/                       provider-neutral business use cases
│   ├── agent-runtime/               coordination, prompts, SDK session adapters
│   ├── integrations/                Google, Meta, OpenRouter, Apify, Bland adapters
│   └── db/                          server repositories + generated Supabase types
├── plugins/
│   └── moving-assistant/            renter-facing Claude plugin (future)
│       ├── .claude-plugin/plugin.json
│       └── skills/                  product skills, separate from coding skills
├── connectors/
│   └── muse/                        connector tool catalog, setup, review metadata
├── supabase/
│   ├── config.toml                  project-local configuration
│   ├── migrations/                  sole ordered source of schema changes
│   ├── tests/                       ownership/RLS/SQL invariants
│   └── seed.sql                     synthetic local/demo data only
├── tests/
│   ├── contracts/                   MCP/A2A/provider compatibility
│   ├── integration/                 real boundaries with controlled fixtures
│   ├── e2e/                         both hosted user journeys
│   └── evals/                       extraction, scope and action-policy behavior
├── fixtures/synthetic/              non-personal lease/photo/message fixtures
├── scripts/                        reproducible setup/checks, no hidden side effects
├── docs/                           requirements, decisions, architecture, runbooks
│   └── adr/                        consequential implementation choices
├── .github/                        PR template and scoped CI workflows
├── private/                        ignored user files and local evidence
├── package.json                    private root, tool scripts, package-manager pin
├── pnpm-workspace.yaml             apps/* and packages/*
└── pnpm-lock.yaml                  one committed dependency resolution
```

## Boundaries and dependency direction

`apps → tools / agent-runtime → domain / integrations / db → contracts`.
Domain logic does not import web frameworks or provider SDKs. Integrations do not
import apps. UI imports public contracts, never server clients or secret-bearing
configuration. Avoid cycles and cross-package source-relative imports.

`packages/tools` is the common execution boundary for web chat, worker and connectors:
identity → scope/ownership → input validation → exact-action authorization → durable
claim → provider call → reconciliation/result. No alternate connector bypass path.

`packages/integrations/meta-muse-code` wraps the developer SDK; a separate
`meta-muse-connector` adapter handles any verified personal Muse handoff. MSP,
A2A and MCP are distinct protocols and must not be treated as interchangeable.
Published A2A agents call the same business tools; internal function calls do not
need a network protocol solely to resemble an agent framework.

## Implement incrementally today

Scaffold `apps/web`, `contracts`, `domain`, `tools`, `integrations`, `db` and
`supabase` first. Add the worker when running the Muse host or durable tasks;
add a separate gateway deployment only if authentication/transport/lifecycle
requirements justify it. Its handlers may initially be hosted alongside the web
app if supported. One monorepo does not require three deployments immediately.

Recommend pnpm workspaces with one pinned package-manager version. Choose supported
Node/Next.js/SDK versions at implementation time, pin them and commit the lockfile.
Add Turborepo only if caching/task orchestration materially helps this team today;
the package split must work without it. Do not create empty packages to fill the tree.

## Deployment and database ownership

- Vercel project root is `apps/web`; configure monorepo build/install behavior.
- A persistent `muse serve` process belongs in a compatible isolated worker host,
  not assumed to survive in a Vercel request. Worker hosting is an open decision.
- Supabase has its own migration history, auth and private storage. Keep all SQL
  migrations at root `supabase/migrations`; no per-app competing migration streams.
- Generate DB types into `packages/db`; regenerate after schema changes and test consumers.
- Separate development/production resources and OAuth redirects. No reset of shared
  databases; verify new migrations forward against the selected development target.
- Keep credentials in local/deployment secret stores. Documentation lists names only.

## Agent and skill organization

`.agents/skills` is canonical for Codex discovery. `.claude/skills` is a relative
symlink so Claude uses the same content. `.codex/agents` holds Codex role TOML;
do not invent a `.codex/skills` loader. Keep model/permission overrides minimal.
The product plugin under `plugins/` is a separate deliverable and must not expose
coding skills such as migration or repository maintenance to renter conversations.

## Proposed ownership and checks

Vincent: `apps/web`; Steven: vision/lease tools and model adapter; Shivam: Supabase,
DB and Google paths; Jorge: Muse SDK/connector, protocols and marketplace workflow.
Confirm these assignments. One owner integrates shared contracts, package manifests
and lockfile; all others specify requested changes rather than co-editing them.

Root scripts should eventually run format/lint/typecheck/test/build. CI additionally
checks schema/types, cross-user access, action idempotency, connector contracts and
the two user journeys. Add actual checks with implementation; empty passing scripts
are not verification. Do not add a license without the repository owner's choice.
