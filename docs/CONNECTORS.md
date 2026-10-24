# Bring your own assistant: Claude, Muse and the web app on one tool server

Goal: a renter who already pays for Claude or Muse uses that assistant's native chat
to run their move. Vacate is the harness around it: state, checklists, reviewed
actions, scope enforcement and the hand-off to whichever agent can act on a given
account. The web app is one more client of the same tools.

```text
        Claude.ai / Desktop        Claude Code         Muse app          Muse Code
        (custom connector)       (plugin / mcp add)  (custom connector)  (mcp_servers)
                 \                      |                  |                /
                  \_____________  MCP (Streamable HTTP) /api/mcp  _________/
                                        |        \
         Vacate web app ---------- shared tools  A2A 1.0 /api/a2a  <-- Muse as A2A client
                                        |
                 Supabase: moves, items, listings, actions (payload-hash approvals),
                 reservations, conversations, RLS per renter, private storage
```

## Identity

- **OAuth 2.1 (preferred):** `/.well-known/oauth-protected-resource` points MCP
  clients at the Supabase OAuth 2.1 server (dynamic client registration). The renter
  signs in on our consent page; the client receives a normal Supabase user token, so
  RLS applies to every tool call. Works for any client that supports MCP OAuth.
- **Connector token (`vac_…`):** for clients that only take an API key. Limited to the
  Muse executor tools (`muse_*`). Stored as a SHA-256 hash; revocable on /muse.

## What each assistant does

| Capability | Claude (any surface) | Muse | Web app |
| --- | --- | --- | --- |
| Chat, planning, negotiation drafts | Native chat + Vacate tools | Native chat + Vacate tools | Built-in chat (model via OpenRouter) |
| Checklist, items, keep/sell/donate | Tools | Tools | UI |
| Approve a send/post/pickup | `approve_action` with the client's per-call confirmation | Muse's own approval prompt | Review cards |
| Post to Facebook Marketplace as the renter | Cannot; queues approved work for Muse | **Yes**, via its Facebook integration | Cannot; queues for Muse |
| Message Marketplace buyers | Drafts only | Sends approved replies, relays buyer messages | Drafts and review |
| Email the landlord / Calendar | Google adapter (teammate lane) | Muse's own Gmail/Calendar connectors are possible but untested here | Google adapter |
| Phone calls | Bland adapter (stretch) | Not documented | Bland adapter (stretch) |

So a Claude user can do everything through Claude except act inside Facebook; that
step is handed to the same renter's Muse through the bridge. A Muse user can stay
entirely in Muse.

## Reviewed actions across assistants

Every external effect is a row in `actions` with a database-computed payload hash.
Approval binds to that hash; editing the payload voids it; execution is claimed once.
A client's approval UI (Claude's tool confirmation, Muse's sensitive-write prompt)
is the human step for that client. Keep per-call confirmation on for `approve_action`
in Claude, and never "Always allow" it. The server additionally refuses landlord-side
eviction work at every tool, whichever assistant calls it.

## Claude setup

- **Claude Code:** `claude mcp add --transport http vacate https://<host>/api/mcp`,
  then `/mcp` to sign in. Or install the plugin in `plugins/moving-assistant`.
- **Claude.ai / Desktop:** Settings → Connectors → Add custom connector →
  `https://<host>/api/mcp`.

## Muse setup

See [MUSE_SETUP.md](MUSE_SETUP.md). Two entry points serve Muse:

- MCP `/api/mcp` with the `muse_*` tools, if Muse custom connectors accept MCP.
- A2A 1.0 `/api/a2a` with the Agent Card at `/.well-known/agent-card.json`, for an
  A2A-capable Muse or another agent. Skills: `marketplace-work-queue` and
  `buyer-message-relay`; JSON data parts with an `op` field.

Neither Muse path has been exercised against a real Muse account yet. Record the
result in [MUSE_SPIKE.md](MUSE_SPIKE.md) before claiming a live integration.

## Protocol versions

- A2A: specification 1.0 via `@a2a-js/sdk@1.3.0` (JSON-RPC binding, `A2A-Version: 1.0`).
- MCP: `@modelcontextprotocol/sdk@1.32.1`, which negotiates up to `2025-11-25`. The
  latest published spec is `2026-07-28`; clients that require it are untested.
