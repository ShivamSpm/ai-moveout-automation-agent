import { describe, expect, it, vi } from "vitest";
import {
  CleaningRequestSchema,
  itemsRemainingFromInventories,
  type CleaningQuote,
  type CleaningRequestInput,
  type FindCleaningQuotesResult,
} from "@/contracts/cleaning";
import type { ProposedInventory } from "@/contracts/inventory";
import { FixtureCleaningCatalog } from "@/server/integrations/cleaning-catalog";
import { SimulatedCleaningMarketplace } from "@/server/integrations/cleaning-simulator";
import {
  CleaningToolError,
  InMemoryCleaningRepository,
  approveCleaningBooking,
  findCleaningQuotes,
  proposeCleaningBooking,
  type CleaningContext,
} from "@/server/tools/cleaning";

// Monday 2026-11-02 09:00 in San Francisco (PST, UTC-8).
const NOW = new Date("2026-11-02T17:00:00Z");

function baseRequest(overrides: Partial<CleaningRequestInput> = {}): CleaningRequestInput {
  return {
    requesterRole: "renter",
    serviceArea: { kind: "zip", zip: "94110" },
    bedrooms: 2,
    bathrooms: 1,
    leaseRequirements: {},
    itemsRemaining: { count: 0, hasBulky: false },
    // Monday 07:00 to Friday 18:00 local, a week out, so no rush surcharge applies.
    window: { earliestStart: "2026-11-09T15:00:00Z", latestFinish: "2026-11-14T02:00:00Z" },
    ...overrides,
  };
}

function makeContext(
  ownerId = "owner-a",
  shared: { repository?: InMemoryCleaningRepository; provider?: SimulatedCleaningMarketplace; clock?: { now: Date } } = {},
): CleaningContext & { clock: { now: Date } } {
  const clock = shared.clock ?? { now: NOW };
  return {
    ownerId,
    now: () => clock.now,
    repository: shared.repository ?? new InMemoryCleaningRepository(),
    provider: shared.provider ?? new SimulatedCleaningMarketplace(new FixtureCleaningCatalog()),
    clock,
  };
}

function cheapestWithSlot(result: FindCleaningQuotesResult): CleaningQuote {
  const quote = result.matches.find((q) => q.slots.length > 0);
  if (!quote) throw new Error("fixture expected at least one quote with a slot");
  return quote;
}

function lineTotal(quote: CleaningQuote): number {
  return Math.round(quote.priceUsd.lineItems.reduce((sum, line) => sum + line.amountUsd * 100, 0)) / 100;
}

describe("CleaningRequestSchema", () => {
  it("accepts a ZIP or a city and rejects anything that looks like a street address", () => {
    expect(CleaningRequestSchema.safeParse(baseRequest()).success).toBe(true);
    expect(CleaningRequestSchema.safeParse(baseRequest({ serviceArea: { kind: "city", city: "San Francisco" } })).success).toBe(true);
    expect(CleaningRequestSchema.safeParse(baseRequest({ serviceArea: { kind: "city", city: "123 Main St" } })).success).toBe(false);
    expect(CleaningRequestSchema.safeParse(baseRequest({ serviceArea: { kind: "zip", zip: "9411" } })).success).toBe(false);
  });

  it("rejects a non-renter requester and an ownerId smuggled into the request", () => {
    expect(CleaningRequestSchema.safeParse({ ...baseRequest(), requesterRole: "landlord" }).success).toBe(false);
    expect(CleaningRequestSchema.safeParse({ ...baseRequest(), ownerId: "owner-b" }).success).toBe(false);
  });

  it("derives remaining items from proposed inventories", () => {
    const inventory = {
      items: [
        { quantity: 2, size_class: "small" },
        { quantity: 1, size_class: "bulky" },
      ],
    } as unknown as ProposedInventory;
    expect(itemsRemainingFromInventories([inventory])).toEqual({ count: 3, hasBulky: true });
    expect(itemsRemainingFromInventories([])).toEqual({ count: 0, hasBulky: false });
  });
});

