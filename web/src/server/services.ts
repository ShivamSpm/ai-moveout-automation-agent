import "server-only";

import {
  BookingResultSchema,
  ServiceSearchResultSchema,
  type BookingRequest,
  type BookingResult,
  type ServiceSearchResult,
} from "@/contracts/services";
import { demoCleaningSearch } from "@/lib/demo-services";

// Thin client for the agent container (apps/agent-worker). Falls back to demo
// data when AGENT_WORKER_URL isn't set or the call fails, and says so, so the
// page never presents demo numbers as live results.

const WORKER_URL = process.env.AGENT_WORKER_URL?.replace(/\/$/, "") ?? "";
const WORKER_SECRET = process.env.AGENT_WORKER_SECRET ?? "";

export type Sourced<T> = { data: T; live: boolean; problem?: string };

async function callWorker(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const response = await fetch(`${WORKER_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(WORKER_SECRET ? { authorization: `Bearer ${WORKER_SECRET}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`agent-worker ${path} returned ${response.status}`);
  return response.json();
}

export async function searchCleaning(): Promise<Sourced<ServiceSearchResult>> {
  if (!WORKER_URL) return { data: demoCleaningSearch, live: false };
  const demo = demoCleaningSearch;
  try {
    const raw = await callWorker(
      "/services/search",
      { kind: "cleaning", location: "San Francisco, USA", deadline: demo.deadline, budget_usd: demo.budget_usd, home: demo.home },
      90_000,
    );
    return { data: ServiceSearchResultSchema.parse(raw), live: true };
  } catch (error) {
    console.error(error);
    return { data: demoCleaningSearch, live: false, problem: "The agent didn't answer, so this is demo data." };
  }
}

export async function bookService(request: BookingRequest): Promise<BookingResult> {
  if (WORKER_URL) {
    try {
      return BookingResultSchema.parse(await callWorker("/services/book", request, 30_000));
    } catch (error) {
      console.error(error);
    }
  }
  return {
    order_ref: `SIM-${request.idempotency_key.slice(0, 8).toUpperCase()}`,
    status: "simulated",
    provider_website: null,
    message: "Simulated booking: nothing was sent to the company. In production the agent books it and sends you the confirmation link.",
  };
}
