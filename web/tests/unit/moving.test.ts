import { describe, expect, it, vi } from "vitest";
import {
  MovingQuoteSchema,
  MovingRequestSchema,
  furnitureFromInventory,
  type FindMovingQuotesResult,
  type MovingExclusionCode,
  type MovingQuote,
  type MovingRequestInput,
} from "@/contracts/moving";
import type { ProposedItem } from "@/contracts/inventory";
import { MOVING_CATALOG_FIXTURE } from "@/server/integrations/moving-catalog-fixture";
import { FixtureMovingCatalog, MovingProviderRowSchema } from "@/server/integrations/moving-catalog";
import { SimulatedMovingMarketplace, estimateMove } from "@/server/integrations/moving-simulator";
import { SimulatedServiceError } from "@/server/tools/simulated-booking";
import {
  InMemoryMovingRepository,
  approveMovingBooking,
  findMovingQuotes,
  proposeMovingBooking,
  type MovingContext,
} from "@/server/tools/moving";

// Monday 2026-11-02 09:00 in San Francisco (PST).
const NOW = new Date("2026-11-02T17:00:00Z");

function request(overrides: Partial<MovingRequestInput> = {}): MovingRequestInput {
  return {
    requesterRole: "renter",
    origin: { zip: "94110", floor: 3, hasElevator: false, longCarryFeet: 0, parkingPermitNeeded: false },
    destination: { zip: "94117", floor: 2, hasElevator: true, longCarryFeet: 0 },
    distanceMiles: 4,
    // Monday 07:00 to Friday 18:00 local, a week out.
    moveWindow: { earliestStart: "2026-11-09T15:00:00Z", latestFinish: "2026-11-14T02:00:00Z" },
    boxes: { small: 10, medium: 15, large: 5, wardrobe: 2 },
    furniture: { small: 4, medium: 3, large: 2, extraLarge: 1 },
    ...overrides,
  };
}

function makeContext(
  ownerId = "owner-a",
  shared: { repository?: InMemoryMovingRepository; provider?: SimulatedMovingMarketplace; clock?: { now: Date } } = {},
): MovingContext {
  const clock = shared.clock ?? { now: NOW };
  return {
    ownerId,
    now: () => clock.now,
    repository: shared.repository ?? new InMemoryMovingRepository(),
    provider: shared.provider ?? new SimulatedMovingMarketplace(new FixtureMovingCatalog()),
  };
}

const row = (slug: string) => MovingProviderRowSchema.parse(MOVING_CATALOG_FIXTURE.find((r) => r.slug === slug));
const codesFor = (result: FindMovingQuotesResult, slug: string): MovingExclusionCode[] =>
  result.excluded.find((e) => e.provider.id === slug)?.reasons.map((r) => r.code) ?? [];
const matched = (result: FindMovingQuotesResult) => result.matches.map((q) => q.providerId);
const line = (quote: MovingQuote, code: string) => quote.priceUsd.lineItems.find((l) => l.code === code);

describe("MovingRequestSchema", () => {
  it("rejects a non-renter, an owner id in the body and furniture given twice", () => {
    expect(MovingRequestSchema.safeParse(request()).success).toBe(true);
    expect(MovingRequestSchema.safeParse({ ...request(), requesterRole: "landlord" }).success).toBe(false);
    expect(MovingRequestSchema.safeParse({ ...request(), ownerId: "owner-b" }).success).toBe(false);
    const item = { name: "sofa", category: "furniture", quantity: 1, size_class: "bulky", condition: "good", brand: null, estimated_resale_usd: null, confidence: 0.9, notes: null, status: "proposed" };
    expect(MovingRequestSchema.safeParse({ ...request(), fromInventory: [item] }).success).toBe(false);
    expect(MovingRequestSchema.safeParse({ ...request(), furniture: undefined, fromInventory: [item] }).success).toBe(true);
  });

  it("requires a declared value for full-value insurance and unique specialty kinds", () => {
    expect(MovingRequestSchema.safeParse(request({ insurance: "full_value" })).success).toBe(false);
    expect(MovingRequestSchema.safeParse(request({ insurance: "full_value", declaredValueUsd: 8000 })).success).toBe(true);
    const twice = [{ kind: "piano", count: 1 }, { kind: "piano", count: 1 }] as const;
    expect(MovingRequestSchema.safeParse(request({ specialtyItems: [...twice] })).success).toBe(false);
  });
});

