import {
  SIMULATED_SOURCE_LABEL,
  type CleaningQuote,
  type CleaningRequest,
  type ExclusionReason,
  type LineItem,
  type ProviderSummary,
  type QuoteSlot,
} from "@/contracts/cleaning";
import type { CatalogSource, CleaningProviderCatalog, ProviderRow } from "./cleaning-catalog";
import { HOUR_MS, SimulatedCalendar, cents, fromCents, sha256Hex } from "./simulated-calendar";

export { canonicalJson, seededRandom, sha256Hex } from "./simulated-calendar";

/** One company's answer: a quote when it can price the job, plus every hard rule it fails. */
export interface ProviderOutcome {
  provider: ProviderSummary;
  quote: CleaningQuote | null;
  reasons: ExclusionReason[];
}

export interface MarketplaceQuotes {
  catalogSource: CatalogSource;
  catalogWarnings: string[];
  outcomes: ProviderOutcome[];
}

export type ProviderBookingOutcome =
  | { kind: "booked"; confirmationCode: string; bookedAt: string }
  | { kind: "declined"; detail: string };

export interface ProviderBookingInput {
  quote: CleaningQuote;
  slot: QuoteSlot;
  idempotencyKey: string;
  now: Date;
}

/**
 * A cleaning marketplace that quotes several companies and books one slot. The simulator below
 * implements it over the provider catalog; a real marketplace adapter can replace it without
 * changing the tools. `book` must be idempotent per idempotencyKey so an ambiguous outcome can be
 * reconciled by retrying with the same key.
 */
export interface CleaningProvider {
  quote(request: CleaningRequest, context: { now: Date; requestHash: string }): Promise<MarketplaceQuotes>;
  book(input: ProviderBookingInput): Promise<ProviderBookingOutcome>;
}

const MAX_SLOTS_PER_QUOTE = 6;
const QUOTE_VALID_HOURS = 48;
const CREW_SIZE = 2;

export function summarize(row: ProviderRow): ProviderSummary {
  return { id: row.slug, displayName: row.display_name, rating: row.rating, reviewCount: row.review_count, simulated: true };
}

interface WorkLine {
  code: string;
  label: string;
  kind: LineItem["kind"];
  usd: number;
  hours: number;
}

/** Each line depends only on the request and the row, never on another line. */
function workLines(request: CleaningRequest, row: ProviderRow): WorkLine[] {
  const { bedrooms, bathrooms, squareFeet, leaseRequirements: lease, itemsRemaining, access } = request;
  const rooms = Math.max(1, bedrooms);
  const extraArea = squareFeet ? Math.max(0, squareFeet - 800) : 0;
  const lines: WorkLine[] = [
    {
      code: "base",
      label: `Standard move-out clean, ${bedrooms} bd / ${bathrooms} ba`,
      kind: "base",
      usd: row.base_usd + row.per_bedroom_usd * bedrooms + row.per_bathroom_usd * bathrooms,
      hours: 2 + 0.75 * bedrooms + 0.5 * bathrooms + extraArea / 1000,
    },
  ];
  const add = (on: boolean, line: WorkLine) => {
    if (on) lines.push(line);
  };
  add(lease.deepClean, { code: "deep_clean", label: "Deep clean (lease requirement)", kind: "add_on", usd: row.deep_clean_usd, hours: 1.5 });
  add(lease.carpetCleaning, {
    code: "carpet_cleaning",
    label: `Professional carpet cleaning, ${rooms} room(s), with receipt`,
    kind: "add_on",
    usd: row.carpet_usd_per_room * rooms,
    hours: 0.5 * rooms,
  });
  add(lease.insideAppliances, { code: "inside_appliances", label: "Inside oven, fridge and dishwasher", kind: "add_on", usd: row.inside_appliances_usd, hours: 1 });
  add(lease.windows, { code: "windows", label: "Interior windows and tracks", kind: "add_on", usd: row.windows_usd, hours: 0.25 * (bedrooms + 2) });
  add(lease.walls, { code: "walls", label: "Wall washing and scuff removal", kind: "add_on", usd: row.walls_usd, hours: 1 });
  add(itemsRemaining.hasBulky, { code: "bulky_items_left", label: "Bulky items still in the unit", kind: "surcharge", usd: row.bulky_items_surcharge_usd, hours: 0.5 });
  add(access.pets, { code: "pets", label: "Pet hair and dander", kind: "surcharge", usd: row.pet_surcharge_usd, hours: 0.5 });
  add(access.stairs || access.noElevator, {
    code: "no_elevator",
    label: "Stairs or no elevator access",
    kind: "surcharge",
    usd: row.no_elevator_surcharge_usd,
    hours: 0.25,
  });
  return lines;
}

