import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ACCEPTED_PHOTO_MIME_TYPES,
  MAX_PHOTO_BYTES,
  type CostSource,
  type IdentifyFailureKind,
  type IdentifyItemsResult,
  type InventoryResult,
  type PhotoMimeType,
  type ProposedInventory,
  ProposedInventorySchema,
} from "@/contracts/inventory";
import {
  completeVision,
  imageDataUrl,
  readOpenRouterConfig,
  type OpenRouterConfig,
  type ReasoningEffort,
  type VisionUsage,
} from "@/server/integrations/openrouter";
import {
  MissingPricingError,
  SpendLedger,
  actualCost,
  fetchPricingTable,
  pricingFor,
  readSpendCapUsd,
  type PricedModel,
  type PricingTable,
} from "@/server/integrations/spend-ledger";
import {
  DEFAULT_REASONING_EFFORT,
  DEFAULT_VISION_MAX_TOKENS,
  DEFAULT_VISION_MODEL,
  buildInventoryRequest,
  inventoryCallUpperBound,
  parseInventoryOutput,
  unsupportedReason,
} from "./inventory-prompt";

const LOW_CONFIDENCE = 0.5;
const PRICING_TTL_MS = 60 * 60 * 1000;

export interface IdentifyItemsDeps {
  openRouter: OpenRouterConfig;
  ledger: SpendLedger;
  pricing: PricingTable;
  model: string;
  maxTokens: number;
  reasoningEffort: ReasoningEffort;
  now: () => Date;
}

const inputSchema = z.object({
  photo: z.object({ bytes: z.instanceof(Uint8Array), mimeType: z.string() }),
  // Comes from the authenticated server context, never from model output.
  ownerId: z.string().trim().min(1),
  signal: z.instanceof(AbortSignal).optional(),
});
export type IdentifyItemsInput = z.input<typeof inputSchema>;

const SIGNATURES: Record<PhotoMimeType, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => b[i] === byte),
  "image/webp": (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
};

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function isAccepted(mime: string): mime is PhotoMimeType {
  return (ACCEPTED_PHOTO_MIME_TYPES as readonly string[]).includes(mime);
}

/** Null when the photo is acceptable, otherwise the reason it is not. */
export function photoProblem(bytes: Uint8Array, mimeType: string): string | null {
  if (!isAccepted(mimeType)) return `unsupported photo type "${mimeType}"; use ${ACCEPTED_PHOTO_MIME_TYPES.join(", ")}`;
  if (bytes.byteLength === 0) return "photo is empty";
  if (bytes.byteLength > MAX_PHOTO_BYTES) return `photo is ${bytes.byteLength} bytes; the limit is ${MAX_PHOTO_BYTES}`;
  if (!SIGNATURES[mimeType](bytes)) return `photo bytes do not look like ${mimeType}`;
  return null;
}

let processLedger: SpendLedger | undefined;
let pricingCache: { table: PricingTable; fetchedAt: number } | undefined;

/** Production dependencies from the environment. Throws before any network call when the key or
 * the spend cap is missing. */
export async function loadIdentifyItemsDeps({
  env = process.env,
  fetch: fetchImpl = fetch,
}: { env?: Record<string, string | undefined>; fetch?: typeof fetch } = {}): Promise<IdentifyItemsDeps> {
  const openRouter = readOpenRouterConfig(env, { fetch: fetchImpl });
  const cap = readSpendCapUsd(env);
  processLedger ??= new SpendLedger(cap);
  if (!pricingCache || Date.now() - pricingCache.fetchedAt > PRICING_TTL_MS) {
    pricingCache = { table: await fetchPricingTable({ baseUrl: openRouter.baseUrl, fetch: fetchImpl }), fetchedAt: Date.now() };
  }
  return {
    openRouter,
    ledger: processLedger,
    pricing: pricingCache.table,
    model: env.OPENROUTER_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL,
    maxTokens: DEFAULT_VISION_MAX_TOKENS,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
    now: () => new Date(),
  };
}

function failure(
  kind: IdentifyFailureKind,
  message: string,
  context: { model: string; sha256: string | null },
  spend: { usd: number; source: CostSource; attempts: number } = { usd: 0, source: "none", attempts: 0 },
): IdentifyItemsResult {
  return {
    ok: false,
    failure: { kind, message, model: context.model, photoSha256: context.sha256, costUsd: spend.usd, costSource: spend.source, attempts: spend.attempts },
  };
}

interface SettledCost {
  usd: number;
  source: CostSource;
  reservedUsd: number;
  overshootUsd: number;
}

function warningsFor(inventory: InventoryResult, cost: SettledCost): string[] {
  const warnings: string[] = [];
  if (inventory.items.length === 0) warnings.push("No movable belongings were identified; retake the photo or add items manually.");
  const low = inventory.items.filter((item) => item.confidence < LOW_CONFIDENCE).length;
  if (low > 0) warnings.push(`${low} item(s) have confidence below ${LOW_CONFIDENCE}; check them before confirming.`);
  if (cost.source === "worst_case") {
    warnings.push("OpenRouter reported no usage for this call; it was charged at its reserved worst case.");
  } else if (cost.source === "usage_x_price") {
    warnings.push("OpenRouter did not report the cost; the recorded cost is estimated from token counts and list prices.");
  }
  if (cost.overshootUsd > 0) warnings.push(overshootWarning(cost));
  return warnings;
}

