# Vacate · web

The website for Vacate, a move-out agent for San Francisco renters. It talks to your landlord, builds your checklist from the lease, books movers and cleaners, and sells or donates what you're not keeping. You approve every step.

Built with Next.js 16 (App Router, Cache Components) and Tailwind CSS 4.

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Pages

| Route | What it shows |
|---|---|
| `/` | Landing page and the workflow (you → email → landlord → checklist → movers, cleaning, selling) |
| `/start` | Setup form: address, move-out date, deposit, landlord email, lease upload |
| `/dashboard` | Countdown, deposit meter, the dated plan with lease clauses, approvals, agent activity |
| `/items` | Everything for sale or giveaway |
| `/items/[id]` | Item page with a buyer chat that negotiates for the seller |

## Where things live

- `src/lib/schedule.ts`: builds the dated plan backward from the move-out date. The agent extracts the rules from the lease; this code does the date math.
- `src/lib/demo.ts`: the demo move (pinned to Oct 24, 2026). Replace with Supabase reads when the backend is wired up.
- `src/components/offer-chat.tsx`: rule-based stand-in for the negotiating agent. Never goes below the seller's minimum; every deal waits for the seller's OK. `respond()` is where the real agent call goes.
- `src/components/approval-queue.tsx`: approve or skip outgoing emails, bookings and deals. Not wired to the agent yet.
- `public/art/`: illustrations and photos generated with Nano Banana (Gemini image models).
- `src/server/agent/agent.ts`: the agent (system prompt; tools go here). Server-only.
- `src/server/integrations/openrouter.ts`: server-side OpenRouter client.
- `src/app/api/chat/route.ts`: `POST /api/chat` with `{ messages: [{ role, content }] }`, returns `{ reply }`. No page calls it yet.

## Agent setup

Copy `.env.example` to `.env.local` and set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`). On Vercel, set the same variables in the project settings. Without a key, `/api/chat` returns 503 and the rest of the site still works.

`/api/chat` has no auth yet, so anyone with the URL can spend the key's credit. Put a credit limit on the OpenRouter key until Supabase Auth is in.

## Not wired up yet

Nothing here talks to Supabase, Gmail or Bland yet, and no page calls `/api/chat`. The planned contract with the agent:

- `POST /moves/:id/start`: read the lease, extract rules, draft the landlord email as an approval
- `POST /approvals/:id/execute`: send the approved email or place the call
- `POST /items/:id/chat`: buyer negotiation, returns `{ reply, deal? }`

Both sides share state through Supabase; the dashboard updates over Realtime.
