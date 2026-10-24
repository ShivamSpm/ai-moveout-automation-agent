import { z } from "zod";
import { ProposedItemSchema, type ProposedItem } from "./inventory";
import {
  ApproveBookingInputSchema,
  CancellationTermsSchema,
  ConditionalFeeSchema,
  EstimatePriceSchema,
  QuoteSlotSchema,
  RatingSchema,
  SimulatedSourceSchema,
  bookingProposalSchema,
  isoDateTime,
  sha256HexSchema,
  shortText,
  usd,
  zipSchema,
  type ApproveBookingInput,
  type ProviderSummary,
} from "./simulated-booking";

export const MOVING_SOURCE_LABEL = "Simulated moving marketplace: fictional companies, no real mover was contacted";
export const MOVING_QUOTES_DISCLAIMER =
  "These are simulated estimates from fictional moving companies. No real mover was contacted and nothing is reserved.";
export const MOVING_BOOKING_DISCLAIMER =
  "Simulated result only: no real booking was made, no mover was contacted and no deposit or payment was taken.";

const count = (max: number) => z.number().int().min(0).max(max).default(0);

// Floors count from 1 (street level). Exact addresses are never needed to price a move.
const EndpointBase = {
  zip: zipSchema,
  floor: z.number().int().min(1).max(80),
  hasElevator: z.boolean(),
  longCarryFeet: z.number().int().min(0).max(2_000).default(0),
};

export const SPECIALTY_KINDS = ["piano", "safe", "pool_table", "artwork", "appliance", "aquarium"] as const;
export type SpecialtyKind = (typeof SPECIALTY_KINDS)[number];

export const FurnitureCountsSchema = z.strictObject({
  small: count(500),
  medium: count(500),
  large: count(200),
  extraLarge: count(100),
});
export type FurnitureCounts = z.infer<typeof FurnitureCountsSchema>;

const NO_FURNITURE = { small: 0, medium: 0, large: 0, extraLarge: 0 };

export const MovingRequestSchema = z
  .strictObject({
    // Moving one's own belongings out is renter work; removing a tenant's belongings is out of scope (SCOPE-03).
    requesterRole: z.literal("renter", { error: "only a renter moving their own belongings is supported" }),
    origin: z.strictObject({ ...EndpointBase, parkingPermitNeeded: z.boolean().default(false) }),
    destination: z.strictObject(EndpointBase),
    /** Supplied by the user; the simulator does no geocoding. */
    distanceMiles: z.number().finite().min(0.1).max(3_000),
    moveWindow: z.strictObject({ earliestStart: isoDateTime, latestFinish: isoDateTime }),
    boxes: z.strictObject({ small: count(1_000), medium: count(1_000), large: count(1_000), wardrobe: count(200) }),
    /** Counts by size; omit them and pass fromInventory to derive them instead. */
    furniture: FurnitureCountsSchema.optional(),
    /** Proposed vision items being moved; size_class maps small/medium/large/bulky to small/medium/large/extraLarge. */
    fromInventory: z.array(ProposedItemSchema).max(1_000).optional(),
    specialtyItems: z
      .array(z.strictObject({ kind: z.enum(SPECIALTY_KINDS), count: z.number().int().min(1).max(20) }))
      .max(SPECIALTY_KINDS.length)
      .default([])
      .refine((items) => new Set(items.map((i) => i.kind)).size === items.length, { message: "list each specialty kind once" }),
    services: z
      .strictObject({
        packing: z.enum(["none", "partial", "full"]).default("none"),
        packingMaterials: z.boolean().default(false),
        unpacking: z.boolean().default(false),
        disassemblyReassembly: z.boolean().default(false),
        storageMonths: z.number().int().min(0).max(24).default(0),
      })
      .default({ packing: "none", packingMaterials: false, unpacking: false, disassemblyReassembly: false, storageMonths: 0 }),
    insurance: z.enum(["basic", "full_value"]).default("basic"),
    /** Needed for full-value coverage, which is priced from it. */
    declaredValueUsd: z.number().finite().positive().max(1_000_000).optional(),
    maxBudgetUsd: z.number().finite().positive().max(100_000).optional(),
    /** When cleaning may start, if already planned; cleaning should follow moving out (SERV-06). */
    cleaningEarliestStart: isoDateTime.optional(),
    notes: z.string().trim().max(500).default(""),
  })
  .refine((r) => !(r.fromInventory && r.furniture), { message: "give furniture counts or fromInventory, not both", path: ["fromInventory"] })
  .refine((r) => r.insurance !== "full_value" || r.declaredValueUsd !== undefined, {
    message: "full_value insurance needs declaredValueUsd",
    path: ["declaredValueUsd"],
  });
