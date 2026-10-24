import type { CleaningQuote } from "@/contracts/cleaning";
import type { MovingQuote } from "@/contracts/moving";

// Quotes the find tools issued, per owner, so a propose tool can book from a quote the server
// produced instead of trusting a quote body written by the model. In memory only (MVP): a restart
// or another serverless instance forgets them, and the renter has to search again.

export type StoredQuote = { service: "cleaning"; quote: CleaningQuote } | { service: "moving"; quote: MovingQuote };

const MAX_QUOTES_PER_OWNER = 50;
const storeKey = Symbol.for("vacate.agent.quote-store");

type Store = Map<string, Map<string, StoredQuote>>;

function store(): Store {
  const holder = globalThis as typeof globalThis & { [storeKey]?: Store };
  holder[storeKey] ??= new Map();
  return holder[storeKey];
}

export function rememberQuotes(ownerId: string, quotes: readonly StoredQuote[]): void {
  const all = store();
  const own = all.get(ownerId) ?? new Map<string, StoredQuote>();
  for (const entry of quotes) {
    own.delete(entry.quote.quoteId);
    own.set(entry.quote.quoteId, entry);
  }
  while (own.size > MAX_QUOTES_PER_OWNER) own.delete(own.keys().next().value as string);
  all.set(ownerId, own);
}

export function findQuote(ownerId: string, service: StoredQuote["service"], quoteId: string): StoredQuote | null {
  const entry = store().get(ownerId)?.get(quoteId);
  return entry && entry.service === service ? entry : null;
}

export function clearQuotes(): void {
  store().clear();
}
