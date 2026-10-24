import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { jsonSchemaResponseFormat } from "@/contracts/json-schema";
import type { PhotoMimeType } from "@/contracts/inventory";
import { completeVision, imageDataUrl } from "@/server/integrations/openrouter";
import { actualCost, callCostUpperBound, MissingPricingError, pricingFor } from "@/server/integrations/spend-ledger";
import { loadIdentifyItemsDeps, photoProblem } from "./identify-items";
import { parseJsonOutput, unsupportedReason } from "./inventory-prompt";

// One photo of one item -> a short listing title and description for the
// renter to edit. No specs or features: the renter adds those themselves.
// Shares identify-items' spend cap and pricing table.

const DescriptionSchema = z.strictObject({
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(400),
});
export type ItemDescription = z.infer<typeof DescriptionSchema>;

const PROMPT = `This photo shows one item someone wants to sell before moving out. Write a short marketplace listing title (at most 8 words, e.g. "Grey fabric 3-seat sofa") and a one- or two-sentence description of what is visible: the kind of item, colour, material and any visible wear. Do not guess brand, model, size, measurements or technical specs, and do not mention price.`;
const MAX_TOKENS = 600;

export type DescribeResult = { ok: true; value: ItemDescription } | { ok: false; status: number; message: string };

export async function describeItemPhoto(photo: { bytes: Uint8Array; mimeType: string }): Promise<DescribeResult> {
  const problem = photoProblem(photo.bytes, photo.mimeType);
  if (problem) return { ok: false, status: 400, message: problem };
  const deps = await loadIdentifyItemsDeps();
  let priced;
  try {
    priced = pricingFor(deps.pricing, deps.model);
  } catch (error) {
    if (error instanceof MissingPricingError) return { ok: false, status: 503, message: error.message };
    throw error;
  }
  const unsupported = unsupportedReason(priced);
  if (unsupported) return { ok: false, status: 503, message: unsupported };

  const worstCase = callCostUpperBound(priced.pricing, PROMPT.length, 1, MAX_TOKENS);
  const key = `describe-item:${randomUUID()}`;
  if (!deps.ledger.tryReserve(key, worstCase)) return { ok: false, status: 429, message: "The photo-description spend cap is used up" };

  let reply: Awaited<ReturnType<typeof completeVision>>;
  try {
    reply = await completeVision(
      {
        model: deps.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: imageDataUrl(photo.bytes, photo.mimeType as PhotoMimeType) } },
            ],
          },
        ],
        maxTokens: MAX_TOKENS,
        responseFormat: jsonSchemaResponseFormat("item_description", DescriptionSchema),
        reasoningEffort: deps.reasoningEffort,
      },
      deps.openRouter,
    );
  } catch (error) {
    deps.ledger.settleOpenAtReserved([key]);
    throw error;
  }
  const billingUnknown = reply.ok ? reply.usage === null : reply.billingUnknown;
  const cost = billingUnknown ? { usd: worstCase, source: "worst_case" as const } : actualCost(reply.usage, priced.pricing, 1);
  deps.ledger.settle(key, cost.usd, cost.source);

  if (!reply.ok) return { ok: false, status: 502, message: `${reply.kind}: ${reply.message}` };
  const parsed = parseJsonOutput(reply.content, DescriptionSchema);
  if (!parsed.ok) return { ok: false, status: 502, message: `${parsed.kind}: ${parsed.detail}` };
  return { ok: true, value: parsed.value };
}
