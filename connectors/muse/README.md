# Muse connector

How a renter's own Muse agent (signed in to their Meta account, with Facebook
connected through Accounts Center) works with Vacate. Setup and keys:
[docs/MUSE_SETUP.md](../../docs/MUSE_SETUP.md). Architecture:
[docs/CONNECTORS.md](../../docs/CONNECTORS.md).

| Surface | URL | Auth |
| --- | --- | --- |
| MCP (Streamable HTTP) | `<app>/api/mcp` | OAuth 2.1 (Supabase) or `Bearer vac_…` connector token |
| A2A 1.0 JSON-RPC | `<app>/api/a2a` | same |
| Agent Card | `<app>/.well-known/agent-card.json` | public |
| OAuth resource metadata | `<app>/.well-known/oauth-protected-resource` | public |

## Tools Muse uses (classification per Muse connector guidelines)

| Tool / A2A op | Effect | Class |
| --- | --- | --- |
| `muse_list_tasks` / `list_tasks` | Approved work with exact payloads, photo links (15 min), instructions | Read |
| `muse_list_listings` / `list_listings` | Listings published through Muse | Read |
| `muse_claim_task` / `claim` | Exactly-once claim; pickups also hold the item for one buyer | Write |
| `muse_report_result` / `report` | Record succeeded (with Marketplace URL) / failed / unknown for the approved payload hash | Write |
| `muse_relay_buyer_message` / `buyer_message` | Store a buyer's message as untrusted input for the renter | Write |

The consequential steps (publishing, messaging a buyer) happen inside Muse and are
Muse "sensitive writes" requiring the renter's approval every time. Vacate's own
approval binds the exact payload beforehand; Muse cannot report a different version.

## Test without a Muse account

```bash
cd web
VACATE_CONNECTOR_TOKEN=vac_... node scripts/a2a-client-check.mjs            # discover + list
VACATE_CONNECTOR_TOKEN=vac_... node scripts/a2a-client-check.mjs --simulate-post   # local only
npm run oauth:check   # DCR -> PKCE -> consent -> token -> MCP tools/list
```

`--simulate-post` reports a fake Marketplace URL; use it only on local synthetic data.
