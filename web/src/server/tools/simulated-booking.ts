import type { z } from "zod";
import {
  ApproveBookingInputSchema,
  BookingResultSchema,
  type BookableQuote,
  type BookingRejectionReason,
  type BookingResult,
  type Proposal,
} from "@/contracts/simulated-booking";
import { canonicalJson, sha256Hex, type CalendarBookingOutcome } from "@/server/integrations/simulated-calendar";

// The reviewed-booking flow shared by every simulated service: owner-scoped storage, propose with a
// payload hash, and an idempotent approve that claims the slot before calling the provider.

export type ServiceErrorCode = "invalid_request" | "not_found" | "conflict" | "quote_expired" | "slot_unavailable";

export class SimulatedServiceError extends Error {
  override name = "SimulatedServiceError";
  constructor(
    readonly code: ServiceErrorCode,
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
export interface BookingRepository<Q extends BookableQuote> {
  saveQuotes(ownerId: string, quotes: readonly Q[]): Promise<void>;
  getQuote(ownerId: string, quoteId: string): Promise<Q | null>;
  saveProposal(ownerId: string, proposal: Proposal<Q>): Promise<Proposal<Q>>;
  getProposal(ownerId: string, proposalId: string): Promise<Proposal<Q> | null>;
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
// serverless instances. A Supabase-backed repository with the unique keys above replaces it.
export class InMemoryBookingRepository<Q extends BookableQuote> implements BookingRepository<Q> {
  readonly #quotes = new Map<string, Q>();
  readonly #proposals = new Map<string, Proposal<Q>>();
  readonly #slots = new Map<string, string>();
  readonly #approvals = new Map<string, ApprovalRecord>();
  readonly #keys = new Map<string, string>();

  async saveQuotes(ownerId: string, quotes: readonly Q[]) {
    for (const quote of quotes) this.#quotes.set(scoped(ownerId, quote.quoteId), copy(quote));
  }
  async getQuote(ownerId: string, quoteId: string) {
    const quote = this.#quotes.get(scoped(ownerId, quoteId));
    return quote ? copy(quote) : null;
  }
  async saveProposal(ownerId: string, proposal: Proposal<Q>) {
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

/** The provider side of a booking; must be idempotent per idempotencyKey. */
export interface BookingProvider<Q> {
  book(input: { quote: Q; slot: Proposal<Q>["slot"]; idempotencyKey: string; now: Date }): Promise<CalendarBookingOutcome>;
}

export interface BookingContext<Q extends BookableQuote> {
  /** From the authenticated server session, never from the request body or model output. */
  ownerId: string;
  now: () => Date;
  repository: BookingRepository<Q>;
  provider: BookingProvider<Q>;
}

/** What differs between services: names, prefixes, schemas and the disclaimer. */
export interface BookingKind<Q extends BookableQuote> {
  service: string;
  action: string;
  proposalIdPrefix: string;
  approveKeyPrefix: string;
  proposeInputSchema: z.ZodType<{ quote: Q; slotId: string }>;
  proposalSchema: z.ZodType<Proposal<Q>>;
  disclaimer: string;
}

export function ownerOf(ctx: { ownerId: string }, service: string): string {
  const ownerId = ctx.ownerId.trim();
  if (!ownerId) throw new Error(`${service} tools need an ownerId from the server context`);
  return ownerId;
}

export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new SimulatedServiceError("invalid_request", `Invalid input: ${detail}`);
  }
  return parsed.data;
}

/** The quote without slots another proposal has already claimed. */
export async function withoutClaimedSlots<Q extends BookableQuote>(quote: Q, repository: BookingRepository<Q>): Promise<Q> {
  const holders = await Promise.all(quote.slots.map((slot) => repository.getSlotHolder(slot.slotId)));
  return { ...quote, slots: quote.slots.filter((_, i) => holders[i] === null) };
}

function isExpired(quote: BookableQuote, now: Date): boolean {
  return now.getTime() > Date.parse(quote.quoteValidUntil);
}

/** Turns an issued quote and one of its slots into a booking that waits for the user's review. */
export async function proposeBooking<Q extends BookableQuote>(kind: BookingKind<Q>, input: unknown, ctx: BookingContext<Q>): Promise<Proposal<Q>> {
  const ownerId = ownerOf(ctx, kind.service);
  const { quote: offered, slotId } = parseOrThrow(kind.proposeInputSchema, input);
  const quote = await ctx.repository.getQuote(ownerId, offered.quoteId);
  if (!quote) throw new SimulatedServiceError("not_found", "Quote not found");
  // Prices and terms come from the stored quote; an edited copy from the client is refused.
  if (canonicalJson(quote) !== canonicalJson(offered)) {
    throw new SimulatedServiceError("invalid_request", "The quote does not match the quote that was issued; request new quotes");
  }
  const now = ctx.now();
  if (isExpired(quote, now)) throw new SimulatedServiceError("quote_expired", "The quote has expired; request new quotes");
  const slot = quote.slots.find((s) => s.slotId === slotId);
  if (!slot) throw new SimulatedServiceError("invalid_request", "The slot is not part of this quote");

  const id = `${kind.proposalIdPrefix}${sha256Hex(`${ownerId}:${quote.quoteId}:${slotId}`).slice(0, 24)}`;
  const holder = await ctx.repository.getSlotHolder(slotId);
  if ((holder !== null && holder !== id) || Date.parse(slot.start) <= now.getTime()) {
    throw new SimulatedServiceError("slot_unavailable", "The slot is no longer available; pick another slot");
  }
  const proposal = kind.proposalSchema.parse({
    id,
    simulated: true,
    status: "pending_review",
    quote,
    slot,
    payloadHash: sha256Hex(canonicalJson({ action: kind.action, ownerId, proposalId: id, quote, slot })),
    idempotencyKey: `${kind.approveKeyPrefix}${id}`,
    createdAt: now.toISOString(),
  });
  return ctx.repository.saveProposal(ownerId, proposal);
}

function rejected(kind: BookingKind<BookableQuote>, proposalId: string, reason: BookingRejectionReason, message: string): BookingResult {
  return BookingResultSchema.parse({ status: "rejected", simulated: true, proposalId, reason, message, disclaimer: kind.disclaimer });
}

/**
 * Executes a proposal the user approved. The payload hash binds every approve call, including a
 * repeat of an already-confirmed one, to the exact quote, slot and price. The approval record is
 * claimed before the provider call, and every provider call for one proposal reuses one
 * idempotency key, so retries reconcile instead of double-booking.
 */
export async function approveBooking<Q extends BookableQuote>(kind: BookingKind<Q>, input: unknown, ctx: BookingContext<Q>): Promise<BookingResult> {
  const ownerId = ownerOf(ctx, kind.service);
  const { proposalId, payloadHash, idempotencyKey } = parseOrThrow(ApproveBookingInputSchema, input);
  const { repository } = ctx;
  const generic = kind as unknown as BookingKind<BookableQuote>;
  const proposal = await repository.getProposal(ownerId, proposalId);
  if (!proposal) throw new SimulatedServiceError("not_found", "Booking proposal not found");
  if (payloadHash !== proposal.payloadHash) {
    return rejected(generic, proposal.id, "payload_mismatch", "The approval does not match the proposal under review; review it again");
  }

  const byKey = await repository.getApprovalByKey(ownerId, idempotencyKey);
  if (byKey && byKey.proposalId !== proposal.id) {
    throw new SimulatedServiceError("conflict", "This idempotency key was already used for a different booking");
  }
  const existing = await repository.getApproval(ownerId, proposal.id);
  if (existing?.result) return existing.result;
  // An approval already in progress may have reached the provider, so it is reconciled, not expired.
  if (!existing && isExpired(proposal.quote, ctx.now())) {
    return rejected(generic, proposal.id, "quote_expired", "The quote expired before approval; request new quotes");
  }

  const record = await repository.beginApproval(ownerId, proposal.id, idempotencyKey);
  // The read above is only a fast path; this atomic claim is what makes the key unique per owner.
  if (record === "key_conflict") throw new SimulatedServiceError("conflict", "This idempotency key was already used for a different booking");
  if (record.result) return record.result;
  const finish = async (result: BookingResult) => (await repository.completeApproval(ownerId, proposal.id, result)).result!;

  const holder = await repository.claimSlot(proposal.slot.slotId, proposal.id);
  if (holder !== proposal.id) {
    return finish(rejected(generic, proposal.id, "slot_unavailable", "Another booking took this slot first; pick another slot"));
  }
  // A throw here leaves the approval in progress and the slot claimed; the next call retries the
  // provider with the same key, which returns the earlier outcome instead of booking twice.
  const outcome = await ctx.provider.book({ quote: proposal.quote, slot: proposal.slot, idempotencyKey: record.idempotencyKey, now: ctx.now() });
  if (outcome.kind === "declined") {
    await repository.releaseSlot(proposal.slot.slotId, proposal.id);
    return finish(rejected(generic, proposal.id, "provider_declined", `The simulated company declined: ${outcome.detail}`));
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
      disclaimer: kind.disclaimer,
    }),
  );
}
