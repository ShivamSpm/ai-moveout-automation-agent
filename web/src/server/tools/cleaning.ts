import {
  BookingProposalSchema,
  CleaningRequestSchema,
  ProposeCleaningBookingInputSchema,
  SIMULATED_BOOKING_DISCLAIMER,
  SIMULATED_QUOTES_DISCLAIMER,
  itemsRemainingFromInventories,
  type ApproveCleaningBookingInput,
  type BookingProposal,
  type BookingResult,
  type CleaningQuote,
  type CleaningRequestInput,
  type ExcludedProvider,
  type ExclusionReason,
  type FindCleaningQuotesResult,
  type ItemsRemaining,
  type ProposeCleaningBookingInput,
} from "@/contracts/cleaning";
import type { ProposedInventory } from "@/contracts/inventory";
import { catalogFromEnv } from "@/server/integrations/cleaning-catalog";
import { SimulatedCleaningMarketplace, canonicalJson, sha256Hex, type CleaningProvider } from "@/server/integrations/cleaning-simulator";
import {
  InMemoryBookingRepository,
  SimulatedServiceError,
  approveBooking,
  ownerOf as ownerOfService,
  parseOrThrow,
  proposeBooking,
  withoutClaimedSlots,
  type ApprovalRecord,
  type BookingKind,
  type BookingRepository,
  type ServiceErrorCode,
} from "./simulated-booking";

const MAX_WINDOW_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CleaningErrorCode = ServiceErrorCode;
export const CleaningToolError = SimulatedServiceError;
export type CleaningToolError = SimulatedServiceError;
export type { ApprovalRecord };

export type CleaningRepository = BookingRepository<CleaningQuote>;

export class InMemoryCleaningRepository extends InMemoryBookingRepository<CleaningQuote> {}

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

const ownerOf = (ctx: CleaningContext) => ownerOfService(ctx, "cleaning");

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
    const quote = await withoutClaimedSlots(offered, ctx.repository);
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

const CLEANING_BOOKING: BookingKind<CleaningQuote> = {
  service: "cleaning",
  action: "book_simulated_cleaning",
  proposalIdPrefix: "cbp_",
  approveKeyPrefix: "cln-approve-",
  proposeInputSchema: ProposeCleaningBookingInputSchema,
  proposalSchema: BookingProposalSchema,
  disclaimer: SIMULATED_BOOKING_DISCLAIMER,
};

/** Turns an issued quote and one of its slots into a booking that waits for the user's review. */
export function proposeCleaningBooking(input: ProposeCleaningBookingInput, ctx: CleaningContext): Promise<BookingProposal> {
  return proposeBooking(CLEANING_BOOKING, input, ctx);
}

/** Executes a proposal the user approved; see approveBooking for the idempotency and hash rules. */
export function approveCleaningBooking(input: ApproveCleaningBookingInput, ctx: CleaningContext): Promise<BookingResult> {
  return approveBooking(CLEANING_BOOKING, input, ctx);
}
