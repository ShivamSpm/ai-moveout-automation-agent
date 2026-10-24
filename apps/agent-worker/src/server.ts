// Agent worker placeholder. Gives the web app a real container to call while the
// actual worker (durable jobs, Muse Code SDK host, provider calls) is built.
// Every response carries `simulated: true`: nothing here sends email, places
// calls, posts listings or books anything.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { currentAsk, parseOffer, rankBuyers, respondToOffer, type BuyerOffer, type Listing } from "./negotiation.ts";

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = process.env.AGENT_WORKER_SECRET ?? "";
const MAX_BODY = 64 * 1024;

if (!SECRET) console.warn("AGENT_WORKER_SECRET is not set: requests are not authenticated (local only).");

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Handler = (params: string[], body: Record<string, unknown>) => unknown;

// Executed action ids by idempotency key, so a retried request doesn't run twice.
const executed = new Map<string, { actionId: string; at: string }>();

const today = () => new Date().toISOString().slice(0, 10);

const routes: Array<{ method: string; pattern: RegExp; handler: Handler }> = [
  {
    method: "GET",
    pattern: /^\/health$/,
    handler: () => ({ ok: true, service: "agent-worker", simulated: true }),
  },
  {
    // Start a move: later reads the lease from Storage and extracts LeaseRules with page refs.
    method: "POST",
    pattern: /^\/moves\/([\w-]+)\/start$/,
    handler: ([moveId]) => ({
      moveId,
      status: "queued",
      simulated: true,
      leaseRules: {
        noticeDays: 30,
        noticeClause: "Lease §4.2 (sample)",
        carpetCleaning: { clause: "Lease §12.3 (sample)", riskUsd: 350 },
        generalCleaning: { clause: "Move-out guide p.2 (sample)", riskUsd: 450 },
        keyReturn: { clause: "Lease §15.1 (sample)", riskUsd: 150 },
      },
      note: "Sample rules, not extracted from a real lease.",
    }),
  },
  {
    // Execute a reviewed action (email, call, post, booking). Placeholder: records it, sends nothing.
    method: "POST",
    pattern: /^\/actions\/([\w-]+)\/execute$/,
    handler: ([actionId], body) => {
      const key = str(body.idempotencyKey, "idempotencyKey");
      const previous = executed.get(key);
      if (previous) return { ...previous, state: "simulated", simulated: true, duplicate: true };
      const record = { actionId, at: new Date().toISOString() };
      executed.set(key, record);
      return { ...record, state: "simulated", simulated: true, duplicate: false, executed: false };
    },
  },
  {
    // Buyer message on an item. Floor and deadline come from the web server, never the buyer.
    method: "POST",
    pattern: /^\/items\/([\w-]+)\/chat$/,
    handler: ([itemId], body) => {
      const listing = parseListing(body.listing);
      const message = str(body.message, "message");
      const lastCounter = typeof body.lastCounter === "number" ? body.lastCounter : null;
      const ask = currentAsk(listing, today());
      const offer = parseOffer(message);
      if (offer === null) {
        return { itemId, simulated: true, currentAsk: ask, reply: `It's still available. The price is $${ask}. What would you like to offer?` };
      }
      const outcome = respondToOffer(listing, offer, lastCounter, today());
      return {
        itemId,
        simulated: true,
        currentAsk: ask,
        reply: outcome.reply,
        ...(outcome.kind === "accept"
          ? { proposedDeal: { price: outcome.price, needsSellerApproval: true } }
          : { counter: outcome.price }),
      };
    },
  },
  {
    // Several interested buyers: rank by price and by pickup before the deadline.
    method: "POST",
    pattern: /^\/items\/([\w-]+)\/rank-buyers$/,
    handler: ([itemId], body) => {
      const listing = parseListing(body.listing);
      if (!Array.isArray(body.offers)) throw new HttpError(400, "offers must be an array");
      const offers: BuyerOffer[] = body.offers.map((o: Record<string, unknown>) => ({
        buyer: str(o?.buyer, "offers[].buyer"),
        price: num(o?.price, "offers[].price"),
        pickupDate: date(o?.pickupDate, "offers[].pickupDate"),
      }));
      const ranked = rankBuyers(listing, offers);
      return { itemId, simulated: true, ranked, recommended: ranked.find((r) => r.eligible) ?? null };
    },
  },
];

createServer(async (req, res) => {
  try {
    if (SECRET && !authorized(req)) throw new HttpError(401, "Missing or wrong bearer token");
    const url = new URL(req.url ?? "/", "http://localhost");
    for (const route of routes) {
      const match = req.method === route.method && url.pathname.match(route.pattern);
      if (match) return send(res, 200, route.handler(match.slice(1), req.method === "POST" ? await readJson(req) : {}));
    }
    throw new HttpError(404, "Not found");
  } catch (error) {
    if (error instanceof HttpError) return send(res, error.status, { error: error.message });
    console.error(error);
    send(res, 500, { error: "Internal error" });
  }
}).listen(PORT, () => console.log(`agent-worker listening on :${PORT}`));

function authorized(req: IncomingMessage): boolean {
  const given = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${SECRET}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, "Body too large");
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {}
  throw new HttpError(400, "Body must be a JSON object");
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function parseListing(raw: unknown): Listing {
  const l = (raw ?? {}) as Record<string, unknown>;
  const listing = { ask: num(l.ask, "listing.ask"), floor: num(l.floor, "listing.floor"), deadline: date(l.deadline, "listing.deadline") };
  if (listing.floor > listing.ask) throw new HttpError(400, "listing.floor is above listing.ask");
  return listing;
}

function str(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim() || v.length > 2000) throw new HttpError(400, `${name} must be a non-empty string`);
  return v;
}

function num(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new HttpError(400, `${name} must be a non-negative number`);
  return v;
}

function date(v: unknown, name: string): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `${name} must be YYYY-MM-DD`);
  return v;
}
