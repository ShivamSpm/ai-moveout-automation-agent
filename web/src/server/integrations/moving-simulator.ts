import {
  MOVING_SOURCE_LABEL,
  MovingQuoteSchema,
  SPECIALTY_KINDS,
  furnitureOf,
  type MovingExclusionReason,
  type MovingQuote,
  type MovingRequest,
  type SpecialtyKind,
} from "@/contracts/moving";
import type { LineItem, ProviderSummary, QuoteSlot } from "@/contracts/simulated-booking";
import type { MovingProviderCatalog, MovingProviderRow } from "./moving-catalog";
import type { CatalogSource } from "./postgrest-catalog";
import { HOUR_MS, SimulatedCalendar, cents, fromCents, sha256Hex, type CalendarBookingOutcome } from "./simulated-calendar";

// Planning constants. They are rough industry rules of thumb chosen for a believable simulation,
// not measurements; change them here and every quote follows.
export const BOX_CUFT = { small: 1.5, medium: 3, large: 4.5, wardrobe: 10 } as const;
export const FURNITURE_CUFT = { small: 10, medium: 25, large: 50, extraLarge: 80 } as const;
export const SPECIALTY_CUFT: Record<SpecialtyKind, number> = { piano: 60, safe: 15, pool_table: 50, artwork: 5, appliance: 30, aquarium: 15 };
/** Cubic feet one mover loads per hour at street level. */
export const MOVER_CUFT_PER_HOUR = 60;
const UNLOAD_SPEEDUP = 0.8;
const PER_FLIGHT_SLOWDOWN = 0.1;
const ELEVATOR_SLOWDOWN = 0.05;
const PER_50FT_CARRY_SLOWDOWN = 0.05;
const LOCAL_MILES = 30;
const LOCAL_MPH = 20;
const HIGHWAY_MPH = 45;
const DRIVE_BUFFER_HOURS = 0.25;
const PACKING_MOVER_HOURS_PER_BOX = 0.15;
const UNPACKING_MOVER_HOURS_PER_BOX = 0.1;
const DISASSEMBLY_MOVER_HOURS_PER_ITEM = 0.5;
/** Partial packing covers the fragile share of the boxes (kitchen, glassware, art). */
const PARTIAL_PACKING_SHARE = 0.4;
const HEAVY_SPECIALTY: readonly SpecialtyKind[] = ["piano", "safe", "pool_table"];
const MAX_SLOTS_PER_QUOTE = 6;
const QUOTE_VALID_HOURS = 48;

const SPECIALTY_LABEL: Record<SpecialtyKind, string> = {
  piano: "piano",
  safe: "safe",
  pool_table: "pool table",
  artwork: "artwork",
  appliance: "appliance",
  aquarium: "aquarium",
};

function crewNeeded(volumeCuFt: number): number {
  if (volumeCuFt <= 250) return 2;
  if (volumeCuFt <= 600) return 3;
  if (volumeCuFt <= 1000) return 4;
  return 5;
}

export interface MoveEstimate {
  volumeCuFt: number;
  /** Movers the volume and heavy-item rules call for. */
  crewNeeded: number;
  crewSize: number;
  trucks: number;
  fitsFleet: boolean;
  laborHours: number;
  driveHours: number;
  boxesTotal: number;
  boxesPacked: number;
  /** Large and extra-large furniture, the pieces that get disassembled. */
  bigFurniture: number;
  flights: number;
  carryUnits: number;
}

function endpointSlowdown(floor: number, hasElevator: boolean, longCarryFeet: number): number {
  const flights = hasElevator ? 0 : floor - 1;
  return 1 + flights * PER_FLIGHT_SLOWDOWN + (hasElevator ? ELEVATOR_SLOWDOWN : 0) + Math.ceil(longCarryFeet / 50) * PER_50FT_CARRY_SLOWDOWN;
}

