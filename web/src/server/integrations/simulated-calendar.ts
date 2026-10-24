import { createHash } from "node:crypto";
import type { QuoteSlot } from "@/contracts/simulated-booking";

// Deterministic building blocks shared by the simulated marketplaces: hashing, a seeded PRNG and a
// San Francisco work calendar that knows its own simulated bookings.

export const HOUR_MS = 60 * 60 * 1000;
const TIME_ZONE = "America/Los_Angeles";

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

export const cents = (usd: number) => Math.round(usd * 100);
export const fromCents = (value: number) => value / 100;

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

/** The scheduling columns every provider catalog row has. */
export interface CalendarRules {
  slug: string;
  works_weekdays: readonly number[];
  day_start_hour: number;
  day_end_hour: number;
  max_jobs_per_day: number;
  min_notice_hours: number;
}

export type CalendarBookingOutcome =
  | { kind: "booked"; confirmationCode: string; bookedAt: string }
  | { kind: "declined"; detail: string };

interface Booking {
  idempotencyKey: string;
  confirmationCode: string;
  bookedAt: string;
  dayKey: string;
}

/**
 * Seeded per company and day, so every requester sees the same calendar: a share of each day's jobs
 * is already taken, and simulated bookings (held in this instance's memory) take more.
 */
export class SimulatedCalendar {
  readonly #bookings = new Map<string, Booking>();

  constructor(private readonly slotStepHours = 2) {}

  /** Start times in [fromMs, toMs] on days that still have a free crew. reserve() uses the same check. */
  openSlots(rules: CalendarRules, fromMs: number, toMs: number, hours: number): QuoteSlot[] {
    const slots: QuoteSlot[] = [];
    const first = localParts(fromMs);
    for (let offset = 0; ; offset += 1) {
      const date = new Date(Date.UTC(first.year, first.month - 1, first.day + offset));
      const day = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
      if (localToUtc(day, 0) > toMs) break;
      if (!rules.works_weekdays.includes(date.getUTCDay())) continue;
      const dayKey = dayKeyOf(day);
      const alreadyTaken = Math.min(
        rules.max_jobs_per_day,
        Math.floor(seededRandom(`${rules.slug}:jobs:${dayKey}`)() * (rules.max_jobs_per_day + 1)),
      );
      const ours = [...this.#bookings.values()].filter((b) => b.dayKey === `${rules.slug}:${dayKey}`).length;
      // Capacity is per day, separate from which start times are listed: a free crew can take any
      // unbooked start inside the window.
      if (rules.max_jobs_per_day - alreadyTaken - ours <= 0) continue;
      for (let hour = rules.day_start_hour; hour + hours <= rules.day_end_hour; hour += this.slotStepHours) {
        const start = localToUtc(day, hour);
        const end = start + hours * HOUR_MS;
        if (start < fromMs || end > toMs || this.#bookings.has(slotIdOf(rules.slug, start))) continue;
        slots.push({ slotId: slotIdOf(rules.slug, start), start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      }
    }
    return slots;
  }

  /** The earlier outcome for this slot, or null when it has never been booked. */
  previous(slotId: string, idempotencyKey: string): CalendarBookingOutcome | null {
    const existing = this.#bookings.get(slotId);
    if (!existing) return null;
    return existing.idempotencyKey === idempotencyKey
      ? { kind: "booked", confirmationCode: existing.confirmationCode, bookedAt: existing.bookedAt }
      : { kind: "declined", detail: "slot is already booked" };
  }

  /** Synchronous so the open-slot check and the write cannot interleave with another booking. */
  reserve(rules: CalendarRules, slot: QuoteSlot, idempotencyKey: string, now: Date): CalendarBookingOutcome {
    const previous = this.previous(slot.slotId, idempotencyKey);
    if (previous) return previous;
    const start = Date.parse(slot.start);
    const end = Date.parse(slot.end);
    if (start < now.getTime() + rules.min_notice_hours * HOUR_MS) return { kind: "declined", detail: "slot is inside the company's notice period" };
    const open = this.openSlots(rules, start, end, (end - start) / HOUR_MS).some((s) => s.slotId === slot.slotId);
    if (!open) return { kind: "declined", detail: "slot is no longer open on the company's calendar" };
    const booking: Booking = {
      idempotencyKey,
      confirmationCode: `SIM-${sha256Hex(`${rules.slug}:${slot.slotId}:${idempotencyKey}`).slice(0, 10).toUpperCase()}`,
      bookedAt: now.toISOString(),
      dayKey: `${rules.slug}:${dayKeyOf(localParts(start))}`,
    };
    this.#bookings.set(slot.slotId, booking);
    return { kind: "booked", confirmationCode: booking.confirmationCode, bookedAt: booking.bookedAt };
  }

  count(): number {
    return this.#bookings.size;
  }
}
