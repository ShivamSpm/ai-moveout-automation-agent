import { z } from "zod";
import type { CostSource } from "@/contracts/inventory";

export const CHARS_PER_TOKEN = 4;
// Claude 4.7+ high-resolution models spend up to 4,784 visual tokens on one image (Anthropic vision
// docs); other providers differ, which is why overshoot is tracked rather than assumed impossible.
export const IMAGE_TOKEN_ALLOWANCE = 5000;
export const EXPECTED_OUTPUT_TOKENS = 1500;
const EPSILON_USD = 1e-12;

/** USD per token (prompt, completion, internal reasoning), per image and per request. */
export interface ModelPricing {
  prompt: number;
  completion: number;
  image: number;
  request: number;
  internalReasoning: number | null;
}

export interface PricedModel {
  id: string;
  pricing: ModelPricing;
  inputModalities: readonly string[];
  supportedParameters: readonly string[];
}

export type PricingTable = ReadonlyMap<string, PricedModel>;

export class MissingPricingError extends Error {
  override name = "MissingPricingError";
}

export class SpendCapConfigError extends Error {
  override name = "SpendCapConfigError";
}

// A blank string is not a price of zero.
const price = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : Number(v)));
const priceTier = z.object({ prompt: price, completion: price, image: price, request: price, internal_reasoning: price });
const modelEntry = z.object({
  id: z.string().min(1),
  pricing: priceTier.extend({ overrides: z.array(priceTier).optional() }).optional(),
  architecture: z.object({ input_modalities: z.array(z.string()).optional() }).optional(),
  supported_parameters: z.array(z.string()).optional(),
});
const modelsPayload = z.object({ data: z.array(z.unknown()) });

function known(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function highest(values: Array<number | undefined>): number | undefined {
  const usable = values.filter(known);
  return usable.length ? Math.max(...usable) : undefined;
}

/**
 * Parses GET /api/v1/models. Models without a usable prompt and completion price are dropped, so
 * `pricingFor` refuses them (router models list -1). Price overrides apply to long prompts; the
 * highest tier is kept so the worst-case bound never undercounts.
 */
export function parsePricingTable(payload: unknown): PricingTable {
  const table = new Map<string, PricedModel>();
  for (const raw of modelsPayload.parse(payload).data) {
    // One malformed entry only removes that model, which pricingFor then refuses.
    const parsed = modelEntry.safeParse(raw);
    if (!parsed.success) continue;
    const entry = parsed.data;
    const tiers = entry.pricing ? [entry.pricing, ...(entry.pricing.overrides ?? [])] : [];
    const prompt = highest(tiers.map((t) => t.prompt));
    const completion = highest(tiers.map((t) => t.completion));
    if (prompt === undefined || completion === undefined || !known(entry.pricing?.prompt) || !known(entry.pricing?.completion)) {
      continue;
    }
    table.set(entry.id, {
      id: entry.id,
      pricing: {
        prompt,
        completion,
        image: highest(tiers.map((t) => t.image)) ?? 0,
        request: highest(tiers.map((t) => t.request)) ?? 0,
        internalReasoning: highest(tiers.map((t) => t.internal_reasoning)) ?? null,
      },
      inputModalities: entry.architecture?.input_modalities ?? [],
      supportedParameters: entry.supported_parameters ?? [],
    });
  }
  return table;
}

export function pricingFor(table: PricingTable, model: string): PricedModel {
  const entry = table.get(model);
  if (!entry) throw new MissingPricingError(`No pricing for ${model} in /api/v1/models; refusing to call it`);
  return entry;
}

export function estimateInputTokens(promptChars: number, imageCount: number): number {
  return Math.ceil(promptChars / CHARS_PER_TOKEN) + IMAGE_TOKEN_ALLOWANCE * imageCount;
}

function outputPrice(pricing: ModelPricing): number {
  // Reasoning tokens count inside max_tokens; bill all of them at the higher rate when one is listed.
  return Math.max(pricing.completion, pricing.internalReasoning ?? 0);
}

export function callCostUpperBound(pricing: ModelPricing, promptChars: number, imageCount: number, maxTokens: number): number {
  return (
    estimateInputTokens(promptChars, imageCount) * pricing.prompt +
    maxTokens * outputPrice(pricing) +
    pricing.image * imageCount +
    pricing.request
  );
}

export function callCostExpected(pricing: ModelPricing, promptChars: number, imageCount: number, maxTokens: number): number {
  const outputTokens = Math.min(EXPECTED_OUTPUT_TOKENS, maxTokens);
  return (
    estimateInputTokens(promptChars, imageCount) * pricing.prompt +
    outputTokens * pricing.completion +
    pricing.image * imageCount +
    pricing.request
  );
}

export interface BilledUsage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

/** The provider-reported cost when present, otherwise tokens times list price. */
export function actualCost(usage: BilledUsage | null, pricing: ModelPricing, imageCount: number): { usd: number; source: CostSource } {
  if (usage === null) return { usd: 0, source: "none" };
  if (usage.costUsd !== null) return { usd: usage.costUsd, source: "response" };
  return {
    usd:
      usage.promptTokens * pricing.prompt +
      usage.completionTokens * outputPrice(pricing) +
      pricing.image * imageCount +
      pricing.request,
    source: "usage_x_price",
  };
}

/**
 * App-level cap for this process. A serverless platform runs many short-lived instances, each with
 * its own ledger that starts at zero, so this is not a durable account-wide limit: the credit
 * limit set on the OpenRouter key itself is the durable backstop.
 */
export function readSpendCapUsd(env: Record<string, string | undefined> = process.env): number {
  const raw = env.OPENROUTER_SPEND_CAP_USD?.trim();
  if (!raw) throw new SpendCapConfigError("OPENROUTER_SPEND_CAP_USD is not set; refusing to call OpenRouter without a spend cap");
  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap <= 0) {
    throw new SpendCapConfigError(`OPENROUTER_SPEND_CAP_USD must be a positive number of US dollars, got "${raw}"`);
  }
  return cap;
}

