import {
  MOVING_BOOKING_DISCLAIMER,
  MOVING_QUOTES_DISCLAIMER,
  MovingBookingProposalSchema,
  MovingRequestSchema,
  ProposeMovingBookingInputSchema,
  type ApproveMovingBookingInput,
  type ExcludedMover,
  type FindMovingQuotesResult,
  type MovingBookingProposal,
  type MovingExclusionReason,
  type MovingQuote,
  type MovingRequestInput,
  type ProposeMovingBookingInput,
} from "@/contracts/moving";
import type { BookingResult } from "@/contracts/simulated-booking";
import { movingCatalogFromEnv } from "@/server/integrations/moving-catalog";
import { SimulatedMovingMarketplace, type MovingProvider } from "@/server/integrations/moving-simulator";
import { canonicalJson, sha256Hex } from "@/server/integrations/simulated-calendar";
import {
  InMemoryBookingRepository,
  SimulatedServiceError,
  approveBooking,
  ownerOf,
  parseOrThrow,
  proposeBooking,
  withoutClaimedSlots,
  type BookingKind,
  type BookingRepository,
} from "./simulated-booking";

const MAX_WINDOW_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MovingToolError = SimulatedServiceError;
export type MovingRepository = BookingRepository<MovingQuote>;

export class InMemoryMovingRepository extends InMemoryBookingRepository<MovingQuote> {}

export interface MovingContext {
  /** From the authenticated server session, never from the request body or model output. */
  ownerId: string;
  now: () => Date;
  repository: MovingRepository;
  provider: MovingProvider;
}

interface MovingServices {
  repository: MovingRepository;
  provider: MovingProvider;
}

const servicesKey = Symbol.for("vacate.moving-simulator.services");

/** One in-memory repository and simulator per server instance (kept across dev hot reloads). */
export function defaultMovingServices(): MovingServices {
  const holder = globalThis as typeof globalThis & { [servicesKey]?: MovingServices };
  holder[servicesKey] ??= {
    repository: new InMemoryMovingRepository(),
    provider: new SimulatedMovingMarketplace(movingCatalogFromEnv()),
  };
  return holder[servicesKey];
}

export function createMovingContext(ownerId: string, services: MovingServices = defaultMovingServices()): MovingContext {
  return { ownerId, now: () => new Date(), ...services };
}

/** Quotes from the simulated moving marketplace for a renter's own move. Nothing is reserved. */
export async function findMovingQuotes(input: MovingRequestInput, ctx: MovingContext): Promise<FindMovingQuotesResult> {
  const ownerId = ownerOf(ctx, "moving");
  const request = parseOrThrow(MovingRequestSchema, input);
  const now = ctx.now();
  const start = Date.parse(request.moveWindow.earliestStart);
  const finish = Date.parse(request.moveWindow.latestFinish);
  if (start >= finish) throw new SimulatedServiceError("invalid_request", "moveWindow.earliestStart must be before moveWindow.latestFinish");
  if (start < now.getTime()) throw new SimulatedServiceError("invalid_request", "The move window starts in the past");
  if (finish - start > MAX_WINDOW_DAYS * DAY_MS) {
    throw new SimulatedServiceError("invalid_request", `The move window may span at most ${MAX_WINDOW_DAYS} days`);
  }

  const requestHash = sha256Hex(canonicalJson(request));
  const { catalogSource, catalogWarnings, outcomes } = await ctx.provider.quote(request, { now, requestHash });
  const matches: MovingQuote[] = [];
  const excluded: ExcludedMover[] = [];
  const issued: MovingQuote[] = [];

  for (const { provider, quote: offered, reasons: hard } of outcomes) {
    if (!offered) {
      excluded.push({ provider, reasons: hard });
      continue;
    }
    const quote = await withoutClaimedSlots(offered, ctx.repository);
    issued.push(quote);
    const reasons: MovingExclusionReason[] = [...hard];
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

  const warnings: string[] = [];
  if (request.cleaningEarliestStart && Date.parse(request.cleaningEarliestStart) < finish) {
    warnings.push("The cleaning window can start before this move window ends; cleaning should follow moving out, so book it after the move.");
  }
  if (issued.some((q) => q.priceUsd.lineItems.some((line) => line.code === "rush"))) {
    warnings.push("The window closes soon, so some estimates include a rush surcharge.");
  }
  const reasons =
    matches.length > 0
      ? []
      : [
          "No simulated mover has a free slot within budget in this window.",
          ...excluded.map((e) => `${e.provider.displayName}: ${e.reasons.map((r) => r.detail).join("; ")}`),
        ];

  return { simulated: true, catalogSource, catalogWarnings, disclaimer: MOVING_QUOTES_DISCLAIMER, requestHash, matches, excluded, warnings, reasons };
}

const MOVING_BOOKING: BookingKind<MovingQuote> = {
  service: "moving",
  action: "book_simulated_move",
  proposalIdPrefix: "mbp_",
  approveKeyPrefix: "mov-approve-",
  proposeInputSchema: ProposeMovingBookingInputSchema,
  proposalSchema: MovingBookingProposalSchema,
  disclaimer: MOVING_BOOKING_DISCLAIMER,
};

/** Turns an issued moving quote and one of its slots into a booking that waits for the user's review. */
export function proposeMovingBooking(input: ProposeMovingBookingInput, ctx: MovingContext): Promise<MovingBookingProposal> {
  return proposeBooking(MOVING_BOOKING, input, ctx);
}

/** Executes a moving proposal the user approved; see approveBooking for the idempotency and hash rules. */
export function approveMovingBooking(input: ApproveMovingBookingInput, ctx: MovingContext): Promise<BookingResult> {
  return approveBooking(MOVING_BOOKING, input, ctx);
}
