import type { z } from "zod";
import {
  ApproveCleaningBookingInputSchema,
  BookingProposalSchema,
  BookingResultSchema,
  CleaningRequestSchema,
  ProposeCleaningBookingInputSchema,
  SIMULATED_BOOKING_DISCLAIMER,
  SIMULATED_QUOTES_DISCLAIMER,
  itemsRemainingFromInventories,
  type ApproveCleaningBookingInput,
  type BookingProposal,
  type BookingResult,
  type CleaningQuote,
  type BookingRejectionReason,
  type CleaningRequestInput,
  type ExcludedProvider,
  type ExclusionReason,
  type FindCleaningQuotesResult,
  type ItemsRemaining,
  type ProposeCleaningBookingInput,
} from "@/contracts/cleaning";
import type { ProposedInventory } from "@/contracts/inventory";
import { catalogFromEnv } from "@/server/integrations/cleaning-catalog";
import {
  SimulatedCleaningMarketplace,
  canonicalJson,
  sha256Hex,
  type CleaningProvider,
} from "@/server/integrations/cleaning-simulator";

const MAX_WINDOW_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CleaningErrorCode = "invalid_request" | "not_found" | "conflict" | "quote_expired" | "slot_unavailable";

export class CleaningToolError extends Error {
  override name = "CleaningToolError";
  constructor(
    readonly code: CleaningErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ApprovalRecord {
  proposalId: string;
  /** The key of the first approve call; every provider call for this proposal reuses it. */
  idempotencyKey: string;
  state: "in_progress" | "completed";
  result: BookingResult | null;
}

/**
 * Storage for issued quotes, proposals, slot claims and approvals. Every method that decides a race
 * (saveProposal, claimSlot, beginApproval, completeApproval) is insert-if-absent and returns the
 * winning row, so a Supabase implementation maps each one to a single unique-keyed upsert. Unique
 * keys: (slotId), (ownerId, proposalId) and (ownerId, idempotencyKey).
 */
export interface CleaningRepository {
  saveQuotes(ownerId: string, quotes: readonly CleaningQuote[]): Promise<void>;
  getQuote(ownerId: string, quoteId: string): Promise<CleaningQuote | null>;
  saveProposal(ownerId: string, proposal: BookingProposal): Promise<BookingProposal>;
  getProposal(ownerId: string, proposalId: string): Promise<BookingProposal | null>;
  getSlotHolder(slotId: string): Promise<string | null>;
  claimSlot(slotId: string, proposalId: string): Promise<string>;
  releaseSlot(slotId: string, proposalId: string): Promise<void>;
  getApproval(ownerId: string, proposalId: string): Promise<ApprovalRecord | null>;
  getApprovalByKey(ownerId: string, idempotencyKey: string): Promise<ApprovalRecord | null>;
  /**
   * Inserts the approval if the proposal has none, atomically with the (ownerId, idempotencyKey)
   * claim. Returns the proposal's record, or "key_conflict" when the key already belongs to
   * another proposal of this owner.
   */
  beginApproval(ownerId: string, proposalId: string, idempotencyKey: string): Promise<ApprovalRecord | "key_conflict">;
  completeApproval(ownerId: string, proposalId: string, result: BookingResult): Promise<ApprovalRecord>;
}

const scoped = (ownerId: string, id: string) => `${ownerId}\u0000${id}`;
const copy = <T>(value: T): T => structuredClone(value);

// State lives in this server instance's memory only: it is lost on restart and not shared across
// serverless instances. A Supabase-backed CleaningRepository replaces it.
export class InMemoryCleaningRepository implements CleaningRepository {
  readonly #quotes = new Map<string, CleaningQuote>();
  readonly #proposals = new Map<string, BookingProposal>();
  readonly #slots = new Map<string, string>();
  readonly #approvals = new Map<string, ApprovalRecord>();
  readonly #keys = new Map<string, string>();

  async saveQuotes(ownerId: string, quotes: readonly CleaningQuote[]) {
    for (const quote of quotes) this.#quotes.set(scoped(ownerId, quote.quoteId), copy(quote));
  }
  async getQuote(ownerId: string, quoteId: string) {
    const quote = this.#quotes.get(scoped(ownerId, quoteId));
    return quote ? copy(quote) : null;
  }
  async saveProposal(ownerId: string, proposal: BookingProposal) {
    const key = scoped(ownerId, proposal.id);
    if (!this.#proposals.has(key)) this.#proposals.set(key, copy(proposal));
    return copy(this.#proposals.get(key)!);
  }
  async getProposal(ownerId: string, proposalId: string) {
    const proposal = this.#proposals.get(scoped(ownerId, proposalId));
    return proposal ? copy(proposal) : null;
  }
  async getSlotHolder(slotId: string) {
    return this.#slots.get(slotId) ?? null;
  }
  async claimSlot(slotId: string, proposalId: string) {
    if (!this.#slots.has(slotId)) this.#slots.set(slotId, proposalId);
    return this.#slots.get(slotId)!;
  }
  async releaseSlot(slotId: string, proposalId: string) {
    if (this.#slots.get(slotId) === proposalId) this.#slots.delete(slotId);
  }
  async getApproval(ownerId: string, proposalId: string) {
    const record = this.#approvals.get(scoped(ownerId, proposalId));
    return record ? copy(record) : null;
  }
  async getApprovalByKey(ownerId: string, idempotencyKey: string) {
    const proposalId = this.#keys.get(scoped(ownerId, idempotencyKey));
    return proposalId ? this.getApproval(ownerId, proposalId) : null;
  }
  async beginApproval(ownerId: string, proposalId: string, idempotencyKey: string): Promise<ApprovalRecord | "key_conflict"> {
    const keyOwner = this.#keys.get(scoped(ownerId, idempotencyKey));
    if (keyOwner !== undefined && keyOwner !== proposalId) return "key_conflict";
    const key = scoped(ownerId, proposalId);
    if (!this.#approvals.has(key)) {
      this.#approvals.set(key, { proposalId, idempotencyKey, state: "in_progress", result: null });
      this.#keys.set(scoped(ownerId, idempotencyKey), proposalId);
    }
    return copy(this.#approvals.get(key)!);
  }
  async completeApproval(ownerId: string, proposalId: string, result: BookingResult) {
    const key = scoped(ownerId, proposalId);
    const record = this.#approvals.get(key);
    if (!record) throw new Error(`no approval in progress for proposal ${proposalId}`);
    if (record.state !== "completed") this.#approvals.set(key, { ...record, state: "completed", result: copy(result) });
    return copy(this.#approvals.get(key)!);
  }
}

export interface CleaningContext {
  /** From the authenticated server session, never from the request body or model output. */
  ownerId: string;
  now: () => Date;
  repository: CleaningRepository;
  provider: CleaningProvider;
}

interface CleaningServices {
  repository: CleaningRepository;
  provider: CleaningProvider;
}

const servicesKey = Symbol.for("vacate.cleaning-simulator.services");

/** One in-memory repository and simulator per server instance (kept across dev hot reloads). */
export function defaultCleaningServices(): CleaningServices {
  const holder = globalThis as typeof globalThis & { [servicesKey]?: CleaningServices };
  holder[servicesKey] ??= {
    repository: new InMemoryCleaningRepository(),
    provider: new SimulatedCleaningMarketplace(catalogFromEnv()),
  };
  return holder[servicesKey];
}

export function createCleaningContext(ownerId: string, services: CleaningServices = defaultCleaningServices()): CleaningContext {
  return { ownerId, now: () => new Date(), ...services };
}

function ownerOf(ctx: CleaningContext): string {
  const ownerId = ctx.ownerId.trim();
  if (!ownerId) throw new Error("cleaning tools need an ownerId from the server context");
  return ownerId;
}

function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new CleaningToolError("invalid_request", `Invalid input: ${detail}`);
  }
  return parsed.data;
}

/** Remaining items for the cleaning request, from this owner's proposed inventories only. */
export function itemsRemainingForOwner(inventories: readonly ProposedInventory[], ctx: CleaningContext): Pick<ItemsRemaining, "count" | "hasBulky"> {
  const ownerId = ownerOf(ctx);
  if (inventories.some((inventory) => inventory.ownerId !== ownerId)) throw new CleaningToolError("not_found", "Inventory not found");
  return itemsRemainingFromInventories(inventories);
}

function removalWarning(items: ItemsRemaining): string | null {
  if (items.count === 0) return null;
  const what = `${items.count} item(s)${items.hasBulky ? ", including bulky items," : ""} are still in the unit.`;
  const when = items.removalCompleteBy
    ? ` Cleaning must follow item removal; slots start no earlier than the planned removal at ${items.removalCompleteBy}.`
    : " Cleaning must follow item removal: no removal time was given, so pick a slot after everything is out.";
  return what + when;
}

/** Quotes from the simulated marketplace for a renter's move-out clean. Nothing is reserved. */
export async function findCleaningQuotes(input: CleaningRequestInput, ctx: CleaningContext): Promise<FindCleaningQuotesResult> {
  const ownerId = ownerOf(ctx);
  const request = parseOrThrow(CleaningRequestSchema, input);
  const now = ctx.now();
  const start = Date.parse(request.window.earliestStart);
  const finish = Date.parse(request.window.latestFinish);
  if (start >= finish) throw new CleaningToolError("invalid_request", "window.earliestStart must be before window.latestFinish");
  if (start < now.getTime()) throw new CleaningToolError("invalid_request", "The cleaning window starts in the past");
  if (finish - start > MAX_WINDOW_DAYS * DAY_MS) {
    throw new CleaningToolError("invalid_request", `The cleaning window may span at most ${MAX_WINDOW_DAYS} days`);
  }
  const removal = request.itemsRemaining.removalCompleteBy;
  if (removal && start < Date.parse(removal)) {
    throw new CleaningToolError("invalid_request", "Cleaning cannot start before item removal is complete; move window.earliestStart after it");
  }

  const requestHash = sha256Hex(canonicalJson(request));
  const { catalogSource, catalogWarnings, outcomes } = await ctx.provider.quote(request, { now, requestHash });
  const matches: CleaningQuote[] = [];
  const excluded: ExcludedProvider[] = [];
  const issued: CleaningQuote[] = [];

  for (const { provider, quote: offered, reasons: hard } of outcomes) {
    if (!offered) {
      excluded.push({ provider, reasons: hard });
      continue;
    }
    const holders = await Promise.all(offered.slots.map((slot) => ctx.repository.getSlotHolder(slot.slotId)));
    const quote = { ...offered, slots: offered.slots.filter((_, i) => holders[i] === null) };
    issued.push(quote);
    const reasons: ExclusionReason[] = [...hard];
    if (quote.slots.length === 0) {
      reasons.push({ code: "no_availability", detail: `no free ${quote.durationHours}-hour slot inside the window` });
    }
    if (request.maxBudgetUsd !== undefined && quote.priceUsd.totalUsd > request.maxBudgetUsd) {
      reasons.push({
        code: "over_budget",
        detail: `estimate $${quote.priceUsd.totalUsd.toFixed(2)} is over the $${request.maxBudgetUsd.toFixed(2)} budget`,
      });
    }
    if (reasons.length > 0) excluded.push({ provider, reasons, quote });
    else matches.push(quote);
  }
  await ctx.repository.saveQuotes(ownerId, issued);
  matches.sort((a, b) => a.priceUsd.totalUsd - b.priceUsd.totalUsd || a.providerId.localeCompare(b.providerId));

  const warnings = [removalWarning(request.itemsRemaining)].filter((w): w is string => w !== null);
  if (request.serviceArea.kind === "city") {
    warnings.push("Only a city was given, so service areas were not checked; give a ZIP to filter companies by area.");
  }
  if (issued.some((q) => q.priceUsd.lineItems.some((line) => line.code === "rush"))) {
    warnings.push("The window closes soon, so some estimates include a rush surcharge.");
  }
  const reasons =
    matches.length > 0
      ? []
      : [
          "No simulated company has a free slot within budget in this window.",
          ...excluded.map((e) => `${e.provider.displayName}: ${e.reasons.map((r) => r.detail).join("; ")}`),
        ];

  return {
    simulated: true,
    catalogSource,
    catalogWarnings,
    disclaimer: SIMULATED_QUOTES_DISCLAIMER,
    requestHash,
    matches,
    excluded,
    warnings,
    reasons,
  };
}

function isExpired(quote: CleaningQuote, now: Date): boolean {
  return now.getTime() > Date.parse(quote.quoteValidUntil);
}

function payloadHashOf(ownerId: string, proposalId: string, quote: CleaningQuote, slotId: string): string {
  const slot = quote.slots.find((s) => s.slotId === slotId);
  return sha256Hex(canonicalJson({ action: "book_simulated_cleaning", ownerId, proposalId, quote, slot }));
}

/** Turns an issued quote and one of its slots into a booking that waits for the user's review. */
export async function proposeCleaningBooking(input: ProposeCleaningBookingInput, ctx: CleaningContext): Promise<BookingProposal> {
  const ownerId = ownerOf(ctx);
  const { quote: offered, slotId } = parseOrThrow(ProposeCleaningBookingInputSchema, input);
  const quote = await ctx.repository.getQuote(ownerId, offered.quoteId);
  if (!quote) throw new CleaningToolError("not_found", "Quote not found");
  // Prices and terms come from the stored quote; an edited copy from the client is refused.
  if (canonicalJson(quote) !== canonicalJson(offered)) {
    throw new CleaningToolError("invalid_request", "The quote does not match the quote that was issued; request new quotes");
  }
  const now = ctx.now();
  if (isExpired(quote, now)) throw new CleaningToolError("quote_expired", "The quote has expired; request new quotes");
  const slot = quote.slots.find((s) => s.slotId === slotId);
  if (!slot) throw new CleaningToolError("invalid_request", "The slot is not part of this quote");

  const id = `cbp_${sha256Hex(`${ownerId}:${quote.quoteId}:${slotId}`).slice(0, 24)}`;
  const holder = await ctx.repository.getSlotHolder(slotId);
  if ((holder !== null && holder !== id) || Date.parse(slot.start) <= now.getTime()) {
    throw new CleaningToolError("slot_unavailable", "The slot is no longer available; pick another slot");
  }
  const proposal = BookingProposalSchema.parse({
    id,
    simulated: true,
    status: "pending_review",
    quote,
    slot,
    payloadHash: payloadHashOf(ownerId, id, quote, slotId),
    idempotencyKey: `cln-approve-${id}`,
    createdAt: now.toISOString(),
  });
  return ctx.repository.saveProposal(ownerId, proposal);
}

function rejected(proposalId: string, reason: BookingRejectionReason, message: string): BookingResult {
  return BookingResultSchema.parse({ status: "rejected", simulated: true, proposalId, reason, message, disclaimer: SIMULATED_BOOKING_DISCLAIMER });
}

/**
 * Executes a proposal the user approved. The payload hash binds the approval to the exact quote,
 * slot and price; the approval record is claimed before the provider call, and every provider call
 * for one proposal reuses one idempotency key, so retries reconcile instead of double-booking.
 */
export async function approveCleaningBooking(input: ApproveCleaningBookingInput, ctx: CleaningContext): Promise<BookingResult> {
  const ownerId = ownerOf(ctx);
  const { proposalId, payloadHash, idempotencyKey } = parseOrThrow(ApproveCleaningBookingInputSchema, input);
  const { repository } = ctx;
  const proposal = await repository.getProposal(ownerId, proposalId);
  if (!proposal) throw new CleaningToolError("not_found", "Booking proposal not found");

  const byKey = await repository.getApprovalByKey(ownerId, idempotencyKey);
  if (byKey && byKey.proposalId !== proposal.id) {
    throw new CleaningToolError("conflict", "This idempotency key was already used for a different booking");
  }
  const existing = await repository.getApproval(ownerId, proposal.id);
  if (existing?.result) return existing.result;
  if (payloadHash !== proposal.payloadHash) {
    return rejected(proposal.id, "payload_mismatch", "The approval does not match the proposal under review; review it again");
  }
  // An approval already in progress may have reached the provider, so it is reconciled, not expired.
  if (!existing && isExpired(proposal.quote, ctx.now())) {
    return rejected(proposal.id, "quote_expired", "The quote expired before approval; request new quotes");
  }

  const record = await repository.beginApproval(ownerId, proposal.id, idempotencyKey);
  // The read above is only a fast path; this atomic claim is what makes the key unique per owner.
  if (record === "key_conflict") throw new CleaningToolError("conflict", "This idempotency key was already used for a different booking");
  if (record.result) return record.result;
  const finish = async (result: BookingResult) => (await repository.completeApproval(ownerId, proposal.id, result)).result!;

  const holder = await repository.claimSlot(proposal.slot.slotId, proposal.id);
  if (holder !== proposal.id) {
    return finish(rejected(proposal.id, "slot_unavailable", "Another booking took this slot first; pick another slot"));
  }
  // A throw here leaves the approval in progress and the slot claimed; the next call retries the
  // provider with the same key, which returns the earlier outcome instead of booking twice.
  const outcome = await ctx.provider.book({ quote: proposal.quote, slot: proposal.slot, idempotencyKey: record.idempotencyKey, now: ctx.now() });
  if (outcome.kind === "declined") {
    await repository.releaseSlot(proposal.slot.slotId, proposal.id);
    return finish(rejected(proposal.id, "provider_declined", `The simulated company declined: ${outcome.detail}`));
  }
  return finish(
    BookingResultSchema.parse({
      status: "simulated_confirmed",
      simulated: true,
      proposalId: proposal.id,
      providerId: proposal.quote.providerId,
      providerName: proposal.quote.providerName,
      confirmationCode: outcome.confirmationCode,
      slot: proposal.slot,
      estimateTotalUsd: proposal.quote.priceUsd.totalUsd,
      cancellation: proposal.quote.cancellation,
      confirmedAt: outcome.bookedAt,
      disclaimer: SIMULATED_BOOKING_DISCLAIMER,
    }),
  );
}
