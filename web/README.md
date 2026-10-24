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

## Login (Supabase + Google)

Copy `.env.example` to `.env.local` (and set the same two variables in Vercel):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Use the **publishable** (or legacy anon) key. Never put the secret / service_role key in a `NEXT_PUBLIC_` variable: it bypasses row-level security and would ship to every browser. Only the agent container needs the secret key.

Without these variables the site runs as a demo with no login. With them, `/dashboard` and `/start` require sign-in; item pages stay public for buyers.

To turn on Google sign-in:

1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Sign In / Providers → Google: paste the client ID and secret, enable.
3. Supabase → Authentication → URL Configuration: Site URL = the Vercel production URL; add redirect URLs `https://<your-domain>/auth/callback` and `http://localhost:3000/auth/callback`.

## Pages

| Route | What it shows |
|---|---|
| `/` | Landing page and the workflow (you → email → landlord → checklist → movers, cleaning, selling) |
| `/login` | Continue with Google (Supabase Auth) |
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

## Cleaning simulator (backend)

A simulated cleaning marketplace. **Every company is fictional and every result is simulated**: no real cleaner is contacted, nothing is reserved and no payment is taken. Responses carry `simulated: true`, quotes are labeled `estimate`, and confirmations use a `SIM-` code. No page calls these routes yet.

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/cleaning/quotes` | `CleaningRequest` (`src/contracts/cleaning.ts`) | `{ catalogSource, matches, excluded: [{ provider, reasons[] }], warnings, reasons }` |
| `POST /api/cleaning/bookings` | `{ quote, slotId }` (a quote issued to you) | `201 { proposal }` with `status: "pending_review"`, `payloadHash`, `idempotencyKey` |
| `POST /api/cleaning/bookings/:id/approve` | `{ payloadHash, idempotencyKey }` from the user's approve action | `{ result }`: `simulated_confirmed` or `rejected` with a reason |

```bash
curl -s localhost:3000/api/cleaning/quotes -H 'content-type: application/json' -d '{
  "requesterRole": "renter",
  "serviceArea": { "kind": "zip", "zip": "94110" },
  "bedrooms": 1, "bathrooms": 1,
  "leaseRequirements": { "deepClean": true, "carpetCleaning": true, "clauseRefs": ["Lease 14.2"] },
  "itemsRemaining": { "count": 0, "hasBulky": false },
  "window": { "earliestStart": "2026-11-09T15:00:00Z", "latestFinish": "2026-11-14T02:00:00Z" },
  "maxBudgetUsd": 350
}'
```

Abridged response (clock 2026-11-02T17:00Z):

```json
{
  "simulated": true,
  "catalogSource": "fixture",
  "matches": [
    {
      "providerId": "bluefinch-cleaning-collective",
      "providerName": "Bluefinch Cleaning Collective (fictional)",
      "simulated": true,
      "source": { "kind": "simulated", "label": "Simulated cleaning marketplace: fictional companies, no real provider was contacted" },
      "priceUsd": { "kind": "estimate", "totalUsd": 249, "lineItems": [
        { "code": "base", "amountUsd": 146 }, { "code": "deep_clean", "amountUsd": 65 }, { "code": "carpet_cleaning", "amountUsd": 38 } ] },
      "durationHours": 3,
      "slots": [{ "slotId": "bluefinch-cleaning-collective:2026-11-09T17:00:00.000Z", "start": "2026-11-09T17:00:00.000Z", "end": "2026-11-09T20:00:00.000Z" }],
      "quoteValidUntil": "2026-11-04T17:00:00.000Z"
    }
  ],
  "excluded": [
    { "provider": { "id": "otterbay-shine" }, "reasons": [{ "code": "carpet_not_offered", "detail": "does not offer carpet cleaning, which the lease requires" }] },
    { "provider": { "id": "wrenmoor-move-out-crew" }, "reasons": [{ "code": "insufficient_notice", "detail": "needs 336 hours' notice, which ends after the window closes" }] }
  ]
}
```

How it works:

- Companies come from `public.cleaning_providers` (migration in `../supabase/migrations/`, authored but not applied) through PostgREST with the publishable key, or from the identical fixture in `src/server/integrations/cleaning-catalog-fixture.ts` when `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are unset or `CLEANING_CATALOG_SOURCE=fixture`. `catalogSource` always says which one answered. If Supabase is configured but the table does not exist yet (PostgREST 404 / `PGRST205`), the fixture is used with `catalogSource: "fixture"` and a `catalogWarnings` entry; auth, server and network errors return 503. An invalid row is skipped and named in `catalogWarnings`.
- Filters: ZIP in `service_zips`, carpet / inside-appliance / window / wall capability from the lease flags, pets, notice period, free slots inside the window and after item removal (SERV-06), and budget. Each excluded company lists every rule it failed.
- Prices and slots are deterministic for the same request and clock (seeded per company and day). Times are San Francisco local hours, returned in UTC.
- Approval binds the exact quote, slot and price through `payloadHash`. Repeating it with the same or a new key returns the first result, and a slot can be claimed only once.
- State (issued quotes, proposals, slot claims, approvals) is in server memory: it resets on restart and is not shared between serverless instances. A Supabase repository replaces it later.
- There is no auth yet: every caller is one demo renter (`resolveOwnerId` in `src/app/api/cleaning/_lib/http.ts`).

