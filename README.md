# AI move-out automation agent

A personal agent that handles moving out of an apartment in San Francisco: it emails your landlord, reads their move-out documents, builds your checklist, books movers and cleaners, rents the truck, and sells or donates the things you're not keeping. You approve everything before it goes out.

Built at the Personal Agents hackathon in San Francisco (October 2026).

## Workflow

```
User ──email──▶ Landlord ──move-out docs──▶ Agent ──▶ Checklist (dated, from the lease)
                                              │
                                              ├──▶ Rents the U-Haul
                                              ├──▶ Contacts movers and cleaners
                                              └──▶ Sells or donates personal items
                                                   (Craigslist, Buy Nothing, Marketplace)
```

## Stack

Bland (voice), Vercel, Muse (vision), Supabase, OpenRouter (vision and negotiation), Apify, Gmail.

## Layout

| Folder | What's in it |
|---|---|
| `web/` | Next.js website: landing page, login, dashboard, items for sale |
| `docs/user-workflow.md` | The user's step-by-step workflow, in order |

## Requirements and development handoff

A personal moving-in and moving-out assistant, starting with a web app with chat.
It will turn leases, dates, belongings and apartment photos into a practical plan
and help coordinate communications, marketplaces, cleaning and moving services.

**Status:** planning and Claude/Codex development scaffolding only. The upstream
repository was empty when cloned on October 24, 2026. There is no running app,
connected provider, database or deployment in this planning branch. The teammate
website (PR #1, Next.js app at `web/`) builds locally and stays at `web/`; see
[docs/MONOREPO.md](docs/MONOREPO.md).

Start your next session with [START_HERE.md](START_HERE.md). The source whiteboard
and this conversation are captured as requirements, decisions and implementation
boundaries; no chat-history reconstruction is needed.

## Start developing

On Jorge's Mac:

```bash
cd /Users/jorge/ai-moveout-automation-agent
claude
```

Or start Codex in that directory:

```bash
codex
```

Both use the shared `AGENTS.md`; Claude also loads `CLAUDE.md`. Project roles are
provided for planning, integration implementation and evidence review. Do not
run two writers in this checkout. See [development setup](docs/DEVELOPMENT.md).

## Plan and context

- [Monorepo structure](docs/MONOREPO.md)
- [Muse SDK and A2A/MCP standards](docs/AGENT_STANDARDS.md)
- [PR preparation](docs/PR_PREPARATION.md)
- [Product requirements and open questions](docs/PRODUCT.md)
- [Whiteboard transcription and clarifications](docs/WHITEBOARD.md)
- [Detailed requirements catalog](docs/REQUIREMENTS.md)
- [User journeys and review interactions](docs/JOURNEYS.md)
- [Confirmed decisions and pending choices](docs/DECISIONS.md)
- [Acceptance scenarios](docs/ACCEPTANCE.md)
- [Facebook/Muse capability check plan](docs/MUSE_SPIKE.md)
- [Today's deadline and implementation plan](docs/HACKATHON_PLAN.md)
- [Architecture and action contract](docs/ARCHITECTURE.md)
- [Integration capabilities and unknowns](docs/INTEGRATIONS.md)
- [Team ownership proposal](docs/TEAM.md)
- [Current status and next session handoff](docs/STATUS.md)

The proposed stack is Vercel, Supabase, OpenRouter, Apify and Bland, with Google
Gmail/Calendar and a future Claude/Muse bridge. Marketplace targets include
Facebook Marketplace, Craigslist, Buy Nothing and **Vinted**. The capability
matrix separates planned integrations from verified functionality.

## Hackathon

Team: Vincent, Steven, Shivam and Jorge. Build deadline: **October 24, 2026,
4:30 PM America/Los_Angeles**. Video and presentation: **4:30–6:00 PM**.
The timezone follows Jorge's Mac and should be corrected if the event differs.

Confirmed demo: (1) lease → checklist → reviewed landlord email → Calendar;
(2) photos → keep/sell/donate → Facebook/Muse posting → buyer pickup coordination.
Muse access and live messaging need verification. Movers and cleaners are stretch.
The assistant serves renters and must not assist landlord-side evictions.

Keep real leases, renter photos and private whiteboard material in ignored
`private/` locally or authenticated private storage once implemented. Commit only
synthetic demo fixtures and sanitized planning material. This upstream is public.
