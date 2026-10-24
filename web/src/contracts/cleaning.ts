import { z } from "zod";
import type { ProposedInventory } from "./inventory";

export const SIMULATED_SOURCE_LABEL = "Simulated cleaning marketplace: fictional companies, no real provider was contacted";
export const SIMULATED_QUOTES_DISCLAIMER =
  "These are simulated estimates from fictional companies. No real cleaner was contacted and nothing is reserved.";
export const SIMULATED_BOOKING_DISCLAIMER =
  "Simulated result only: no real booking was made, no cleaner was contacted and no payment was taken.";

const isoDateTime = z.iso.datetime({ offset: true });
const usd = z.number().finite().min(0).max(100_000);
const shortText = z.string().trim().min(1).max(200);
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

// Only a ZIP or a city name: a street address is never needed to price a cleaning and must not be
// disclosed before a reviewed booking.
export const ServiceAreaSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("zip"), zip: z.string().regex(/^\d{5}$/, "zip must be 5 digits") }),
  z.strictObject({
    kind: z.literal("city"),
    city: z
      .string()
      .trim()
      .regex(/^[A-Za-z][A-Za-z .'-]{1,79}$/, "city must be a city name only, not a street address"),
  }),
]);
export type ServiceArea = z.infer<typeof ServiceAreaSchema>;

export const LeaseCleaningRequirementsSchema = z.strictObject({
  deepClean: z.boolean().default(false),
  carpetCleaning: z.boolean().default(false),
  insideAppliances: z.boolean().default(false),
  windows: z.boolean().default(false),
  walls: z.boolean().default(false),
  clauseRefs: z.array(shortText).max(20).default([]),
});

export const ItemsRemainingSchema = z.strictObject({
  count: z.number().int().min(0).max(10_000),
  hasBulky: z.boolean(),
  /** When item removal is planned to finish; cleaning may not start earlier (SERV-06). */
  removalCompleteBy: isoDateTime.optional(),
});
export type ItemsRemaining = z.infer<typeof ItemsRemainingSchema>;

export const CleaningRequestSchema = z.strictObject({
  // Cleaning one's own unit on move-out is renter work; landlord-side clear-outs are out of scope (SCOPE-03).
  requesterRole: z.literal("renter", { error: "only a renter cleaning their own move-out unit is supported" }),
  serviceArea: ServiceAreaSchema,
  bedrooms: z.number().int().min(0).max(10),
  bathrooms: z.number().min(0.5).max(10).multipleOf(0.5),
  squareFeet: z.number().int().min(100).max(20_000).optional(),
  leaseRequirements: LeaseCleaningRequirementsSchema,
  itemsRemaining: ItemsRemainingSchema,
  window: z.strictObject({
    earliestStart: isoDateTime,
    /** Before the handoff or walkthrough. */
    latestFinish: isoDateTime,
  }),
  maxBudgetUsd: z.number().finite().positive().max(100_000).optional(),
  access: z
    .strictObject({
      pets: z.boolean().default(false),
      stairs: z.boolean().default(false),
      noElevator: z.boolean().default(false),
    })
    .default({ pets: false, stairs: false, noElevator: false }),
});
export type CleaningRequest = z.output<typeof CleaningRequestSchema>;
export type CleaningRequestInput = z.input<typeof CleaningRequestSchema>;

