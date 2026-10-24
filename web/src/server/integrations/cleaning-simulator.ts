import { createHash } from "node:crypto";
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

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** JSON with object keys sorted at every level, so equal values always hash equally. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

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

const TIME_ZONE = "America/Los_Angeles";
const SLOT_STEP_HOURS = 2;
const MAX_SLOTS_PER_QUOTE = 6;
const QUOTE_VALID_HOURS = 48;
const CREW_SIZE = 2;
const HOUR_MS = 60 * 60 * 1000;

/** Deterministic PRNG (mulberry32) seeded from a sha256 of the seed text. */
export function seededRandom(seedText: string): () => number {
  let state = parseInt(sha256Hex(seedText).slice(0, 8), 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cents = (usd: number) => Math.round(usd * 100);
const fromCents = (value: number) => value / 100;

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

interface LocalDay {
  year: number;
  month: number;
  day: number;
}

const localFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function localParts(ms: number) {
  const parts = Object.fromEntries(localFormat.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function offsetMs(ms: number): number {
  const p = localParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of a wall-clock time in San Francisco, where every simulated company works. */
function localToUtc({ year, month, day }: LocalDay, hour: number): number {
  const guess = Date.UTC(year, month - 1, day, 0) + hour * HOUR_MS;
  const first = guess - offsetMs(guess);
  return guess - offsetMs(first);
}

const dayKeyOf = (day: LocalDay) => `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;

function slotIdOf(slug: string, startMs: number): string {
  return `${slug}:${new Date(startMs).toISOString()}`;
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

/**
 * Hourly cleaning slots in San Francisco. Seeded per company and day, so every requester sees the
 * same calendar: a share of each day's jobs is already taken, and simulated bookings take more.
 */
export class SimulatedCleaningMarketplace implements CleaningProvider {
  readonly #bookings = new Map<string, { idempotencyKey: string; confirmationCode: string; bookedAt: string; dayKey: string }>();

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
    const slots = this.#openSlots(row, from, Date.parse(request.window.latestFinish), hours).slice(0, MAX_SLOTS_PER_QUOTE);
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

  /** Start times on the company's calendar in [fromMs, toMs] on days that still have a free crew. book() uses the same check. */
  #openSlots(row: ProviderRow, fromMs: number, toMs: number, hours: number): QuoteSlot[] {
    const slots: QuoteSlot[] = [];
    const first = localParts(fromMs);
    for (let offset = 0; ; offset += 1) {
      const date = new Date(Date.UTC(first.year, first.month - 1, first.day + offset));
      const day = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
      if (localToUtc(day, 0) > toMs) break;
      if (!row.works_weekdays.includes(date.getUTCDay())) continue;
      const dayKey = dayKeyOf(day);
      const alreadyTaken = Math.min(row.max_jobs_per_day, Math.floor(seededRandom(`${row.slug}:jobs:${dayKey}`)() * (row.max_jobs_per_day + 1)));
      const ours = [...this.#bookings.values()].filter((b) => b.dayKey === `${row.slug}:${dayKey}`).length;
      // Capacity is per day, separate from which start times are listed: a free crew can take any
      // unbooked start inside the window.
      if (row.max_jobs_per_day - alreadyTaken - ours <= 0) continue;
      for (let hour = row.day_start_hour; hour + hours <= row.day_end_hour; hour += SLOT_STEP_HOURS) {
        const start = localToUtc(day, hour);
        const end = start + hours * HOUR_MS;
        if (start < fromMs || end > toMs || this.#bookings.has(slotIdOf(row.slug, start))) continue;
        slots.push({ slotId: slotIdOf(row.slug, start), start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      }
    }
    return slots;
  }

  async book({ quote, slot, idempotencyKey, now }: ProviderBookingInput): Promise<ProviderBookingOutcome> {
    const existing = this.#bookings.get(slot.slotId);
    if (existing) {
      return existing.idempotencyKey === idempotencyKey
        ? { kind: "booked", confirmationCode: existing.confirmationCode, bookedAt: existing.bookedAt }
        : { kind: "declined", detail: "slot is already booked" };
    }
    const row = (await this.catalog.listActive()).rows.find((r) => r.slug === quote.providerId);
    if (!row) return { kind: "declined", detail: "the company is no longer in the active catalog" };
    const start = Date.parse(slot.start);
    const end = Date.parse(slot.end);
    if (start < now.getTime() + row.min_notice_hours * HOUR_MS) return { kind: "declined", detail: "slot is inside the company's notice period" };
    const open = this.#openSlots(row, start, end, (end - start) / HOUR_MS).some((s) => s.slotId === slot.slotId);
    if (!open) return { kind: "declined", detail: "slot is no longer open on the company's calendar" };

    // Re-checked after the await above: another booking may have taken the slot meanwhile.
    const raced = this.#bookings.get(slot.slotId);
    if (raced) {
      return raced.idempotencyKey === idempotencyKey
        ? { kind: "booked", confirmationCode: raced.confirmationCode, bookedAt: raced.bookedAt }
        : { kind: "declined", detail: "slot is already booked" };
    }
    const booking = {
      idempotencyKey,
      confirmationCode: `SIM-${sha256Hex(`${row.slug}:${slot.slotId}:${idempotencyKey}`).slice(0, 10).toUpperCase()}`,
      bookedAt: now.toISOString(),
      dayKey: `${row.slug}:${dayKeyOf(localParts(start))}`,
    };
    this.#bookings.set(slot.slotId, booking);
    return { kind: "booked", confirmationCode: booking.confirmationCode, bookedAt: booking.bookedAt };
  }

  bookingCount(): number {
    return this.#bookings.size;
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