describe("furnitureFromInventory", () => {
  it("maps vision size classes by quantity, bulky to extraLarge", () => {
    const items = [
      { size_class: "small", quantity: 3 },
      { size_class: "medium", quantity: 1 },
      { size_class: "large", quantity: 2 },
      { size_class: "bulky", quantity: 1 },
      { size_class: "bulky", quantity: 2 },
    ] as unknown as ProposedItem[];
    expect(furnitureFromInventory(items)).toEqual({ small: 3, medium: 1, large: 2, extraLarge: 3 });
    expect(furnitureFromInventory([])).toEqual({ small: 0, medium: 0, large: 0, extraLarge: 0 });
  });

  it("prices a move from inventory the same as the equivalent furniture counts", async () => {
    const items = [
      { name: "chair", category: "furniture", quantity: 4, size_class: "small", condition: "good", brand: null, estimated_resale_usd: null, confidence: 0.9, notes: null, status: "proposed" },
      { name: "desk", category: "furniture", quantity: 3, size_class: "medium", condition: "good", brand: null, estimated_resale_usd: null, confidence: 0.9, notes: null, status: "proposed" },
      { name: "bed", category: "furniture", quantity: 2, size_class: "large", condition: "good", brand: null, estimated_resale_usd: null, confidence: 0.9, notes: null, status: "proposed" },
      { name: "sofa", category: "furniture", quantity: 1, size_class: "bulky", condition: "good", brand: null, estimated_resale_usd: null, confidence: 0.9, notes: null, status: "proposed" },
    ] as ProposedItem[];
    const fromCounts = await findMovingQuotes(request(), makeContext());
    const fromItems = await findMovingQuotes({ ...request(), furniture: undefined, fromInventory: items }, makeContext());
    expect(fromItems.matches.map((q) => [q.providerId, q.priceUsd.totalUsd, q.estimate.volumeCuFt])).toEqual(
      fromCounts.matches.map((q) => [q.providerId, q.priceUsd.totalUsd, q.estimate.volumeCuFt]),
    );
  });
});

describe("estimateMove", () => {
  it("derives volume, crew, trucks and hours from documented constants", () => {
    const parsed = MovingRequestSchema.parse(request());
    const estimate = estimateMove(parsed, row("harborlight-moving"));
    // Boxes 10*1.5 + 15*3 + 5*4.5 + 2*10 = 102.5; furniture 4*10 + 3*25 + 2*50 + 1*80 = 295.
    expect(estimate.volumeCuFt).toBe(397.5);
    expect(estimate.crewSize).toBe(3);
    expect(estimate.trucks).toBe(1);
    // Load 397.5/(3*60) * 1.2 (two flights, no elevator) + unload 397.5/(3*60) * 0.8 * 1.05 (elevator)
    // + drive 4/20 + 0.25, rounded up to the half hour.
    expect(estimate.driveHours).toBeCloseTo(0.45, 5);
    expect(estimate.laborHours).toBe(5);
  });

  it("adds crew for heavy specialty items, hours for stairs and a second truck for big moves", () => {
    const base = estimateMove(MovingRequestSchema.parse(request()), row("harborlight-moving"));
    const small = MovingRequestSchema.parse(request({ boxes: { small: 0, medium: 5, large: 0, wardrobe: 0 }, furniture: { small: 2, medium: 1, large: 0, extraLarge: 0 } }));
    expect(estimateMove(small, row("harborlight-moving")).crewSize).toBe(2);
    const piano = MovingRequestSchema.parse({ ...small, specialtyItems: [{ kind: "piano", count: 1 }] });
    expect(estimateMove(piano, row("harborlight-moving")).crewSize).toBe(3);
    const walkUp = MovingRequestSchema.parse(request({ origin: { zip: "94110", floor: 5, hasElevator: false, longCarryFeet: 100, parkingPermitNeeded: false } }));
    expect(estimateMove(walkUp, row("harborlight-moving")).laborHours).toBeGreaterThan(base.laborHours);
    const big = MovingRequestSchema.parse(request({ furniture: { small: 10, medium: 10, large: 6, extraLarge: 4 } }));
    const bigEstimate = estimateMove(big, row("harborlight-moving"));
    expect(bigEstimate.volumeCuFt).toBeGreaterThan(row("harborlight-moving").truck_capacity_cuft);
    expect(bigEstimate.trucks).toBe(2);
  });
});

