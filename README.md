# Vacate: an AI agent that handles your move-out

Moving out means reading a lease, chasing a landlord, booking cleaners and movers, and selling everything you don't want to carry. Vacate is a personal agent that does that work for renters: it reads the lease, builds a dated checklist, drafts the landlord notice and negotiates with buyers for your belongings. You approve anything that leaves the app.

**Live app:** https://ai-moveout-automation-agent-tau.vercel.app


**Home page:**
<img width="1917" height="1025" alt="image" src="https://github.com/user-attachments/assets/56b2daa4-2aa6-4fd9-8f53-50b420eee51b" />


**Landlord calling automation page:**
<img width="1911" height="946" alt="image" src="https://github.com/user-attachments/assets/5e5535ea-8721-4a1e-9335-d6fa1d17d599" />

**Agent negotiating with buyers:**
<img width="1320" height="2661" alt="image" src="https://github.com/user-attachments/assets/a8f1bc35-1fda-47d0-8a97-a506cfcff1a1" />

<img width="1290" height="2796" alt="image" src="https://github.com/user-attachments/assets/8580799c-9e56-4ec7-b496-147774a46220" />



Demo video link: https://youtu.be/mS64XBHnGX0?si=7F3qyq7cNN3g9QGK

## What it does

- **Lease to plan.** Upload the lease; the agent extracts notice periods and cleaning or repair clauses with page references, and code turns them into a dated checklist counting back from move-out day.
- **Sell your stuff with a negotiating agent.** Snap one photo per item and a vision model drafts the listing. Approved listings post to a Telegram group. The agent then chats with every buyer in parallel, counters offers and picks the best deal. It never goes below your minimum, and pickups always land before move-out day.
- **You stay in control.** Every outbound action (a listing, a deal, an email, a call) is a review card. Approval is bound to a hash of the exact content, so an edited message needs a fresh approval.
- **One chat for the whole move.** A tool-calling agent can read item photos, compare cleaning and moving quotes, and propose bookings.
- **Works beyond the web app.** The same tools are exposed over MCP and A2A, so Claude and Meta's Muse agent can act for the renter. Muse can post to Facebook Marketplace from the renter's own account.

<!-- Screenshots: add the files and uncomment.
| Selling | Buyer negotiation | Deal approval |
|---|---|---|
| ![Sell page](docs/screenshots/sell.png) | ![Buyer chat on Telegram](docs/screenshots/telegram-chat.png) | ![Approve a deal](docs/screenshots/deal-approval.png) |
-->

## How it works

```
Renter ──▶ Next.js app (Vercel) ──▶ Agent: OpenRouter model + tools
                 │                         │
                 │                  Policy layer in code
                 │          (price floor, pickup deadline, address checks)
                 ▼                         │
       Supabase: Postgres + RLS,     Channel adapters
       private storage, actions      Telegram bot · Muse (MCP/A2A) · Bland calls
```

The model proposes and the code decides. Every reply the agent drafts is checked before it's sent: no offers below the renter's minimum, no hints at it, no exact address, no pickup after the cutoff. If a check fails, a safe fallback reply goes out.

## Engineering highlights

- **Exactly-once external actions.** A Postgres action table records each approval against a payload hash. A single-row atomic update is the claim, so a double click or a redelivered webhook can't send twice.
- **One buyer gets the item.** A partial unique index allows only one active reservation per item, and a higher offer can replace a lower deal that's still waiting.
- **Owner isolation.** Row-level security covers every table, files sit in private storage, and the server uses the secret key only with an owner ID it resolved itself.
- **Hard spend cap on model calls.** The worst-case cost of each call is reserved against a per-instance budget before the call is sent.
- **Untrusted input stays data.** Lease text, buyer messages and agent reports never become instructions, and an anti-eviction check runs at every tool entry point.
- **Tested.** Vitest unit and integration suites, the integration suites running against a local Supabase.

## Tech stack

TypeScript · Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Supabase (Auth, Postgres, Storage) · OpenRouter (Claude models, vision) · Zod · Model Context Protocol · A2A · Telegram Bot API · Bland · Vercel · Vitest

## Run it locally

```bash
cd web
npm install
cp .env.example .env.local   # add Supabase and OpenRouter keys
npm run dev                  # http://localhost:3100
```

Database migrations are in `supabase/migrations/`. Every environment variable is documented in [`web/.env.example`](web/.env.example). More detail: [architecture](docs/ARCHITECTURE.md) · [integrations](docs/INTEGRATIONS.md) · [decisions](docs/DECISIONS.md).

## Status

Built at the Personal Agents Hackathon in San Francisco (October 2026). Live: accounts, saved moves, lease upload and checklist, photo-to-listing, and Telegram selling with agent negotiation. Gmail and Calendar stop at reviewed drafts, cleaning and moving bookings are simulated, and Facebook posting depends on the renter's own Muse account.