## Sell on Telegram (`/sell`)

The renter adds one photo per item; the agent suggests a short title and description (`/api/sell/describe`), and the renter edits them and sets an asking price and a private minimum. Approving a listing posts it to a public Telegram channel with a **Message seller** button. Each buyer then chats privately with the bot, and the negotiating agent (`src/server/selling/`) answers within fixed limits:

- Code checks every reply before it is sent (`policy.ts`): never below the minimum, never revealing it or the exact address, and pickups only up to 23:59 on the day before move-out.
- When a buyer agrees to a price and a pickup time, the agent creates a `pickup.confirm` action and tells the buyer it is checking with the seller. A higher offer from another buyer replaces a waiting one.
- On `/sell` the renter clicks **Approve** and types the meetup address: the item is held (one active reservation per item), the bot sends that buyer the confirmation and address, and the other buyers are told it sold. **Decline** cancels the deal; nothing is sent, and the agent resumes on the buyer's next message.
- A daily Vercel Cron (`vercel.json`, `/api/cron/price-drops`) steps the advertised price down toward the minimum and edits the post. Payment is in person at pickup.
- **Posting to a seller's own group:** one shared bot serves every seller. On `/sell`, **Add the bot to a Telegram group** opens Telegram's group picker with a link code signed by `TELEGRAM_WEBHOOK_SECRET`. When the bot is added, Telegram sends `/start@<bot> <code>` in the group, the webhook verifies it and records the group in `telegram_targets`, and that seller's approved listings post there. Without a linked group they go to the default channel. Groups that only let admins add members need an admin to add the bot.

Setup (done once by the team, for all sellers):

1. In Telegram, message **@BotFather** → `/newbot`. Note the bot's username and token.
2. Create the default public channel (e.g. `@vacate_sale`) and add the bot as an admin that can post and edit messages.
3. Apply `supabase/migrations/20261024211500_telegram_selling.sql` and `20261024220000_telegram_groups.sql` to the Supabase project.
4. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_WEBHOOK_SECRET` (any long random string), `CRON_SECRET`, `SUPABASE_SECRET_KEY` and `OPENROUTER_API_KEY` in Vercel, then redeploy.
5. Point the bot at the deployment (run once, with your own token and secret):

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d url=https://<your-domain>/api/telegram/webhook -d secret_token=$TELEGRAM_WEBHOOK_SECRET -d allowed_updates='["message"]'
```

Buyers must open the chat from a listing's **Message seller** button: a bot can't message someone first. Buyer chats need the deployed URL; they don't reach `localhost`.

## Not wired up yet

Nothing here talks to Supabase, Gmail or Bland yet, and no page calls `/api/chat`. The planned contract with the agent:

- `POST /moves/:id/start`: read the lease, extract rules, draft the landlord email as an approval
- `POST /approvals/:id/execute`: send the approved email or place the call
- `POST /items/:id/chat`: buyer negotiation, returns `{ reply, deal? }`

Both sides share state through Supabase; the dashboard updates over Realtime.