describe("findMovingQuotes filtering", () => {
  it("is deterministic and every total is the sum of its labeled estimate lines", async () => {
    const first = await findMovingQuotes(request(), makeContext());
    expect(await findMovingQuotes(request(), makeContext())).toEqual(first);
    expect(first.catalogSource).toBe("fixture");
    expect(first.matches.length).toBeGreaterThanOrEqual(3);
    for (const quote of first.matches) {
      const sum = quote.priceUsd.lineItems.reduce((total, l) => total + Math.round(l.amountUsd * 100), 0) / 100;
      expect(quote.priceUsd.totalUsd).toBeCloseTo(sum, 2);
      expect(quote.priceUsd.kind).toBe("estimate");
      expect(line(quote, "labor")!.amountUsd).toBeGreaterThan(0);
      expect(line(quote, "truck")).toBeDefined();
    }
    const listed = [...matched(first), ...first.excluded.map((e) => e.provider.id)];
    expect(listed).not.toContain("tumbleweed-carry");
    expect(listed).toHaveLength(MOVING_CATALOG_FIXTURE.filter((r) => r.active).length);
  });

  const rules: Array<[MovingExclusionCode, Partial<MovingRequestInput>, string[]]> = [
    ["outside_service_area", {}, ["bramblegate-moving"]],
    ["distance_exceeds_limit", { distanceMiles: 80 }, ["fogbell-movers", "cobblestone-carry", "bluegill-moving"]],
    ["specialty_not_handled", { specialtyItems: [{ kind: "pool_table", count: 1 }] }, ["fogbell-movers", "harborlight-moving"]],
    ["packing_not_offered", { services: { packing: "full" } }, ["fogbell-movers"]],
    ["unpacking_not_offered", { services: { unpacking: true } }, ["fogbell-movers", "kelpline-movers"]],
    ["disassembly_not_offered", { services: { disassemblyReassembly: true } }, ["wickerbasket-relocation"]],
    ["storage_not_offered", { services: { storageMonths: 2 } }, ["fogbell-movers", "bluegill-moving"]],
    ["insurance_not_offered", { insurance: "full_value", declaredValueUsd: 9000 }, ["fogbell-movers", "wickerbasket-relocation"]],
    ["capacity_exceeded", {}, ["cobblestone-carry"]],
    ["insufficient_notice", {}, ["copperfox-movers"]],
    ["no_availability", {}, ["thimbleberry-moving"]],
  ];

  it.each(rules)("excludes with %s", async (code, extra, slugs) => {
    const result = await findMovingQuotes(request(extra), makeContext());
    for (const slug of slugs) {
      expect(codesFor(result, slug), slug).toContain(code);
      expect(matched(result)).not.toContain(slug);
    }
  });

  it("excludes a company whose largest crew is smaller than the volume rule needs (crew_too_small)", async () => {
    // 14 large pieces = 700 cu ft, which needs 4 movers; 12 medium = 300 cu ft, which needs 3.
    const noBoxes = { small: 0, medium: 0, large: 0, wardrobe: 0 };
    const big = await findMovingQuotes(request({ boxes: noBoxes, furniture: { small: 0, medium: 0, large: 14, extraLarge: 0 } }), makeContext());
    for (const slug of ["bluegill-moving", "fogbell-movers"]) {
      expect(codesFor(big, slug), slug).toContain("crew_too_small");
      expect(big.excluded.find((e) => e.provider.id === slug)!.quote).toBeUndefined();
    }
    expect(matched(big)).toContain("harborlight-moving");
    for (const quote of big.matches) expect(quote.estimate.crewSize).toBeGreaterThanOrEqual(4);
    const medium = await findMovingQuotes(request({ boxes: noBoxes, furniture: { small: 0, medium: 12, large: 0, extraLarge: 0 } }), makeContext());
    expect(codesFor(medium, "cobblestone-carry")).toContain("crew_too_small");
  });

  it("excludes a move too long for one working day because of distance (long_distance_not_supported)", async () => {
    const result = await findMovingQuotes(
      request({ distanceMiles: 1000, moveWindow: { earliestStart: "2026-11-09T15:00:00Z", latestFinish: "2026-12-01T02:00:00Z" } }),
      makeContext(),
    );
    const codes = codesFor(result, "lanternfish-moving");
    expect(codes).toContain("long_distance_not_supported");
    expect(codes).not.toContain("no_availability");
    expect(result.excluded.find((e) => e.provider.id === "lanternfish-moving")!.reasons[0].detail).toMatch(/working day/);
  });

  it("never returns a quote that fails MovingQuoteSchema; it becomes a quote_invalid exclusion", async () => {
    const rows = MOVING_CATALOG_FIXTURE.map((r) => (r.slug === "harborlight-moving" ? { ...r, hourly_rate_per_mover_usd: 9000 } : r));
    const ctx = { ...makeContext(), provider: new SimulatedMovingMarketplace(new FixtureMovingCatalog(rows)) };
    const result = await findMovingQuotes(request(), ctx);
    const entry = result.excluded.find((e) => e.provider.id === "harborlight-moving")!;
    expect(entry.reasons.map((r) => r.code)).toEqual(["quote_invalid"]);
    expect(entry.quote).toBeUndefined();
    expect(matched(result)).not.toContain("harborlight-moving");
    for (const quote of [...result.matches, ...result.excluded.flatMap((e) => (e.quote ? [e.quote] : []))]) {
      expect(MovingQuoteSchema.safeParse(quote).success, quote.providerId).toBe(true);
    }
  });

  it("names the specialty item a company cannot move", async () => {
    const result = await findMovingQuotes(request({ specialtyItems: [{ kind: "pool_table", count: 1 }] }), makeContext());
    const reason = result.excluded.find((e) => e.provider.id === "fogbell-movers")!.reasons.find((r) => r.code === "specialty_not_handled")!;
    expect(reason.detail).toMatch(/pool table/);
  });

  it("filters by budget with the quote attached and sorts matches by price", async () => {
    const open = await findMovingQuotes(request(), makeContext());
    const prices = open.matches.map((q) => q.priceUsd.totalUsd);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const budget = (prices[0] + prices[prices.length - 1]) / 2;
    const capped = await findMovingQuotes(request({ maxBudgetUsd: budget }), makeContext());
    for (const quote of capped.matches) expect(quote.priceUsd.totalUsd).toBeLessThanOrEqual(budget);
    const over = capped.excluded.filter((e) => e.reasons.some((r) => r.code === "over_budget"));
    expect(over.length).toBeGreaterThan(0);
    for (const entry of over) expect(entry.quote!.priceUsd.totalUsd).toBeGreaterThan(budget);
  });

  it("adds a second truck when the volume overflows one, and excludes a company that cannot", async () => {
    // 102.5 cu ft of boxes + 850 of furniture = 952.5: two 900 cu ft trucks, and 4 movers (harborlight's largest crew).
    const result = await findMovingQuotes(request({ furniture: { small: 10, medium: 10, large: 10, extraLarge: 0 } }), makeContext());
    const harbor = [...result.matches, ...result.excluded.flatMap((e) => (e.quote ? [e.quote] : []))].find((q) => q.providerId === "harborlight-moving")!;
    expect(harbor.estimate.trucks).toBe(2);
    expect(line(harbor, "truck")!.amountUsd).toBe(2 * row("harborlight-moving").truck_fee_usd);
    expect(codesFor(result, "fogbell-movers")).toContain("capacity_exceeded");
  });

  it("prices each requested service as its own line", async () => {
    const result = await findMovingQuotes(
      request({
        origin: { zip: "94110", floor: 3, hasElevator: false, longCarryFeet: 120, parkingPermitNeeded: true },
        specialtyItems: [{ kind: "piano", count: 1 }],
        services: { packing: "full", packingMaterials: true, unpacking: true, disassemblyReassembly: true, storageMonths: 1 },
        insurance: "full_value",
        declaredValueUsd: 10_000,
      }),
      makeContext(),
    );
    const quote = [...result.matches, ...result.excluded.flatMap((e) => (e.quote ? [e.quote] : []))].find((q) => q.providerId === "lanternfish-moving")!;
    for (const code of ["labor", "truck", "travel", "packing", "materials", "stairs", "long_carry", "parking_permit", "specialty_piano", "disassembly", "unpacking", "storage", "insurance"]) {
      expect(line(quote, code), code).toBeDefined();
    }
    const r = row("lanternfish-moving");
    expect(line(quote, "insurance")!.amountUsd).toBe(Math.max(r.full_value_min_usd, (10_000 * r.full_value_pct) / 100));
    expect(line(quote, "long_carry")!.amountUsd).toBe(3 * r.long_carry_fee_per_50ft_usd);
  });

  it("validates the window and warns when cleaning could start before the move ends (SERV-06)", async () => {
    await expect(findMovingQuotes(request({ moveWindow: { earliestStart: "2026-11-01T15:00:00Z", latestFinish: "2026-11-14T02:00:00Z" } }), makeContext())).rejects.toMatchObject({ code: "invalid_request" });
    await expect(findMovingQuotes(request({ moveWindow: { earliestStart: "2026-11-10T15:00:00Z", latestFinish: "2026-11-10T15:00:00Z" } }), makeContext())).rejects.toBeInstanceOf(SimulatedServiceError);
    const overlap = await findMovingQuotes(request({ cleaningEarliestStart: "2026-11-12T16:00:00Z" }), makeContext());
    expect(overlap.warnings.join(" ")).toMatch(/cleaning should follow/i);
    const after = await findMovingQuotes(request({ cleaningEarliestStart: "2026-11-14T16:00:00Z" }), makeContext());
    expect(after.warnings.join(" ")).not.toMatch(/cleaning should follow/i);
  });
});

