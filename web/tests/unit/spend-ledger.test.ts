import { describe, expect, it } from "vitest";
import {
  MissingPricingError,
  SpendCapConfigError,
  SpendLedger,
  callCostUpperBound,
  parsePricingTable,
  pricingFor,
  readSpendCapUsd,
} from "@/server/integrations/spend-ledger";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("SpendLedger", () => {
  it("moves a settled reservation from reserved to spent at its actual cost", () => {
    const ledger = new SpendLedger(1);
    expect(ledger.tryReserve("a", 0.6)).toBe(true);
    ledger.settle("a", 0.2, "response");
    const snap = ledger.snapshot();
    expect(snap.spentUsd).toBeCloseTo(0.2);
    expect(snap.reservedUsd).toBe(0);
    expect(snap.remainingUsd).toBeCloseTo(0.8);
    expect(snap.entries).toEqual([{ key: "a", reservedUsd: 0.6, actualUsd: 0.2, source: "response", overshootUsd: 0 }]);
  });

  it("refuses when spent + open reservations + the new one would exceed the cap", () => {
    const ledger = new SpendLedger(1);
    expect(ledger.tryReserve("a", 0.7)).toBe(true);
    expect(ledger.tryReserve("b", 0.31)).toBe(false);
    expect(ledger.tryReserve("c", 0.3)).toBe(true);
    ledger.settle("a", 0.7, "response");
    expect(ledger.tryReserve("d", 0.01)).toBe(false);
  });

  it("rejects a reused key, an unknown settle and a negative amount", () => {
    const ledger = new SpendLedger(1);
    ledger.tryReserve("a", 0.1);
    expect(() => ledger.tryReserve("a", 0.1)).toThrow(/already used/);
    expect(() => ledger.settle("zzz", 0, "response")).toThrow(/no open reservation/);
    expect(() => ledger.tryReserve("n", -1)).toThrow(RangeError);
    ledger.settle("a", 0.1, "response");
    expect(() => ledger.tryReserve("a", 0.1)).toThrow(/already used/);
  });

  it("reserves several calls all or nothing", () => {
    const ledger = new SpendLedger(1);
    expect(ledger.tryReserveMany({ cand: 0.7, judge: 0.4 })).toBe(false);
    expect(ledger.snapshot().reservedUsd).toBe(0);
    expect(ledger.tryReserveMany({ cand: 0.7, judge: 0.3 })).toBe(true);
    expect(ledger.snapshot().reservedUsd).toBeCloseTo(1);
  });

  it("never lets concurrent callers jointly commit past the cap", async () => {
    const ledger = new SpendLedger(1);
    let peak = 0;
    const outcomes = await Promise.all(
      Array.from({ length: 40 }, async (_, i) => {
        await tick();
        const granted = await ledger.reserveWhenAvailable(`k${i}`, 0.07);
        if (!granted) return false;
        const { spentUsd, reservedUsd } = ledger.snapshot();
        peak = Math.max(peak, spentUsd + reservedUsd);
        await tick();
        ledger.settle(`k${i}`, i % 2 === 0 ? 0.07 : 0.01, "response");
        return true;
      }),
    );
    expect(peak).toBeLessThanOrEqual(1 + 1e-9);
    expect(ledger.snapshot().spentUsd).toBeLessThanOrEqual(1 + 1e-9);
    expect(ledger.snapshot().reservedUsd).toBe(0);
    expect(outcomes.filter(Boolean).length).toBeGreaterThan(14);
  });

  it("waits for in-flight calls to settle, and gives up when nothing is in flight", async () => {
    const ledger = new SpendLedger(1);
    ledger.tryReserve("first", 0.8);
    const waiting = ledger.reserveWhenAvailable("second", 0.5);
    ledger.settle("first", 0.1, "response");
    await expect(waiting).resolves.toBe(true);
    ledger.settle("second", 0.85, "response");
    await expect(ledger.reserveWhenAvailable("third", 0.2)).resolves.toBe(false);
  });

  it("shrinks freely, grows only within the cap, and releases without spending", () => {
    const ledger = new SpendLedger(1);
    ledger.tryReserve("judge", 0.5);
    ledger.tryReserve("other", 0.4);
    expect(ledger.resize("judge", 0.7)).toBe(false);
    expect(ledger.resize("judge", 0.1)).toBe(true);
    ledger.release("judge");
    expect(ledger.snapshot().reservedUsd).toBeCloseTo(0.4);
    expect(ledger.snapshot().entries).toEqual([]);
  });

  it("charges still-open reservations at their worst case after an unexpected failure", () => {
    const ledger = new SpendLedger(1);
    ledger.tryReserveMany({ a: 0.2, b: 0.3 });
    ledger.settle("a", 0.05, "response");
    expect(ledger.settleOpenAtReserved(["a", "b"])).toBeCloseTo(0.3);
    expect(ledger.snapshot().spentUsd).toBeCloseTo(0.35);
  });
});