export interface LedgerEntry {
  key: string;
  reservedUsd: number;
  actualUsd: number;
  source: CostSource;
  /** max(0, actual - reserved): the bound did not hold for this call. */
  overshootUsd: number;
}

export interface LedgerSnapshot {
  capUsd: number;
  spentUsd: number;
  reservedUsd: number;
  remainingUsd: number;
  overshootUsd: number;
  maxOvershootUsd: number;
  entries: LedgerEntry[];
}

function checkAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`ledger amount must be a finite number >= 0, got ${amount}`);
}

/**
 * Every call reserves its worst-case cost before dispatch and settles its actual cost after.
 * Check and claim run synchronously, so concurrent async callers can never jointly commit more
 * than the cap, provided each call's bound holds. When one does not (actual > reserved), the
 * overshoot is recorded and the largest one seen becomes a safety margin on every later
 * reservation: spent + open reservations + margin + new reservation <= cap.
 */
export class SpendLedger {
  readonly capUsd: number;
  private spent = 0;
  private overshoot = 0;
  private maxOvershoot = 0;
  private readonly open = new Map<string, number>();
  private readonly used = new Set<string>();
  private readonly entries: LedgerEntry[] = [];
  private waiters: Array<() => void> = [];

  constructor(capUsd: number) {
    if (!Number.isFinite(capUsd) || capUsd < 0) throw new RangeError("spend cap must be a finite number >= 0");
    this.capUsd = capUsd;
  }

  private reserved(): number {
    let total = 0;
    for (const amount of this.open.values()) total += amount;
    return total;
  }

  private fits(amount: number): boolean {
    return this.spent + this.reserved() + this.maxOvershoot + amount <= this.capUsd + EPSILON_USD;
  }