describe("moving booking flow", () => {
  async function proposeCheapest(ctx: MovingContext) {
    const found = await findMovingQuotes(request(), ctx);
    const quote = found.matches.find((q) => q.slots.length > 0)!;
    const proposal = await proposeMovingBooking({ quote, slotId: quote.slots[0].slotId }, ctx);
    return { found, quote, proposal };
  }

  it("confirms once, idempotently, with SIM- code and simulated labels", async () => {
    const ctx = makeContext();
    const book = vi.spyOn(ctx.provider, "book");
    const { proposal } = await proposeCheapest(ctx);
    expect(proposal).toMatchObject({ simulated: true, status: "pending_review" });
    const input = { proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey };
    const [a, b] = await Promise.all([approveMovingBooking(input, ctx), approveMovingBooking(input, ctx)]);
    const c = await approveMovingBooking({ ...input, idempotencyKey: "another-client-key" }, ctx);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a.status).toBe("simulated_confirmed");
    if (a.status !== "simulated_confirmed") throw new Error("unreachable");
    expect(a.confirmationCode).toMatch(/^SIM-/);
    expect(a.disclaimer).toMatch(/no real booking/i);
    expect(new Set(book.mock.calls.map(([call]) => call.idempotencyKey)).size).toBe(1);
    expect((ctx.provider as SimulatedMovingMarketplace).bookingCount()).toBe(1);
  });

  it("re-approving a confirmed proposal with a wrong hash is a payload_mismatch", async () => {
    const ctx = makeContext();
    const { proposal } = await proposeCheapest(ctx);
    const input = { proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey };
    expect((await approveMovingBooking(input, ctx)).status).toBe("simulated_confirmed");
    expect(await approveMovingBooking({ ...input, payloadHash: "d".repeat(64) }, ctx)).toMatchObject({ status: "rejected", reason: "payload_mismatch" });
  });

  it("refuses a tampered quote and a wrong payload hash", async () => {
    const ctx = makeContext();
    const { quote, proposal } = await proposeCheapest(ctx);
    const cheaper = { ...quote, priceUsd: { ...quote.priceUsd, totalUsd: 1 } };
    await expect(proposeMovingBooking({ quote: cheaper, slotId: quote.slots[0].slotId }, ctx)).rejects.toMatchObject({ code: "invalid_request" });
    const bad = await approveMovingBooking({ proposalId: proposal.id, payloadHash: "0".repeat(64), idempotencyKey: proposal.idempotencyKey }, ctx);
    expect(bad).toMatchObject({ status: "rejected", reason: "payload_mismatch", simulated: true });
  });

  it("returns not_found for another owner's quote and proposal", async () => {
    const repository = new InMemoryMovingRepository();
    const provider = new SimulatedMovingMarketplace(new FixtureMovingCatalog());
    const a = makeContext("owner-a", { repository, provider });
    const b = makeContext("owner-b", { repository, provider });
    const { quote, proposal } = await proposeCheapest(a);
    await expect(proposeMovingBooking({ quote, slotId: quote.slots[0].slotId }, b)).rejects.toMatchObject({ code: "not_found" });
    await expect(
      approveMovingBooking({ proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey }, b),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("lets only one of two owners claim the same slot", async () => {
    const repository = new InMemoryMovingRepository();
    const provider = new SimulatedMovingMarketplace(new FixtureMovingCatalog());
    const a = makeContext("owner-a", { repository, provider });
    const b = makeContext("owner-b", { repository, provider });
    const pa = await proposeCheapest(a);
    const pb = await proposeCheapest(b);
    expect(pb.proposal.slot.slotId).toBe(pa.proposal.slot.slotId);
    const results = await Promise.all([
      approveMovingBooking({ proposalId: pa.proposal.id, payloadHash: pa.proposal.payloadHash, idempotencyKey: pa.proposal.idempotencyKey }, a),
      approveMovingBooking({ proposalId: pb.proposal.id, payloadHash: pb.proposal.payloadHash, idempotencyKey: pb.proposal.idempotencyKey }, b),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["rejected", "simulated_confirmed"]);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: "slot_unavailable" });
    expect(provider.bookingCount()).toBe(1);
  });

  it("rejects an expired quote", async () => {
    const clock = { now: NOW };
    const ctx = makeContext("owner-a", { clock });
    const { quote, proposal } = await proposeCheapest(ctx);
    clock.now = new Date(Date.parse(quote.quoteValidUntil) + 1000);
    const result = await approveMovingBooking({ proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey }, ctx);
    expect(result).toMatchObject({ status: "rejected", reason: "quote_expired" });
  });
});