function priceLines(request: CleaningRequest, row: ProviderRow, now: Date): { lines: LineItem[]; rushCents: number; rushed: boolean } {
  const lines: LineItem[] = workLines(request, row).map((line) => ({
    code: line.code,
    label: line.label,
    kind: line.kind,
    amountUsd: fromCents(cents(line.usd)),
  }));
  const subtotal = lines.reduce((sum, line) => sum + cents(line.amountUsd), 0);
  const rushCents = Math.round((subtotal * row.rush_pct) / 100);
  const rushed = (Date.parse(request.window.latestFinish) - now.getTime()) / HOUR_MS < row.rush_window_hours;
  if (rushed) {
    lines.push({ code: "rush", label: `Rush: finish within ${row.rush_window_hours} hours (${row.rush_pct}%)`, kind: "surcharge", amountUsd: fromCents(rushCents) });
  }
  return { lines, rushCents, rushed };
}

function durationHours(request: CleaningRequest, row: ProviderRow): number {
  const work = workLines(request, row).reduce((sum, line) => sum + line.hours, 0);
  return Math.max(2, Math.ceil((work / CREW_SIZE) * 2) / 2);
}

/**
 * Hard rules that stop a company from taking the job at all, in a fixed order. ZIP is checked only
 * when the request gives one; a city name cannot be matched against service ZIPs.
 */
function hardReasons(request: CleaningRequest, row: ProviderRow, now: Date, hours: number): ExclusionReason[] {
  const reasons: ExclusionReason[] = [];
  const { serviceArea, leaseRequirements: lease, access } = request;
  if (serviceArea.kind === "zip" && !row.service_zips.includes(serviceArea.zip)) {
    reasons.push({ code: "outside_service_area", detail: `does not serve ZIP ${serviceArea.zip}` });
  }
  const capability = (needed: boolean, offered: boolean, code: ExclusionReason["code"], what: string) => {
    if (needed && !offered) reasons.push({ code, detail: `does not offer ${what}, which the lease requires` });
  };
  capability(lease.carpetCleaning, row.offers_carpet, "carpet_not_offered", "carpet cleaning");
  capability(lease.insideAppliances, row.offers_inside_appliances, "inside_appliances_not_offered", "inside-appliance cleaning");
  capability(lease.windows, row.offers_windows, "windows_not_offered", "window cleaning");
  capability(lease.walls, row.offers_walls, "walls_not_offered", "wall washing");
  if (access.pets && !row.accepts_pets) reasons.push({ code: "pets_not_accepted", detail: "does not clean homes with pets" });
  const earliestPossibleEnd = now.getTime() + (row.min_notice_hours + hours) * HOUR_MS;
  if (earliestPossibleEnd > Date.parse(request.window.latestFinish)) {
    reasons.push({ code: "insufficient_notice", detail: `needs ${row.min_notice_hours} hours' notice, which ends after the window closes` });
  }
  return reasons;
}

/** Cleaning slots on each company's simulated San Francisco calendar. */
export class SimulatedCleaningMarketplace implements CleaningProvider {
  readonly #calendar = new SimulatedCalendar();

  constructor(private readonly catalog: CleaningProviderCatalog) {}