  private notify(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const wake of waiters) wake();
  }

  private claimAll(claims: Record<string, number>): void {
    for (const [key, amount] of Object.entries(claims)) {
      if (!key) throw new RangeError("ledger key must be non-empty");
      if (this.used.has(key)) throw new Error(`ledger key already used: ${key}`);
      checkAmount(amount);
    }
    for (const [key, amount] of Object.entries(claims)) {
      this.open.set(key, amount);
      this.used.add(key);
    }
  }

  private total(claims: Record<string, number>): number {
    return Object.values(claims).reduce((sum, amount) => sum + amount, 0);
  }

  tryReserve(key: string, amountUsd: number): boolean {
    return this.tryReserveMany({ [key]: amountUsd });
  }

  /** All or nothing. */
  tryReserveMany(claims: Record<string, number>): boolean {
    Object.values(claims).forEach(checkAmount);
    if (!this.fits(this.total(claims))) return false;
    this.claimAll(claims);
    return true;
  }

  reserveWhenAvailable(key: string, amountUsd: number): Promise<boolean> {
    return this.reserveManyWhenAvailable({ [key]: amountUsd });
  }

  /** Like tryReserveMany, but waits while other calls are in flight, since settling may free room.
   * Resolves false only when nothing is in flight and the claims still do not fit. */
  async reserveManyWhenAvailable(claims: Record<string, number>): Promise<boolean> {
    Object.values(claims).forEach(checkAmount);
    const total = this.total(claims);
    while (!this.fits(total)) {
      if (this.open.size === 0) return false;
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.claimAll(claims);
    return true;
  }

  private openAmount(key: string): number {
    const amount = this.open.get(key);
    if (amount === undefined) throw new Error(`no open reservation for ledger key: ${key}`);
    return amount;
  }

  /** Shrinking always succeeds; growing only if the difference fits. */
  resize(key: string, amountUsd: number): boolean {
    checkAmount(amountUsd);
    const current = this.openAmount(key);
    if (amountUsd > current && !this.fits(amountUsd - current)) return false;
    this.open.set(key, amountUsd);
    this.notify();
    return true;
  }

  /** Drops a reservation for a call that was never dispatched. */
  release(key: string): void {
    this.openAmount(key);
    this.open.delete(key);
    this.notify();
  }

  settle(key: string, actualUsd: number, source: CostSource): LedgerEntry {
    const reservedUsd = this.openAmount(key);
    if (!Number.isFinite(actualUsd) || actualUsd < 0) {
      // Never leave the reservation open: charge the worst case, then fail loudly.
      this.settleOpenAtReserved([key]);
      throw new RangeError(`ledger amount must be a finite number >= 0, got ${actualUsd}`);
    }
    this.open.delete(key);
    this.spent += actualUsd;
    const overshootUsd = Math.max(0, actualUsd - reservedUsd);
    this.overshoot += overshootUsd;
    this.maxOvershoot = Math.max(this.maxOvershoot, overshootUsd);
    const entry = { key, reservedUsd, actualUsd, source, overshootUsd };
    this.entries.push(entry);
    this.notify();
    return { ...entry };
  }

  /** Settles whichever keys are still open at their reserved worst case; returns the total charged.
   * Used after an unexpected failure, when nobody knows whether those calls were billed. */
  settleOpenAtReserved(keys: readonly string[]): number {
    let total = 0;
    for (const key of keys) {
      const reservedUsd = this.open.get(key);
      if (reservedUsd === undefined) continue;
      this.open.delete(key);
      this.spent += reservedUsd;
      this.entries.push({ key, reservedUsd, actualUsd: reservedUsd, source: "worst_case", overshootUsd: 0 });
      total += reservedUsd;
    }
    this.notify();
    return total;
  }

  snapshot(): LedgerSnapshot {
    return {
      capUsd: this.capUsd,
      spentUsd: this.spent,
      reservedUsd: this.reserved(),
      remainingUsd: this.capUsd - this.spent,
      overshootUsd: this.overshoot,
      maxOvershootUsd: this.maxOvershoot,
      entries: this.entries.map((entry) => ({ ...entry })),
    };
  }
}

/** Refreshes the pricing table from GET {baseUrl}/models, which is public: no key is sent. */
export async function fetchPricingTable({
  baseUrl,
  fetch: fetchImpl = fetch,
  timeoutMs = 30_000,
}: {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): Promise<PricingTable> {
  const response = await fetchImpl(`${baseUrl}/models`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new MissingPricingError(`GET ${baseUrl}/models returned HTTP ${response.status}`);
  return parsePricingTable(await response.json());
}