/** Volume, crew, trucks and hours for one company, from the documented constants above. */
export function estimateMove(request: MovingRequest, row: MovingProviderRow): MoveEstimate {
  const { boxes, origin, destination, services } = request;
  const furniture = furnitureOf(request);
  const boxesTotal = boxes.small + boxes.medium + boxes.large + boxes.wardrobe;
  const volumeCuFt =
    boxes.small * BOX_CUFT.small +
    boxes.medium * BOX_CUFT.medium +
    boxes.large * BOX_CUFT.large +
    boxes.wardrobe * BOX_CUFT.wardrobe +
    furniture.small * FURNITURE_CUFT.small +
    furniture.medium * FURNITURE_CUFT.medium +
    furniture.large * FURNITURE_CUFT.large +
    furniture.extraLarge * FURNITURE_CUFT.extraLarge +
    request.specialtyItems.reduce((sum, item) => sum + item.count * SPECIALTY_CUFT[item.kind], 0);

  const heavy = request.specialtyItems.some((item) => HEAVY_SPECIALTY.includes(item.kind));
  const needed = Math.max(crewNeeded(volumeCuFt), heavy ? 3 : 2);
  const offered = [...row.crew_sizes].sort((a, b) => a - b);
  const crewSize = offered.find((size) => size >= needed) ?? offered[offered.length - 1];
  const trucks = Math.max(1, Math.ceil(volumeCuFt / row.truck_capacity_cuft));

  const boxesPacked = services.packing === "full" ? boxesTotal : services.packing === "partial" ? Math.ceil(boxesTotal * PARTIAL_PACKING_SHARE) : 0;
  const bigFurniture = furniture.large + furniture.extraLarge;
  const baseLoad = volumeCuFt / (crewSize * MOVER_CUFT_PER_HOUR);
  const driveHours = (request.distanceMiles <= LOCAL_MILES ? request.distanceMiles / LOCAL_MPH : request.distanceMiles / HIGHWAY_MPH) + DRIVE_BUFFER_HOURS;
  const moverHours =
    boxesPacked * PACKING_MOVER_HOURS_PER_BOX +
    (services.unpacking ? boxesTotal * UNPACKING_MOVER_HOURS_PER_BOX : 0) +
    (services.disassemblyReassembly ? bigFurniture * DISASSEMBLY_MOVER_HOURS_PER_ITEM : 0);
  const hours =
    baseLoad * endpointSlowdown(origin.floor, origin.hasElevator, origin.longCarryFeet) +
    baseLoad * UNLOAD_SPEEDUP * endpointSlowdown(destination.floor, destination.hasElevator, destination.longCarryFeet) +
    driveHours +
    moverHours / crewSize;

  return {
    volumeCuFt,
    crewNeeded: needed,
    crewSize,
    trucks,
    fitsFleet: trucks <= row.max_trucks,
    laborHours: Math.max(row.min_hours, Math.ceil(hours * 2) / 2),
    driveHours,
    boxesTotal,
    boxesPacked,
    bigFurniture,
    flights: (origin.hasElevator ? 0 : origin.floor - 1) + (destination.hasElevator ? 0 : destination.floor - 1),
    carryUnits: Math.ceil(origin.longCarryFeet / 50) + Math.ceil(destination.longCarryFeet / 50),
  };
}

const HANDLES: Record<SpecialtyKind, { can: keyof MovingProviderRow; fee: keyof MovingProviderRow }> = {
  piano: { can: "handles_piano", fee: "piano_fee_usd" },
  safe: { can: "handles_safe", fee: "safe_fee_usd" },
  pool_table: { can: "handles_pool_table", fee: "pool_table_fee_usd" },
  artwork: { can: "handles_artwork", fee: "artwork_fee_usd" },
  appliance: { can: "handles_appliance", fee: "appliance_fee_usd" },
  aquarium: { can: "handles_aquarium", fee: "aquarium_fee_usd" },
};