describe("pricing", () => {
  const table = parsePricingTable({
    data: [
      {
        id: "x/known",
        pricing: { prompt: "0.000001", completion: "0.000002", overrides: [{ prompt: "0.000003", completion: "0.000004" }] },
        architecture: { input_modalities: ["text", "image"] },
        supported_parameters: ["max_tokens", "structured_outputs"],
      },
      { id: "router/auto", pricing: { prompt: "-1", completion: "-1" } },
      { id: "x/no-pricing" },
    ],
  });

  it("refuses a model without usable pricing", () => {
    expect(() => pricingFor(table, "x/unknown")).toThrow(MissingPricingError);
    expect(() => pricingFor(table, "router/auto")).toThrow(MissingPricingError);
    expect(() => pricingFor(table, "x/no-pricing")).toThrow(MissingPricingError);
  });

  it("bounds a call by the highest listed price tier", () => {
    const priced = pricingFor(table, "x/known");
    expect(priced.pricing.prompt).toBeCloseTo(3e-6);
    // 4000 chars -> 1000 tokens, plus 5000 tokens for one image; 1000 output tokens.
    expect(callCostUpperBound(priced.pricing, 4000, 1, 1000)).toBeCloseTo(6000 * 3e-6 + 1000 * 4e-6);
  });
});

describe("readSpendCapUsd", () => {
  it("requires a positive OPENROUTER_SPEND_CAP_USD", () => {
    expect(() => readSpendCapUsd({})).toThrow(SpendCapConfigError);
    expect(() => readSpendCapUsd({ OPENROUTER_SPEND_CAP_USD: "abc" })).toThrow(SpendCapConfigError);
    expect(() => readSpendCapUsd({ OPENROUTER_SPEND_CAP_USD: "0" })).toThrow(SpendCapConfigError);
    expect(readSpendCapUsd({ OPENROUTER_SPEND_CAP_USD: "2.5" })).toBe(2.5);
  });
});

describe("overshoot", () => {
  it("records an actual cost above the reservation and keeps the largest overshoot as a safety margin", () => {
    const ledger = new SpendLedger(1);
    ledger.tryReserve("a", 0.2);
    ledger.settle("a", 0.5, "response");
    const snap = ledger.snapshot();
    expect(snap.entries[0]).toMatchObject({ reservedUsd: 0.2, actualUsd: 0.5, overshootUsd: 0.3 });
    expect(snap.overshootUsd).toBeCloseTo(0.3);
    expect(snap.maxOvershootUsd).toBeCloseTo(0.3);
    // 0.5 spent + 0.3 margin leaves 0.2: a 0.25 reservation fits the cap alone but not with the margin.
    expect(ledger.tryReserve("b", 0.25)).toBe(false);
    expect(ledger.tryReserve("c", 0.15)).toBe(true);
  });

  it("charges and frees the reservation even when settle gets an invalid amount", () => {
    const ledger = new SpendLedger(1);
    ledger.tryReserve("a", 0.2);
    expect(() => ledger.settle("a", -1, "response")).toThrow(RangeError);
    expect(ledger.snapshot()).toMatchObject({ reservedUsd: 0, spentUsd: 0.2 });
  });
});

describe("parsePricingTable fees and robustness", () => {
  const table = parsePricingTable({
    data: [
      { id: "x/fee", pricing: { prompt: "0", completion: "0", request: "0.01", image: "0.002" } },
      { id: "x/broken", pricing: { prompt: null, completion: "0.1" } },
      { id: "x/blank", pricing: { prompt: "", completion: "0.1" } },
      { pricing: { prompt: "1", completion: "1" } },
    ],
  });

  it("includes the per-request fee and the image price in the bound", () => {
    const { pricing } = pricingFor(table, "x/fee");
    expect(callCostUpperBound(pricing, 0, 1, 1000)).toBeCloseTo(0.012);
  });

  it("skips malformed entries instead of failing the whole table, and treats a blank price as missing", () => {
    expect(() => pricingFor(table, "x/broken")).toThrow(MissingPricingError);
    expect(() => pricingFor(table, "x/blank")).toThrow(MissingPricingError);
    expect(table.size).toBe(1);
  });
});
