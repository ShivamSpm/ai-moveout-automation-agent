// Deterministic selling rules. The model proposes wording and deals; this code
// decides what may be sent: never below the renter's minimum, never reveal it,
// never the exact address, and pickups only up to the day before move-out.

import { zonedIso } from "@/server/domain/drafts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Last moment a pickup may start: 23:59 local on the day before move-out. */
export function pickupCutoff(moveOutDate: string, timeZone: string): Date {
  const dayBefore = new Date(Date.parse(`${moveOutDate}T12:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  return new Date(zonedIso(dayBefore, "23:59", timeZone));
}

function roundPrice(cents: number): number {
  // $5 steps for larger prices, whole dollars below $50.
  const step = cents >= 5_000 ? 500 : 100;
  return Math.round(cents / step) * step;
}

/**
 * The advertised price at `now`: steps down from the asking price to the minimum
 * as the pickup cutoff approaches, reaching the minimum one day before it. Never
 * below the minimum and never above the asking price.
 */
export function scheduledPrice(input: {
  askCents: number;
  floorCents: number | null;
  publishedAt: Date;
  cutoff: Date;
  now: Date;
}): number {
  const { askCents, publishedAt, cutoff, now } = input;
  const floor = Math.min(input.floorCents ?? askCents, askCents);
  if (floor >= askCents) return askCents;
  const end = cutoff.getTime() - DAY_MS;
  const span = end - publishedAt.getTime();
  // Whole days elapsed, so the price changes once a day instead of every request.
  const elapsedDays = Math.floor((now.getTime() - publishedAt.getTime()) / DAY_MS);
  const fraction = span <= 0 ? 1 : Math.min(1, Math.max(0, (elapsedDays * DAY_MS) / span));
  const price = roundPrice(askCents - (askCents - floor) * fraction);
  return Math.min(askCents, Math.max(floor, price));
}

export const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** Dollar amounts mentioned in a message, in cents. */
export function dollarAmounts(text: string): number[] {
  return [...text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g)].map(
    (m) => Number(m[1].replace(/,/g, "")) * 100 + Number((m[2] ?? "0").padEnd(2, "0")),
  );
}

export interface ProposedTurn {
  reply: string;
  buyerOfferCents: number | null;
  deal: { priceCents: number; pickupStart: Date } | null;
}

export interface TurnContext {
  floorCents: number;
  listedCents: number;
  cutoff: Date;
  now: Date;
  /** The buyer's latest message: amounts the buyer named may be repeated back. */
  buyerText: string;
  addressPrivate: string | null;
  /** Price of a deal already waiting for the renter on this item, if any. */
  pendingDealCents: number | null;
}

export type CheckedTurn =
  | { ok: true; reply: string; deal: { priceCents: number; pickupStart: Date } | null }
  | { ok: false; reason: string; fallback: string };

const MIN_LEAD_MS = 60 * 60 * 1000;

/** Validates the agent's proposed reply and deal against the renter's limits. */
export function checkTurn(turn: ProposedTurn, ctx: TurnContext, disclosesAddress: (text: string) => boolean): CheckedTurn {
  const counter = usd(Math.max(ctx.floorCents, ctx.listedCents));
  const reply = turn.reply.trim();
  if (!reply) return { ok: false, reason: "empty reply", fallback: `Thanks for your message! It's ${counter}. Does that work for you?` };
  if (disclosesAddress(reply)) {
    return { ok: false, reason: "reply reveals the exact address", fallback: "I'll share the exact pickup spot once the seller confirms the deal." };
  }
  const buyerNamed = new Set(dollarAmounts(ctx.buyerText));
  const low = dollarAmounts(reply).find((cents) => cents < ctx.floorCents && !buyerNamed.has(cents));
  if (low !== undefined) {
    return { ok: false, reason: `reply mentions ${usd(low)}, below the minimum`, fallback: `I can't go that low, sorry. The best I can do is ${counter}.` };
  }
  if (/\b(minimum|floor|lowest (?:price|i can (?:go|do)))\b/i.test(reply) && dollarAmounts(reply).includes(ctx.floorCents)) {
    return { ok: false, reason: "reply reveals the minimum", fallback: `The best I can do is ${counter}.` };
  }
  if (!turn.deal) return { ok: true, reply, deal: null };

  const { priceCents, pickupStart } = turn.deal;
  if (!Number.isInteger(priceCents) || priceCents < ctx.floorCents) {
    return { ok: false, reason: "deal below the minimum", fallback: `I can't do that price, sorry. The best I can do is ${counter}.` };
  }
  if (Number.isNaN(pickupStart.getTime()) || pickupStart.getTime() < ctx.now.getTime() + MIN_LEAD_MS) {
    return { ok: false, reason: "pickup is too soon or invalid", fallback: "What day and time would you like to pick it up?" };
  }
  if (pickupStart.getTime() > ctx.cutoff.getTime()) {
    return {
      ok: false,
      reason: "pickup after the cutoff",
      fallback: `Pickup has to be by ${ctx.cutoff.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}. Does a time before then work?`,
    };
  }
  if (ctx.pendingDealCents !== null && priceCents <= ctx.pendingDealCents) {
    return {
      ok: false,
      reason: "another buyer's equal or better deal is already waiting for the seller",
      fallback: "Thanks! Someone else is ahead of you right now. I'll message you if it frees up.",
    };
  }
  return { ok: true, reply, deal: { priceCents, pickupStart } };
}