/** Every hard rule the company fails, in a fixed order. */
function hardReasons(request: MovingRequest, row: MovingProviderRow, estimate: MoveEstimate, now: Date): MovingExclusionReason[] {
  const reasons: MovingExclusionReason[] = [];
  const { services } = request;
  if (!row.service_zips.includes(request.origin.zip)) {
    reasons.push({ code: "outside_service_area", detail: `does not pick up from ZIP ${request.origin.zip}` });
  }
  if (request.distanceMiles > row.max_distance_miles) {
    reasons.push({ code: "distance_exceeds_limit", detail: `moves at most ${row.max_distance_miles} miles; this move is ${request.distanceMiles}` });
  }
  for (const item of request.specialtyItems) {
    if (!row[HANDLES[item.kind].can]) reasons.push({ code: "specialty_not_handled", detail: `does not move a ${SPECIALTY_LABEL[item.kind]}` });
  }
  if ((services.packing !== "none" || services.packingMaterials) && !row.offers_packing) {
    reasons.push({ code: "packing_not_offered", detail: "does not offer packing or packing materials" });
  }
  if (services.unpacking && !row.offers_unpacking) reasons.push({ code: "unpacking_not_offered", detail: "does not offer unpacking" });
  if (services.disassemblyReassembly && !row.offers_disassembly) {
    reasons.push({ code: "disassembly_not_offered", detail: "does not disassemble or reassemble furniture" });
  }
  if (services.storageMonths > 0 && !row.offers_storage) reasons.push({ code: "storage_not_offered", detail: "does not offer storage" });
  if (request.insurance === "full_value" && !row.offers_full_value) {
    reasons.push({ code: "insurance_not_offered", detail: "offers basic coverage only, not full-value protection" });
  }
  if (!estimate.fitsFleet) {
    reasons.push({
      code: "capacity_exceeded",
      detail: `about ${estimate.volumeCuFt} cu ft needs ${estimate.trucks} truck(s) of ${row.truck_capacity_cuft} cu ft; it has ${row.max_trucks}`,
    });
  }
  const largestCrew = Math.max(...row.crew_sizes);
  if (estimate.crewNeeded > largestCrew) {
    reasons.push({
      code: "crew_too_small",
      detail: `about ${estimate.volumeCuFt} cu ft needs ${estimate.crewNeeded} movers; its largest crew is ${largestCrew}`,
    });
  }
  // Jobs are scheduled inside one working day; multi-day long-distance moves are not simulated.
  const workingDay = row.day_end_hour - row.day_start_hour;
  if (estimate.laborHours > workingDay && request.distanceMiles > LOCAL_MILES) {
    reasons.push({
      code: "long_distance_not_supported",
      detail: `a ${request.distanceMiles}-mile move takes about ${estimate.laborHours} hours, longer than its ${workingDay}-hour working day`,
    });
  }
  if (now.getTime() + (row.min_notice_hours + estimate.laborHours) * HOUR_MS > Date.parse(request.moveWindow.latestFinish)) {
    reasons.push({ code: "insufficient_notice", detail: `needs ${row.min_notice_hours} hours' notice, which ends after the window closes` });
  }
  return reasons;
}

function priceLines(request: MovingRequest, row: MovingProviderRow, e: MoveEstimate, now: Date) {
  const lines: LineItem[] = [];
  const add = (code: string, label: string, kind: LineItem["kind"], usd: number) => {
    lines.push({ code, label, kind, amountUsd: fromCents(cents(usd)) });
  };
  const { services } = request;
  add("labor", `${e.crewSize} movers x ${e.laborHours} h`, "base", e.crewSize * e.laborHours * row.hourly_rate_per_mover_usd);
  add("truck", `${e.trucks} truck(s)`, "base", e.trucks * row.truck_fee_usd);
  add("travel", "Travel to the pickup", "base", row.travel_fee_usd);
  if (e.boxesPacked > 0) add("packing", `Packing ${e.boxesPacked} box(es) (${services.packing})`, "add_on", e.boxesPacked * row.packing_usd_per_box);
  if (services.packingMaterials) add("materials", `Materials for ${e.boxesTotal} box(es)`, "add_on", e.boxesTotal * row.materials_usd_per_box);
  if (e.flights > 0) add("stairs", `${e.flights} flight(s) of stairs`, "surcharge", e.flights * row.stairs_fee_per_flight_usd);
  if (e.carryUnits > 0) add("long_carry", `Long carry, ${e.carryUnits} x 50 ft`, "surcharge", e.carryUnits * row.long_carry_fee_per_50ft_usd);
  if (request.origin.parkingPermitNeeded) add("parking_permit", "Street parking permit at pickup", "surcharge", row.parking_permit_fee_usd);
  for (const item of request.specialtyItems) {
    add(`specialty_${item.kind}`, `${SPECIALTY_LABEL[item.kind]} x ${item.count}`, "add_on", item.count * (row[HANDLES[item.kind].fee] as number));
  }
  if (services.disassemblyReassembly && e.bigFurniture > 0) {
    add("disassembly", `Disassembly and reassembly, ${e.bigFurniture} piece(s)`, "add_on", e.bigFurniture * row.disassembly_usd_per_item);
  }
  if (services.unpacking) add("unpacking", `Unpacking ${e.boxesTotal} box(es)`, "add_on", e.boxesTotal * row.unpacking_usd_per_box);
  if (services.storageMonths > 0) {
    const units = Math.ceil(e.volumeCuFt / 100);
    add("storage", `Storage, ${services.storageMonths} month(s) x ${units * 100} cu ft`, "add_on", services.storageMonths * units * row.storage_usd_per_100cuft_month);
  }
  if (request.insurance === "full_value") {
    const declared = request.declaredValueUsd ?? 0;
    add("insurance", `Full-value protection on $${declared}`, "add_on", Math.max(row.full_value_min_usd, (declared * row.full_value_pct) / 100));
  } else {
    add("insurance", "Basic coverage (included)", "base", 0);
  }
  const subtotal = lines.reduce((sum, item) => sum + cents(item.amountUsd), 0);
  const rushCents = Math.round((subtotal * row.rush_pct) / 100);
  const rushed = (Date.parse(request.moveWindow.latestFinish) - now.getTime()) / HOUR_MS < row.rush_window_hours;
  if (rushed) lines.push({ code: "rush", label: `Rush: move within ${row.rush_window_hours} hours (${row.rush_pct}%)`, kind: "surcharge", amountUsd: fromCents(rushCents) });
  return { lines, rushCents, rushed };
}

