import { z } from "zod";

// Contracts shared by every simulated service marketplace (cleaning, moving): quote pieces, the
// reviewed proposal and the booking result. Service-specific quotes and requests live beside them.

export const isoDateTime = z.iso.datetime({ offset: true });
export const usd = z.number().finite().min(0).max(100_000);
export const shortText = z.string().trim().min(1).max(200);
export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const zipSchema = z.string().regex(/^\d{5}$/, "zip must be 5 digits");

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

export const RatingSchema = z.strictObject({
  stars: z.number().min(0).max(5),
  reviewCount: z.number().int().min(0),
  simulated: z.literal(true),
});

export const EstimatePriceSchema = z.strictObject({
  kind: z.literal("estimate"),
  totalUsd: usd,
  lineItems: z.array(LineItemSchema).min(1),
  note: shortText,
});

/** Conditional fees that are not in the estimate total, e.g. a rush surcharge for a later change. */
export const ConditionalFeeSchema = z.strictObject({ label: shortText, amountUsd: usd, when: shortText });

export interface ProviderSummary {
  /** The catalog slug; stable across environments, unlike the row uuid. */
  id: string;
  displayName: string;
  rating: number;
  reviewCount: number;
  simulated: true;
}

/** What every bookable simulated quote carries, whatever the service. */
export interface BookableQuote {
  quoteId: string;
  providerId: string;
  providerName: string;
  priceUsd: { totalUsd: number };
  cancellation: CancellationTerms;
  slots: QuoteSlot[];
  quoteValidUntil: string;
}

export function bookingProposalSchema<Q extends z.ZodType>(quote: Q) {
  return z.strictObject({
    id: z.string().min(1),
    simulated: z.literal(true),
    status: z.literal("pending_review"),
    quote,
    slot: QuoteSlotSchema,
    /** sha256 over the canonical serialization of what the user is approving. */
    payloadHash: sha256HexSchema,
    /** Suggested key for the approve call; any client key works once per proposal. */
    idempotencyKey: z.string().min(8).max(128),
    createdAt: isoDateTime,
  });
}

export interface Proposal<Q> {
  id: string;
  simulated: true;
  status: "pending_review";
  quote: Q;
  slot: QuoteSlot;
  payloadHash: string;
  idempotencyKey: string;
  createdAt: string;
}

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export const ApproveBookingInputSchema = z.strictObject({
  proposalId: z.string().min(1).max(100),
  payloadHash: sha256HexSchema,
  idempotencyKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN, "idempotencyKey must be 8-128 of A-Z a-z 0-9 . _ : -"),
});
export type ApproveBookingInput = z.infer<typeof ApproveBookingInputSchema>;

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