  async quote(request: CleaningRequest, { now, requestHash }: { now: Date; requestHash: string }): Promise<MarketplaceQuotes> {
    const listing = await this.catalog.listActive();
    const rows = [...listing.rows].sort((a, b) => a.slug.localeCompare(b.slug));
    return {
      catalogSource: listing.source,
      catalogWarnings: listing.warnings,
      outcomes: rows.map((row) => this.#quoteOne(row, request, now, requestHash)),
    };
  }

  #quoteOne(row: ProviderRow, request: CleaningRequest, now: Date, requestHash: string): ProviderOutcome {
    const provider = summarize(row);
    const hours = durationHours(request, row);
    const reasons = hardReasons(request, row, now, hours);
    if (reasons.length > 0) return { provider, quote: null, reasons };

    const { lines, rushCents, rushed } = priceLines(request, row, now);
    const from = Math.max(Date.parse(request.window.earliestStart), now.getTime() + row.min_notice_hours * HOUR_MS);
    const slots = this.#calendar.openSlots(row, from, Date.parse(request.window.latestFinish), hours).slice(0, MAX_SLOTS_PER_QUOTE);
    const issuedAt = now.toISOString();
    const quote: CleaningQuote = {
      quoteId: `q_${sha256Hex(`${requestHash}:${row.slug}:${issuedAt}`).slice(0, 20)}`,
      providerId: row.slug,
      providerName: row.display_name,
      simulated: true,
      source: { kind: "simulated", label: SIMULATED_SOURCE_LABEL },
      requestHash,
      priceUsd: {
        kind: "estimate",
        totalUsd: fromCents(lines.reduce((sum, line) => sum + cents(line.amountUsd), 0)),
        lineItems: lines,
        note: "Simulated estimate; a real cleaner may change the price after seeing the unit.",
      },
      durationHours: hours,
      inclusions: inclusionsFor(request),
      exclusions: exclusionsFor(row),
      fees: rushed
        ? []
        : [{ label: `Rush surcharge (${row.rush_pct}%)`, amountUsd: fromCents(rushCents), when: `the job is moved to finish within ${row.rush_window_hours} hours` }],
      cancellation: { summary: row.cancellation_policy },
      slots,
      rating: { stars: row.rating, reviewCount: row.review_count, simulated: true },
      leaseClauseRefs: request.leaseRequirements.clauseRefs,
      issuedAt,
      quoteValidUntil: new Date(now.getTime() + QUOTE_VALID_HOURS * HOUR_MS).toISOString(),
    };
    return { provider, quote, reasons: [] };
  }

  async book({ quote, slot, idempotencyKey, now }: ProviderBookingInput): Promise<ProviderBookingOutcome> {
    const previous = this.#calendar.previous(slot.slotId, idempotencyKey);
    if (previous) return previous;
    const row = (await this.catalog.listActive()).rows.find((r) => r.slug === quote.providerId);
    if (!row) return { kind: "declined", detail: "the company is no longer in the active catalog" };
    // reserve() re-checks the slot after the await above, when another booking may have taken it.
    return this.#calendar.reserve(row, slot, idempotencyKey, now);
  }

  bookingCount(): number {
    return this.#calendar.count();
  }
}

function inclusionsFor(request: CleaningRequest): string[] {
  const lease = request.leaseRequirements;
  return [
    "Kitchen and bathroom surfaces, fixtures and floors",
    "Dusting, vacuuming and mopping of all rooms",
    ...(lease.deepClean ? ["Deep clean: baseboards, cabinets inside and out, grout"] : []),
    ...(lease.carpetCleaning ? ["Professional carpet cleaning with a receipt"] : []),
    ...(lease.insideAppliances ? ["Inside oven, fridge and dishwasher"] : []),
    ...(lease.windows ? ["Interior windows and tracks"] : []),
    ...(lease.walls ? ["Wall washing and scuff removal"] : []),
  ];
}

function exclusionsFor(row: ProviderRow): string[] {
  return [
    "Hauling, disposal or moving of items left in the unit",
    "Repairs, patching or painting",
    "Mold, biohazard or pest treatment",
    ...(row.offers_carpet ? [] : ["Carpet cleaning"]),
    ...(row.offers_inside_appliances ? [] : ["Inside appliances"]),
    ...(row.offers_windows ? [] : ["Windows"]),
    ...(row.offers_walls ? [] : ["Wall washing"]),
  ];
}
