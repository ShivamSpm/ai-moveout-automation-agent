# Vacate — renter moving assistant

Vacate helps renters save a move, review a lease, build a checklist, organize belongings,
and prepare communications and listings. The Next.js app is deployed at
https://ai-moveout-automation-agent-tau.vercel.app.

The dashboard and renter chat use saved Supabase data. Lease PDFs and item photos use
private storage. Cleaning and moving selections are explicitly simulated bookings.
Gmail and Calendar execution are not connected; Facebook/Muse access requires an
independently verified account integration. Telegram has a live adapter, but its
remaining review-policy gaps are documented in the final review. Do not describe
the complete two demo journeys as live.

## Development

Read [START_HERE.md](START_HERE.md), [status](docs/STATUS.md) and
[development instructions](docs/DEVELOPMENT.md). The app and npm lockfile live in
`web/`; database migrations live in `supabase/`. Use a separate worktree per writer.

## Interfaces

The web app is the primary interface. The Claude Code plugin lives in
`plugins/moving-assistant/`:

```text
/plugin marketplace add ShivamSpm/ai-moveout-automation-agent
/plugin install moving-assistant@vacate
```

The hosted MCP endpoint is `/api/mcp`; see [connector setup](docs/CONNECTORS.md).
SDK availability is not proof of consumer marketplace access.

## Product and evidence

- [Requirements](docs/REQUIREMENTS.md) and [acceptance scenarios](docs/ACCEPTANCE.md)
- [Final verification and remaining gaps](docs/verification/FINAL_REVIEW.md)
- [Architecture](docs/ARCHITECTURE.md) and [integration capabilities](docs/INTEGRATIONS.md)
- [Decisions](docs/DECISIONS.md) and [team](docs/TEAM.md)

Built for the October 2026 Personal Agents hackathon by Vincent, Steven, Shivam and
Jorge. Renter-serving only: no landlord-side eviction assistance. Prepare freely;
external actions require renter review. Commit only synthetic fixtures and sanitized
material. Never commit real leases, credentials or renter photos.
