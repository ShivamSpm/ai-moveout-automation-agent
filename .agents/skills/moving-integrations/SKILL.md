---
name: moving-integrations
description: Implement or verify moving-assistant provider tools, Muse SDK and connector handoffs, and MCP or A2A contracts without confusing runtime access with account capabilities.
---

Read docs/AGENT_STANDARDS.md and the relevant row of docs/INTEGRATIONS.md.
For Muse, use docs/MUSE_SPIKE.md. Verify official APIs and pinned SDK/host versions
before code. Muse Code MSP, A2A tasks, MCP tools and personal Muse account access
are different boundaries; a successful model call proves none of the others.

Place provider clients in packages/integrations, shared operations in packages/tools
and validated inputs/events in packages/contracts. All entry points use the same
ownership, renter scope and exact-action authorization checks. Keep durable state
outside SDK memory. Test duplicate execution, unknown outcomes and account isolation.
Report actual provider evidence; manual or simulated fallbacks remain labeled.