export const LINE_ITEM_KINDS = ["base", "add_on", "surcharge"] as const;
export const LineItemSchema = z.strictObject({
  code: z.string().min(1),
  label: shortText,
  kind: z.enum(LINE_ITEM_KINDS),
  amountUsd: usd,
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const QuoteSlotSchema = z.strictObject({
  slotId: z.string().min(1).max(200),
  start: isoDateTime,
  end: isoDateTime,
});
export type QuoteSlot = z.infer<typeof QuoteSlotSchema>;

export const CancellationTermsSchema = z.strictObject({ summary: z.string().min(1).max(500) });
export type CancellationTerms = z.infer<typeof CancellationTermsSchema>;

export const SimulatedSourceSchema = z.strictObject({ kind: z.literal("simulated"), label: shortText });

export const CleaningQuoteSchema = z.strictObject({
  quoteId: z.string().min(1).max(100),
  providerId: z.string().min(1).max(100),
  providerName: shortText,
  simulated: z.literal(true),
  source: SimulatedSourceSchema,
  requestHash: sha256Hex,
  priceUsd: z.strictObject({
    kind: z.literal("estimate"),
    totalUsd: usd,
    lineItems: z.array(LineItemSchema).min(1),
    note: shortText,
  }),
  durationHours: z.number().positive().max(24),
  inclusions: z.array(shortText),
  exclusions: z.array(shortText),
  /** Conditional fees that are not in the estimate total, e.g. a rush surcharge for a later change. */
  fees: z.array(z.strictObject({ label: shortText, amountUsd: usd, when: shortText })),
  cancellation: CancellationTermsSchema,
  slots: z.array(QuoteSlotSchema),
  rating: z.strictObject({ stars: z.number().min(0).max(5), reviewCount: z.number().int().min(0), simulated: z.literal(true) }),
  leaseClauseRefs: z.array(shortText),
  issuedAt: isoDateTime,
  quoteValidUntil: isoDateTime,
});
export type CleaningQuote = z.infer<typeof CleaningQuoteSchema>;

export const EXCLUSION_CODES = [
  "outside_service_area",
  "carpet_not_offered",
  "inside_appliances_not_offered",
  "windows_not_offered",
  "walls_not_offered",
  "pets_not_accepted",
  "insufficient_notice",
  "no_availability",
  "over_budget",
] as const;
export type ExclusionCode = (typeof EXCLUSION_CODES)[number];

export interface ExclusionReason {
  code: ExclusionCode;
  detail: string;
}

export interface ProviderSummary {
  /** The catalog slug; stable across environments, unlike the row uuid. */
  id: string;
  displayName: string;
  rating: number;
  reviewCount: number;
  simulated: true;
}

export interface ExcludedProvider {
  provider: ProviderSummary;
  reasons: ExclusionReason[];
  /** Present when the company could price the job (no availability, over budget) so scope stays comparable. */
  quote?: CleaningQuote;
}

export interface FindCleaningQuotesResult {
  simulated: true;
  /** Where the company list came from; fixture data is never reported as database data. */
  catalogSource: "supabase" | "fixture";
  /** Skipped catalog rows and catalog fallbacks; empty when the catalog was read cleanly. */
  catalogWarnings: string[];
  disclaimer: string;
  requestHash: string;
  /** Within budget with at least one slot, cheapest first. */
  matches: CleaningQuote[];
  excluded: ExcludedProvider[];
  warnings: string[];
  /** Why the result is empty; empty when matches is non-empty. */
  reasons: string[];
}

export const ProposeCleaningBookingInputSchema = z.strictObject({
  quote: CleaningQuoteSchema,
  slotId: z.string().min(1).max(200),
});
export type ProposeCleaningBookingInput = z.infer<typeof ProposeCleaningBookingInputSchema>;

export const BookingProposalSchema = z.strictObject({
  id: z.string().min(1),
  simulated: z.literal(true),
  status: z.literal("pending_review"),
  quote: CleaningQuoteSchema,
  slot: QuoteSlotSchema,
  /** sha256 over the canonical serialization of what the user is approving. */
  payloadHash: sha256Hex,
  /** Suggested key for the approve call; any client key works once per proposal. */
  idempotencyKey: z.string().min(8).max(128),
  createdAt: isoDateTime,
});
export type BookingProposal = z.infer<typeof BookingProposalSchema>;

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export const ApproveCleaningBookingInputSchema = z.strictObject({
  proposalId: z.string().min(1).max(100),
  payloadHash: sha256Hex,
  idempotencyKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN, "idempotencyKey must be 8-128 of A-Z a-z 0-9 . _ : -"),
});
export type ApproveCleaningBookingInput = z.infer<typeof ApproveCleaningBookingInputSchema>;

export const BOOKING_REJECTION_REASONS = ["payload_mismatch", "quote_expired", "slot_unavailable", "provider_declined"] as const;
export type BookingRejectionReason = (typeof BOOKING_REJECTION_REASONS)[number];

export const BookingResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("simulated_confirmed"),
    simulated: z.literal(true),
    proposalId: z.string().min(1),
    providerId: z.string().min(1),
    providerName: shortText,
    confirmationCode: z.string().regex(/^SIM-[A-Z0-9]+$/),
    slot: QuoteSlotSchema,
    estimateTotalUsd: usd,
    cancellation: CancellationTermsSchema,
    confirmedAt: isoDateTime,
    disclaimer: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("rejected"),
    simulated: z.literal(true),
    proposalId: z.string().min(1),
    reason: z.enum(BOOKING_REJECTION_REASONS),
    message: shortText,
    disclaimer: z.string().min(1),
  }),
]);
export type BookingResult = z.infer<typeof BookingResultSchema>;

/** Counts what is still in the unit from proposed (not yet confirmed) inventories. */
export function itemsRemainingFromInventories(inventories: readonly ProposedInventory[]): Pick<ItemsRemaining, "count" | "hasBulky"> {
  const items = inventories.flatMap((inventory) => inventory.items);
  return {
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    hasBulky: items.some((item) => item.size_class === "bulky"),
  };
}