describe("findCleaningQuotes pricing", () => {
  it("is deterministic for the same request and clock", async () => {
    const first = await findCleaningQuotes(baseRequest(), makeContext());
    const second = await findCleaningQuotes(baseRequest(), makeContext());
    expect(first).toEqual(second);
    expect(first.matches.length).toBeGreaterThan(0);
    for (const quote of first.matches) expect(quote.priceUsd.totalUsd).toBeCloseTo(lineTotal(quote), 2);
  });

  const addOns: Array<[string, Partial<CleaningRequestInput>]> = [
    ["deep_clean", { leaseRequirements: { deepClean: true } }],
    ["carpet_cleaning", { leaseRequirements: { carpetCleaning: true } }],
    ["inside_appliances", { leaseRequirements: { insideAppliances: true } }],
    ["windows", { leaseRequirements: { windows: true } }],
    ["walls", { leaseRequirements: { walls: true } }],
    ["bulky_items_left", { itemsRemaining: { count: 1, hasBulky: true } }],
    ["pets", { access: { pets: true } }],
    ["no_elevator", { access: { noElevator: true } }],
  ];

  it.each(addOns)("adding %s changes each provider's total by exactly its line item", async (code, extra) => {
    const without = await findCleaningQuotes(baseRequest(), makeContext());
    const withIt = await findCleaningQuotes(baseRequest(extra), makeContext());
    let compared = 0;
    for (const quote of withIt.matches) {
      const base = without.matches.find((q) => q.providerId === quote.providerId);
      if (!base) continue;
      const line = quote.priceUsd.lineItems.find((l) => l.code === code);
      expect(line, `${quote.providerId} should list ${code}`).toBeDefined();
      expect(base.priceUsd.lineItems.some((l) => l.code === code)).toBe(false);
      const otherLines = quote.priceUsd.lineItems.filter((l) => l.code !== code);
      expect(otherLines).toEqual(base.priceUsd.lineItems);
      expect(quote.priceUsd.totalUsd - base.priceUsd.totalUsd).toBeCloseTo(line!.amountUsd, 2);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(0);
  });

  it("adds a rush surcharge when the window closes inside each company's rush window", async () => {
    const rushed = await findCleaningQuotes(
      baseRequest({ window: { earliestStart: "2026-11-03T15:00:00Z", latestFinish: "2026-11-04T02:00:00Z" } }),
      makeContext(),
    );
    const all = [...rushed.matches, ...rushed.excluded.flatMap((e) => (e.quote ? [e.quote] : []))];
    expect(all.length).toBeGreaterThan(0);
    for (const quote of all) expect(quote.priceUsd.lineItems.some((l) => l.code === "rush")).toBe(true);
  });
});

describe("findCleaningQuotes window checks", () => {
  it("rejects a window whose earliest start is not before its latest finish", async () => {
    const request = baseRequest({ window: { earliestStart: "2026-11-10T15:00:00Z", latestFinish: "2026-11-10T15:00:00Z" } });
    await expect(findCleaningQuotes(request, makeContext())).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("rejects a window that starts in the past", async () => {
    const request = baseRequest({ window: { earliestStart: "2026-11-01T15:00:00Z", latestFinish: "2026-11-14T02:00:00Z" } });
    await expect(findCleaningQuotes(request, makeContext())).rejects.toThrow(/past/);
  });

  it("rejects cleaning that would start before item removal finishes (SERV-06)", async () => {
    const request = baseRequest({
      itemsRemaining: { count: 4, hasBulky: true, removalCompleteBy: "2026-11-10T20:00:00Z" },
    });
    await expect(findCleaningQuotes(request, makeContext())).rejects.toThrow(/item removal/);
  });

  it("warns that cleaning must follow removal when items remain", async () => {
    const result = await findCleaningQuotes(
      baseRequest({ itemsRemaining: { count: 4, hasBulky: false, removalCompleteBy: "2026-11-09T15:00:00Z" } }),
      makeContext(),
    );
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.warnings.join(" ")).toMatch(/after .*item.* removed|must follow item removal/i);
  });

  it("rejects malformed input with a typed error", async () => {
    await expect(findCleaningQuotes({ bedrooms: -1 } as unknown as CleaningRequestInput, makeContext())).rejects.toBeInstanceOf(
      CleaningToolError,
    );
  });
});

describe("findCleaningQuotes budget and availability", () => {
  it("filters by budget, sorts by price and reports over-budget quotes with a reason", async () => {
    const open = await findCleaningQuotes(baseRequest(), makeContext());
    const prices = open.matches.map((q) => q.priceUsd.totalUsd);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(prices.length).toBeGreaterThanOrEqual(2);
    const budget = (prices[0] + prices[prices.length - 1]) / 2;

    const capped = await findCleaningQuotes(baseRequest({ maxBudgetUsd: budget }), makeContext());
    expect(capped.matches.length).toBeGreaterThan(0);
    for (const quote of capped.matches) expect(quote.priceUsd.totalUsd).toBeLessThanOrEqual(budget);
    const over = capped.excluded.filter((e) => e.reasons.some((r) => r.code === "over_budget"));
    expect(over.length).toBeGreaterThan(0);
    for (const entry of over) {
      expect(entry.quote!.priceUsd.totalUsd).toBeGreaterThan(budget);
      expect(entry.reasons.find((r) => r.code === "over_budget")!.detail).toMatch(/budget/);
    }
  });

  it("returns an explicit empty result with reasons when nothing has a slot", async () => {
    // One hour on a Monday morning is shorter than any crew needs.
    const result = await findCleaningQuotes(
      baseRequest({ window: { earliestStart: "2026-11-09T17:00:00Z", latestFinish: "2026-11-09T18:00:00Z" } }),
      makeContext(),
    );
    expect(result.matches).toEqual([]);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.excluded.length).toBeGreaterThan(0);
    expect(result.excluded.every((e) => e.reasons.length > 0)).toBe(true);
    expect(result.excluded.some((e) => e.reasons.some((r) => r.code === "no_availability"))).toBe(true);
  });

  it("reports an empty result when every quote is over budget", async () => {
    const result = await findCleaningQuotes(baseRequest({ maxBudgetUsd: 1 }), makeContext());
    expect(result.matches).toEqual([]);
    expect(result.reasons.join(" ")).toMatch(/budget/);
  });
});

describe("booking flow", () => {
  async function proposeFirst(ctx: CleaningContext) {
    const found = await findCleaningQuotes(baseRequest(), ctx);
    const quote = cheapestWithSlot(found);
    const proposal = await proposeCleaningBooking({ quote, slotId: quote.slots[0].slotId }, ctx);
    return { quote, proposal };
  }

  it("proposes a pending_review booking bound to a payload hash, idempotently", async () => {
    const ctx = makeContext();
    const { quote, proposal } = await proposeFirst(ctx);
    expect(proposal.status).toBe("pending_review");
    expect(proposal.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(proposal.idempotencyKey.length).toBeGreaterThan(8);
    const again = await proposeCleaningBooking({ quote, slotId: quote.slots[0].slotId }, ctx);
    expect(again).toEqual(proposal);
  });

  it("refuses a quote whose price was edited after it was issued", async () => {
    const ctx = makeContext();
    const found = await findCleaningQuotes(baseRequest(), ctx);
    const quote = cheapestWithSlot(found);
    const tampered = { ...quote, priceUsd: { ...quote.priceUsd, totalUsd: 1 } };
    await expect(proposeCleaningBooking({ quote: tampered, slotId: quote.slots[0].slotId }, ctx)).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("refuses a slot that is not part of the quote", async () => {
    const ctx = makeContext();
    const quote = cheapestWithSlot(await findCleaningQuotes(baseRequest(), ctx));
    await expect(proposeCleaningBooking({ quote, slotId: "sim-other:2026-11-10T16:00:00.000Z" }, ctx)).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("confirms an approved proposal as simulated, with SIM- code and disclaimer", async () => {
    const ctx = makeContext();
    const { proposal } = await proposeFirst(ctx);
    const result = await approveCleaningBooking(
      { proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey },
      ctx,
    );
    expect(result.simulated).toBe(true);
    expect(result.status).toBe("simulated_confirmed");
    if (result.status !== "simulated_confirmed") throw new Error("unreachable");
    expect(result.confirmationCode).toMatch(/^SIM-[A-Z0-9]+$/);
    expect(result.cancellation.summary.length).toBeGreaterThan(0);
    expect(result.disclaimer).toMatch(/no real booking/i);
  });

  it("rejects a payload hash that does not match the stored proposal and claims nothing", async () => {
    const ctx = makeContext();
    const { proposal } = await proposeFirst(ctx);
    const bad = await approveCleaningBooking(
      { proposalId: proposal.id, payloadHash: "0".repeat(64), idempotencyKey: proposal.idempotencyKey },
      ctx,
    );
    expect(bad).toMatchObject({ status: "rejected", reason: "payload_mismatch", simulated: true });
    const good = await approveCleaningBooking(
      { proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey },
      ctx,
    );
    expect(good.status).toBe("simulated_confirmed");
  });

  it("returns not_found for another owner's proposal and quote", async () => {
    const repository = new InMemoryCleaningRepository();
    const provider = new SimulatedCleaningMarketplace(new FixtureCleaningCatalog());
    const ownerA = makeContext("owner-a", { repository, provider });
    const ownerB = makeContext("owner-b", { repository, provider });
    const { quote, proposal } = await proposeFirst(ownerA);
    const approve = approveCleaningBooking(
      { proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey },
      ownerB,
    );
    await expect(approve).rejects.toMatchObject({ code: "not_found" });
    await expect(approve).rejects.not.toThrow(/owner-a/);
    await expect(proposeCleaningBooking({ quote, slotId: quote.slots[0].slotId }, ownerB)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("books once when approve is called twice, with the same or a different key", async () => {
    const ctx = makeContext();
    const book = vi.spyOn(ctx.provider, "book");
    const { proposal } = await proposeFirst(ctx);
    const input = { proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey };
    const [first, second] = await Promise.all([approveCleaningBooking(input, ctx), approveCleaningBooking(input, ctx)]);
    const third = await approveCleaningBooking({ ...input, idempotencyKey: "a-different-client-key" }, ctx);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(first.status).toBe("simulated_confirmed");
    expect(new Set(book.mock.calls.map(([call]) => call.idempotencyKey)).size).toBe(1);
    expect((ctx.provider as SimulatedCleaningMarketplace).bookingCount()).toBe(1);
  });

  it("refuses an idempotency key already used for a different proposal", async () => {
    const ctx = makeContext();
    const found = await findCleaningQuotes(baseRequest(), ctx);
    const quote = cheapestWithSlot(found);
    const p1 = await proposeCleaningBooking({ quote, slotId: quote.slots[0].slotId }, ctx);
    const other = found.matches.find((q) => q.slots.length > 0 && q.providerId !== quote.providerId)!;
    const p2 = await proposeCleaningBooking({ quote: other, slotId: other.slots[0].slotId }, ctx);
    await approveCleaningBooking({ proposalId: p1.id, payloadHash: p1.payloadHash, idempotencyKey: "shared-key-123" }, ctx);
    await expect(
      approveCleaningBooking({ proposalId: p2.id, payloadHash: p2.payloadHash, idempotencyKey: "shared-key-123" }, ctx),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("lets only one of two concurrent approvals that share a key across proposals win", async () => {
    const ctx = makeContext();
    const found = await findCleaningQuotes(baseRequest(), ctx);
    const [q1, q2] = found.matches.filter((q) => q.slots.length > 0);
    const p1 = await proposeCleaningBooking({ quote: q1, slotId: q1.slots[0].slotId }, ctx);
    const p2 = await proposeCleaningBooking({ quote: q2, slotId: q2.slots[0].slotId }, ctx);
    const key = "shared-concurrent-key";
    const settled = await Promise.allSettled([
      approveCleaningBooking({ proposalId: p1.id, payloadHash: p1.payloadHash, idempotencyKey: key }, ctx),
      approveCleaningBooking({ proposalId: p2.id, payloadHash: p2.payloadHash, idempotencyKey: key }, ctx),
    ]);
    const won = settled.filter((s) => s.status === "fulfilled" && s.value.status === "simulated_confirmed");
    const lost = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(CleaningToolError);
    expect(lost[0].reason).toMatchObject({ code: "conflict" });
    expect((ctx.provider as SimulatedCleaningMarketplace).bookingCount()).toBe(1);
  });

  it("lets only one of two proposals for the same slot confirm", async () => {
    const repository = new InMemoryCleaningRepository();
    const provider = new SimulatedCleaningMarketplace(new FixtureCleaningCatalog());
    const ownerA = makeContext("owner-a", { repository, provider });
    const ownerB = makeContext("owner-b", { repository, provider });
    const a = await proposeFirst(ownerA);
    const b = await proposeFirst(ownerB);
    expect(b.proposal.slot.slotId).toBe(a.proposal.slot.slotId);

    const [ra, rb] = await Promise.all([
      approveCleaningBooking(
        { proposalId: a.proposal.id, payloadHash: a.proposal.payloadHash, idempotencyKey: a.proposal.idempotencyKey },
        ownerA,
      ),
      approveCleaningBooking(
        { proposalId: b.proposal.id, payloadHash: b.proposal.payloadHash, idempotencyKey: b.proposal.idempotencyKey },
        ownerB,
      ),
    ]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual(["rejected", "simulated_confirmed"]);
    const loser = ra.status === "rejected" ? ra : rb;
    expect(loser).toMatchObject({ reason: "slot_unavailable" });
    expect(provider.bookingCount()).toBe(1);

    const loserCtx = ra.status === "rejected" ? ownerA : ownerB;
    const loserQuote = ra.status === "rejected" ? a.quote : b.quote;
    await expect(proposeCleaningBooking({ quote: loserQuote, slotId: a.proposal.slot.slotId }, loserCtx)).rejects.toMatchObject({
      code: "slot_unavailable",
    });
    const fresh = await findCleaningQuotes(baseRequest(), makeContext("owner-c", { repository, provider }));
    const sameProvider = fresh.matches.find((q) => q.providerId === a.quote.providerId);
    expect(sameProvider?.slots.some((slot) => slot.slotId === a.proposal.slot.slotId) ?? false).toBe(false);
  });

  it("rejects an expired quote at propose and at approve", async () => {
    const clock = { now: NOW };
    const ctx = makeContext("owner-a", { clock });
    const { quote, proposal } = await proposeFirst(ctx);
    clock.now = new Date(new Date(quote.quoteValidUntil).getTime() + 1000);
    await expect(proposeCleaningBooking({ quote, slotId: quote.slots[1]?.slotId ?? quote.slots[0].slotId }, ctx)).rejects.toMatchObject({
      code: "quote_expired",
    });
    const result = await approveCleaningBooking(
      { proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey },
      ctx,
    );
    expect(result).toMatchObject({ status: "rejected", reason: "quote_expired" });
  });

  it("labels every state as simulated", async () => {
    const ctx = makeContext();
    const found = await findCleaningQuotes(baseRequest({ maxBudgetUsd: 300 }), ctx);
    expect(found.simulated).toBe(true);
    expect(found.disclaimer).toMatch(/simulated/i);
    const quotes = [...found.matches, ...found.excluded.flatMap((e) => (e.quote ? [e.quote] : []))];
    for (const quote of quotes) {
      expect(quote.simulated).toBe(true);
      expect(quote.source.kind).toBe("simulated");
      expect(quote.source.label).toMatch(/simulated/i);
      expect(quote.priceUsd.kind).toBe("estimate");
    }
    const { proposal } = await proposeFirst(ctx);
    expect(proposal.simulated).toBe(true);
    const rejected = await approveCleaningBooking(
      { proposalId: proposal.id, payloadHash: "f".repeat(64), idempotencyKey: proposal.idempotencyKey },
      ctx,
    );
    expect(rejected.simulated).toBe(true);
    expect(rejected.disclaimer).toMatch(/no real booking/i);
  });
});