export function summarizeMover(row: MovingProviderRow): ProviderSummary {
  return { id: row.slug, displayName: row.display_name, rating: row.rating, reviewCount: row.review_count, simulated: true };
}

export interface MoverOutcome {
  provider: ProviderSummary;
  quote: MovingQuote | null;
  reasons: MovingExclusionReason[];
}

export interface MovingMarketplaceQuotes {
  catalogSource: CatalogSource;
  catalogWarnings: string[];
  outcomes: MoverOutcome[];
}

export interface MovingBookingInput {
  quote: MovingQuote;
  slot: QuoteSlot;
  idempotencyKey: string;
  now: Date;
}

/** A moving marketplace; a real adapter can replace the simulator. `book` is idempotent per key. */
export interface MovingProvider {
  quote(request: MovingRequest, context: { now: Date; requestHash: string }): Promise<MovingMarketplaceQuotes>;
  book(input: MovingBookingInput): Promise<CalendarBookingOutcome>;
}

/** Moving crews on each company's simulated San Francisco calendar. */
export class SimulatedMovingMarketplace implements MovingProvider {
  readonly #calendar = new SimulatedCalendar();

  constructor(private readonly catalog: MovingProviderCatalog) {}

  async quote(request: MovingRequest, { now, requestHash }: { now: Date; requestHash: string }): Promise<MovingMarketplaceQuotes> {
    const listing = await this.catalog.listActive();
    const rows = [...listing.rows].sort((a, b) => a.slug.localeCompare(b.slug));
    return {
      catalogSource: listing.source,
      catalogWarnings: listing.warnings,
      outcomes: rows.map((row) => this.#quoteOne(row, request, now, requestHash)),
    };
  }

  #quoteOne(row: MovingProviderRow, request: MovingRequest, now: Date, requestHash: string): MoverOutcome {
    const provider = summarizeMover(row);
    const estimate = estimateMove(request, row);
    const reasons = hardReasons(request, row, estimate, now);
    if (reasons.length > 0) return { provider, quote: null, reasons };

    const { lines, rushCents, rushed } = priceLines(request, row, estimate, now);
    const totalCents = lines.reduce((sum, line) => sum + cents(line.amountUsd), 0);
    const from = Math.max(Date.parse(request.moveWindow.earliestStart), now.getTime() + row.min_notice_hours * HOUR_MS);
    const slots = this.#calendar.openSlots(row, from, Date.parse(request.moveWindow.latestFinish), estimate.laborHours).slice(0, MAX_SLOTS_PER_QUOTE);
    const issuedAt = now.toISOString();
    const quote: MovingQuote = {
      quoteId: `mq_${sha256Hex(`${requestHash}:${row.slug}:${issuedAt}`).slice(0, 20)}`,
      providerId: row.slug,
      providerName: row.display_name,
      simulated: true,
      source: { kind: "simulated", label: MOVING_SOURCE_LABEL },
      requestHash,
      priceUsd: {
        kind: "estimate",
        totalUsd: fromCents(totalCents),
        lineItems: lines,
        note: "Simulated estimate; a real mover bills actual hours and may re-quote after a walkthrough.",
      },
      estimate: {
        volumeCuFt: estimate.volumeCuFt,
        crewSize: estimate.crewSize,
        trucks: estimate.trucks,
        laborHours: estimate.laborHours,
        driveHours: Math.round(estimate.driveHours * 100) / 100,
        note: "Volume and hours come from simulator rules of thumb, not a survey of your home.",
      },
      durationHours: estimate.laborHours,
      inclusions: inclusionsFor(request),
      exclusions: exclusionsFor(row),
      fees: rushed
        ? []
        : [{ label: `Rush surcharge (${row.rush_pct}%)`, amountUsd: fromCents(rushCents), when: `the move is rescheduled to within ${row.rush_window_hours} hours` }],
      cancellation: { summary: row.cancellation_policy },
      deposit: {
        pct: row.deposit_pct,
        amountUsd: fromCents(Math.round((totalCents * row.deposit_pct) / 100)),
        note: "Simulated: no deposit is collected and no card is needed.",
      },
      insurance:
        request.insurance === "full_value"
          ? { coverage: "full_value", summary: `Full-value protection on a declared $${request.declaredValueUsd} (simulated terms).` }
          : { coverage: "basic", summary: "Basic coverage only (simulated terms); it does not pay full replacement value." },
      slots,
      rating: { stars: row.rating, reviewCount: row.review_count, simulated: true },
      issuedAt,
      quoteValidUntil: new Date(now.getTime() + QUOTE_VALID_HOURS * HOUR_MS).toISOString(),
    };
    // A quote outside its own contract (e.g. an extreme catalog price) is never offered as bookable.
    const checked = MovingQuoteSchema.safeParse(quote);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      return {
        provider,
        quote: null,
        reasons: [{ code: "quote_invalid", detail: `the simulated quote failed validation at ${issue?.path.join(".") || "(quote)"}: ${issue?.message}` }],
      };
    }
    return { provider, quote: checked.data, reasons: [] };
  }

  async book({ quote, slot, idempotencyKey, now }: MovingBookingInput): Promise<CalendarBookingOutcome> {
    const previous = this.#calendar.previous(slot.slotId, idempotencyKey);
    if (previous) return previous;
    const row = (await this.catalog.listActive()).rows.find((r) => r.slug === quote.providerId);
    if (!row) return { kind: "declined", detail: "the company is no longer in the active catalog" };
    return this.#calendar.reserve(row, slot, idempotencyKey, now);
  }

  bookingCount(): number {
    return this.#calendar.count();
  }
}

