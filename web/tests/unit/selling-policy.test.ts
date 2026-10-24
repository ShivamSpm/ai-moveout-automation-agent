import { describe, expect, it } from "vitest";
import { checkTurn, dollarAmounts, pickupCutoff, scheduledPrice, type TurnContext } from "@/server/selling/policy";

const DAY = 86_400_000;

describe("pickupCutoff", () => {
  it("is 23:59 local on the day before move-out", () => {
    // Nov 30 2026 move-out in Los Angeles (PST, UTC-8) -> Nov 29 23:59 PST = Nov 30 07:59 UTC.
    expect(pickupCutoff("2026-11-30", "America/Los_Angeles").toISOString()).toBe("2026-11-30T07:59:00.000Z");
  });
});

describe("scheduledPrice", () => {
  const publishedAt = new Date("2026-10-24T18:00:00Z");
  const cutoff = new Date("2026-11-03T07:59:00Z");
  const at = (days: number) => scheduledPrice({ askCents: 20_000, floorCents: 12_000, publishedAt, cutoff, now: new Date(publishedAt.getTime() + days * DAY) });

  it("starts at the asking price and only steps down once a day", () => {
    expect(at(0)).toBe(20_000);
    expect(at(0.9)).toBe(20_000);
    expect(at(1)).toBeLessThan(20_000);
  });

  it("never rises and never goes below the minimum", () => {
    let last = Infinity;
    for (let d = 0; d <= 20; d++) {
      const price = at(d);
      expect(price).toBeLessThanOrEqual(last);
      expect(price).toBeGreaterThanOrEqual(12_000);
      last = price;
    }
    expect(at(20)).toBe(12_000);
  });

  it("keeps the asking price when there is no lower minimum", () => {
    expect(scheduledPrice({ askCents: 5_000, floorCents: null, publishedAt, cutoff, now: cutoff })).toBe(5_000);
    expect(scheduledPrice({ askCents: 5_000, floorCents: 9_000, publishedAt, cutoff, now: cutoff })).toBe(5_000);
  });
});

describe("dollarAmounts", () => {
  it("reads whole, decimal and comma amounts", () => {
    expect(dollarAmounts("I can do $120, or $1,050.5 with $ 80")).toEqual([12_000, 105_050, 8_000]);
  });
});

describe("checkTurn", () => {
  const now = new Date("2026-10-25T17:00:00Z");
  const ctx: TurnContext = {
    floorCents: 12_000,
    listedCents: 18_000,
    cutoff: new Date("2026-11-03T07:59:00Z"),
    now,
    buyerText: "Would you take $90?",
    addressPrivate: "100 Example St, Apt 2",
    pendingDealCents: null,
  };
  const never = () => false;
  const turn = (reply: string, deal: { priceCents: number; pickupStart: Date } | null = null) => ({ reply, buyerOfferCents: null, deal });
  const inTwoDays = new Date(now.getTime() + 2 * DAY);

  it("passes a counter-offer above the minimum", () => {
    expect(checkTurn(turn("$90 is too low for me, but I could do $160."), ctx, never)).toEqual({
      ok: true,
      reply: "$90 is too low for me, but I could do $160.",
      deal: null,
    });
  });

  it("blocks a reply that offers less than the minimum", () => {
    const checked = checkTurn(turn("Sure, $100 works."), ctx, never);
    expect(checked.ok).toBe(false);
    expect(!checked.ok && checked.fallback).toContain("$180");
  });

  it("blocks a reply that reveals the minimum", () => {
    expect(checkTurn(turn("My minimum is $120."), ctx, never).ok).toBe(false);
  });

  it("blocks a reply that reveals the exact address", () => {
    expect(checkTurn(turn("Come to 100 Example Street."), ctx, (t) => t.includes("100 Example")).ok).toBe(false);
  });

  it("rejects deals below the minimum, too soon, or after the cutoff", () => {
    expect(checkTurn(turn("Deal!", { priceCents: 11_000, pickupStart: inTwoDays }), ctx, never).ok).toBe(false);
    expect(checkTurn(turn("Deal!", { priceCents: 15_000, pickupStart: new Date(now.getTime() + 10 * 60_000) }), ctx, never).ok).toBe(false);
    const late = checkTurn(turn("Deal!", { priceCents: 15_000, pickupStart: new Date("2026-11-04T01:00:00Z") }), ctx, never);
    expect(late.ok).toBe(false);
    expect(!late.ok && late.reason).toBe("pickup after the cutoff");
  });

  it("accepts a valid deal, and only beats a waiting deal with a higher price", () => {
    const deal = { priceCents: 15_000, pickupStart: inTwoDays };
    expect(checkTurn(turn("Let me confirm with the seller.", deal), ctx, never)).toMatchObject({ ok: true, deal });
    expect(checkTurn(turn("Let me confirm with the seller.", deal), { ...ctx, pendingDealCents: 15_000 }, never).ok).toBe(false);
    expect(checkTurn(turn("Let me confirm with the seller.", deal), { ...ctx, pendingDealCents: 14_000 }, never).ok).toBe(true);
  });
});
