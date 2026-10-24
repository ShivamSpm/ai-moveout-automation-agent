# agent-worker (placeholder)

A small container the web app can call today, standing in for the real agent worker (durable jobs, the Muse Code SDK host, provider calls; see `docs/MONOREPO.md`). It has no dependencies: Node 24 runs the TypeScript directly.

**Everything here is simulated.** Every response includes `"simulated": true`. It never sends email, places calls, posts listings or books anything.

## Run it

```bash
cd apps/agent-worker
npm start          # http://localhost:8080
npm test           # negotiation rules
```

Or in Docker:

```bash
docker build -t agent-worker apps/agent-worker
docker run -p 8080:8080 -e AGENT_WORKER_SECRET=dev-secret agent-worker
```

## Auth

Set `AGENT_WORKER_SECRET` and send `Authorization: Bearer <secret>` from the web server. With it unset the worker accepts unauthenticated requests, which is for local development only. The web app should keep the worker URL and secret in server-side env vars (no `NEXT_PUBLIC_`).

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | | `{ ok, service, simulated }` |
| POST | `/moves/:id/start` | | `{ moveId, status: "queued", leaseRules }`, sample `LeaseRules` (same shape as `web/src/lib/schedule.ts`) |
| POST | `/actions/:id/execute` | `{ idempotencyKey }` | `{ actionId, state: "simulated", duplicate }`; a repeated key returns the first result instead of running again |
| POST | `/items/:id/chat` | `{ message, listing: { ask, floor, deadline }, lastCounter? }` | `{ reply, currentAsk, counter? , proposedDeal? }` |
| POST | `/items/:id/rank-buyers` | `{ listing, offers: [{ buyer, price, pickupDate }] }` | `{ ranked, recommended }` |

Dates are `YYYY-MM-DD`. The listing's `floor` (the seller's minimum) and `deadline` must come from the web server's own records, never from the buyer.

## Selling rules (`src/negotiation.ts`)

From the team's workflow notes:

- **Price drops as the deadline nears.** Full asking price until 14 days before the sell-by date, then it steps down toward the minimum, reaching it on the deadline.
- **Never below the minimum.** Counter-offers stay above it and replies never reveal it.
- **Deals wait for the seller.** An accepted offer comes back as `proposedDeal` with `needsSellerApproval: true`.
- **Several buyers:** offers below the minimum or with pickup after the deadline aren't eligible; the rest rank by price, then earlier pickup.

Not here yet: suggesting asking and minimum prices from comparable listings (planned for later).

## Replacing the placeholder

Keep the request and response shapes, swap the handler bodies in `src/server.ts` for real work, and drop `simulated: true` only from responses where something actually happened.