function inclusionsFor(request: MovingRequest): string[] {
  const { services } = request;
  return [
    "Loading, transport and unloading",
    "Furniture pads and shrink wrap",
    ...(services.packing !== "none" ? [`${services.packing === "full" ? "Full" : "Partial (fragile items)"} packing`] : []),
    ...(services.packingMaterials ? ["Boxes, tape and paper"] : []),
    ...(services.disassemblyReassembly ? ["Furniture disassembly and reassembly"] : []),
    ...(services.unpacking ? ["Unpacking at the destination"] : []),
    ...(services.storageMonths > 0 ? [`Storage for ${services.storageMonths} month(s)`] : []),
    ...request.specialtyItems.map((item) => `Specialty handling: ${SPECIALTY_LABEL[item.kind]}`),
  ];
}

function exclusionsFor(row: MovingProviderRow): string[] {
  return [
    "Hazardous materials, propane and open liquids",
    "Disposal of unwanted items",
    ...SPECIALTY_KINDS.filter((kind) => !row[HANDLES[kind].can]).map((kind) => `Specialty item: ${SPECIALTY_LABEL[kind]}`),
    ...(row.offers_packing ? [] : ["Packing and materials"]),
    ...(row.offers_unpacking ? [] : ["Unpacking"]),
    ...(row.offers_disassembly ? [] : ["Furniture disassembly"]),
    ...(row.offers_storage ? [] : ["Storage"]),
  ];
}