function overshootWarning(cost: SettledCost): string {
  return (
    `This call cost $${cost.usd.toFixed(4)}, which exceeded its reserved worst case of $${cost.reservedUsd.toFixed(4)}; ` +
    "later calls keep that difference as a safety margin."
  );
}

/**
 * Turns one room photo into a proposed item inventory. Nothing is persisted and nothing is
 * confirmed: every item stays "proposed" until the user confirms it.
 */
export async function identifyItemsFromPhoto(input: IdentifyItemsInput, deps?: IdentifyItemsDeps): Promise<IdentifyItemsResult> {
  const { photo, ownerId, signal } = inputSchema.parse(input);
  // Checked before loading configuration, so a bad upload never triggers a pricing fetch.
  const problem = photoProblem(photo.bytes, photo.mimeType);
  if (problem) {
    const model = deps?.model ?? (process.env.OPENROUTER_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL);
    return failure("invalid_photo", problem, { model, sha256: null });
  }
  const resolved = deps ?? (await loadIdentifyItemsDeps());
  const { model, ledger } = resolved;
  const mimeType = photo.mimeType as PhotoMimeType;
  const sha256 = createHash("sha256").update(photo.bytes).digest("hex");
  const context = { model, sha256 };

  let priced: PricedModel;
  try {
    priced = pricingFor(resolved.pricing, model);
  } catch (error) {
    if (error instanceof MissingPricingError) return failure("pricing_missing", error.message, context);
    throw error;
  }
  const unsupported = unsupportedReason(priced);
  if (unsupported) return failure("model_unsupported", unsupported, context);

  const worstCase = inventoryCallUpperBound(priced.pricing, resolved.maxTokens);
  const request = buildInventoryRequest(model, imageDataUrl(photo.bytes, mimeType), resolved.maxTokens, resolved.reasoningEffort);
  const key = `identify-items:${sha256}:${randomUUID()}`;
  if (!ledger.tryReserve(key, worstCase)) {
    const { spentUsd, reservedUsd, capUsd } = ledger.snapshot();
    return failure(
      "budget_refused",
      `worst case $${worstCase.toFixed(4)} does not fit: spent $${spentUsd.toFixed(4)} + reserved $${reservedUsd.toFixed(4)} of cap $${capUsd.toFixed(2)}`,
      context,
    );
  }

  let reply: Awaited<ReturnType<typeof completeVision>>;
  try {
    reply = await completeVision(request, resolved.openRouter, { signal });
  } catch (error) {
    // Unknown whether anything was billed, so keep the worst case on the books.
    ledger.settleOpenAtReserved([key]);
    throw error;
  }

  const settle = (usage: VisionUsage | null, billingUnknown: boolean): SettledCost => {
    const cost = billingUnknown ? { usd: worstCase, source: "worst_case" as const } : actualCost(usage, priced.pricing, 1);
    const entry = ledger.settle(key, cost.usd, cost.source);
    return { ...cost, reservedUsd: entry.reservedUsd, overshootUsd: entry.overshootUsd };
  };
  const withOvershoot = (message: string, cost: SettledCost) => (cost.overshootUsd > 0 ? `${message} ${overshootWarning(cost)}` : message);

  if (!reply.ok) {
    const cost = settle(reply.usage, reply.billingUnknown);
    const kind: IdentifyFailureKind =
      reply.kind === "truncated" || reply.kind === "timeout" || reply.kind === "aborted" ? reply.kind : "provider_error";
    return failure(kind, withOvershoot(reply.message, cost), context, { usd: cost.usd, source: cost.source, attempts: reply.attempts });
  }

  // A success with no usage block was generated and billed, but nobody said how much.
  const cost = settle(reply.usage, reply.usage === null);
  const spend = { usd: cost.usd, source: cost.source, attempts: reply.attempts };
  const parsed = parseInventoryOutput(reply.content);
  if (!parsed.ok) return failure("invalid_output", withOvershoot(`${parsed.kind}: ${parsed.detail}`, cost), context, spend);

  const inventory: ProposedInventory = {
    ownerId,
    photo: { sha256, mimeType, byteLength: photo.bytes.byteLength },
    analyzedAt: resolved.now().toISOString(),
    model: { requested: model, served: reply.servedModel },
    roomType: parsed.value.room_type,
    items: parsed.value.items.map((item) => ({ ...item, status: "proposed" as const })),
    latencyMs: reply.latencyMs,
    attempts: reply.attempts,
    usage: reply.usage
      ? { promptTokens: reply.usage.promptTokens, completionTokens: reply.usage.completionTokens, reasoningTokens: reply.usage.reasoningTokens }
      : null,
    cost: { usd: cost.usd, source: cost.source },
    warnings: warningsFor(parsed.value, cost),
  };
  return { ok: true, inventory: ProposedInventorySchema.parse(inventory) };
}