export type MovingRequestInput = z.input<typeof MovingRequestSchema>;
export type MovingRequest = z.output<typeof MovingRequestSchema>;

/** Furniture counts from vision items: quantity per size_class, bulky counted as extraLarge. */
export function furnitureFromInventory(items: readonly Pick<ProposedItem, "size_class" | "quantity">[]): FurnitureCounts {
  const counts = { ...NO_FURNITURE };
  const key = { small: "small", medium: "medium", large: "large", bulky: "extraLarge" } as const;
  for (const item of items) counts[key[item.size_class]] += item.quantity;
  return counts;
}

/** The furniture a request moves, whichever way it was given. */
export function furnitureOf(request: MovingRequest): FurnitureCounts {
  return request.fromInventory ? furnitureFromInventory(request.fromInventory) : (request.furniture ?? NO_FURNITURE);
}

export const MovingQuoteSchema = z.strictObject({
  quoteId: z.string().min(1).max(100),
  providerId: z.string().min(1).max(100),
  providerName: shortText,
  simulated: z.literal(true),
  source: SimulatedSourceSchema,
  requestHash: sha256HexSchema,
  priceUsd: EstimatePriceSchema,
  estimate: z.strictObject({
    volumeCuFt: z.number().min(0),
    crewSize: z.number().int().min(1),
    trucks: z.number().int().min(1),
    laborHours: z.number().positive(),
    driveHours: z.number().min(0),
    note: shortText,
  }),
  /** Hours on the job, drive included; a move longer than one working day gets no slot. */
  durationHours: z.number().positive().max(200),
  inclusions: z.array(shortText),
  exclusions: z.array(shortText),
  fees: z.array(ConditionalFeeSchema),
  cancellation: CancellationTermsSchema,
  deposit: z.strictObject({ pct: z.number().min(0).max(100), amountUsd: usd, note: shortText }),
  insurance: z.strictObject({ coverage: z.enum(["basic", "full_value"]), summary: shortText }),
  slots: z.array(QuoteSlotSchema),
  rating: RatingSchema,
  issuedAt: isoDateTime,
  quoteValidUntil: isoDateTime,
});
export type MovingQuote = z.infer<typeof MovingQuoteSchema>;

export const MOVING_EXCLUSION_CODES = [
  "outside_service_area",
  "distance_exceeds_limit",
  "specialty_not_handled",
  "packing_not_offered",
  "unpacking_not_offered",
  "disassembly_not_offered",
  "storage_not_offered",
  "insurance_not_offered",
  "capacity_exceeded",
  "crew_too_small",
  "long_distance_not_supported",
  "insufficient_notice",
  "no_availability",
  "over_budget",
  "quote_invalid",
] as const;
export type MovingExclusionCode = (typeof MOVING_EXCLUSION_CODES)[number];

export interface MovingExclusionReason {
  code: MovingExclusionCode;
  detail: string;
}

export interface ExcludedMover {
  provider: ProviderSummary;
  reasons: MovingExclusionReason[];
  /** Present when the company could price the move (no availability, over budget). */
  quote?: MovingQuote;
}

export interface FindMovingQuotesResult {
  simulated: true;
  catalogSource: "supabase" | "fixture";
  catalogWarnings: string[];
  disclaimer: string;
  requestHash: string;
  /** Within budget with at least one slot, cheapest first. */
  matches: MovingQuote[];
  excluded: ExcludedMover[];
  warnings: string[];
  /** Why the result is empty; empty when matches is non-empty. */
  reasons: string[];
}

export const ProposeMovingBookingInputSchema = z.strictObject({
  quote: MovingQuoteSchema,
  slotId: z.string().min(1).max(200),
});
export type ProposeMovingBookingInput = z.infer<typeof ProposeMovingBookingInputSchema>;

export const MovingBookingProposalSchema = bookingProposalSchema(MovingQuoteSchema);
export type MovingBookingProposal = z.infer<typeof MovingBookingProposalSchema>;

export const ApproveMovingBookingInputSchema = ApproveBookingInputSchema;
export type ApproveMovingBookingInput = ApproveBookingInput;
