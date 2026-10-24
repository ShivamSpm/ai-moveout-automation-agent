// Prompt, request shape, cost bounds and output parsing for one room photo. Kept free of
// "server-only" and of the HTTP client so the eval dry run can load it under plain Node.
import type { z } from "zod";
import { CATEGORIES, INVENTORY_RESPONSE_FORMAT, InventoryResultSchema, type InventoryResult } from "@/contracts/inventory";
import type { ReasoningEffort, VisionRequest } from "@/server/integrations/openrouter";
import { callCostExpected, callCostUpperBound, type ModelPricing, type PricedModel } from "@/server/integrations/spend-ledger";

export const DEFAULT_VISION_MODEL = "anthropic/claude-sonnet-5.5";
export const DEFAULT_VISION_MAX_TOKENS = 4000;
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "low";

export const INVENTORY_SYSTEM_PROMPT = `You are a home inventory assistant helping someone move out. They photograph every room, and your list becomes the checklist on which they decide, item by item, whether to sell, give away, recycle, or take each belonging before their move-out deadline. A missed item is left behind; an invented item wastes their time. Accuracy matters more than length.

Look at the photo and list every MOVABLE BELONGING you can actually see.

What to include:
- Furniture, appliances that plug in (fridge, washer, microwave, lamps), electronics, kitchenware, decor, textiles (rugs, curtains, bedding), books and media, clothing, tools, sports and outdoor gear, toys, plants, storage containers, and anything else a person would pack, sell, or throw away.
- Items that are partly hidden or cut off at the edge, if you can still tell what they are.

What to exclude (the home keeps these):
- Built-ins and fixtures: sinks, faucets, toilets, bathtubs, showers, built-in cabinets and countertops, built-in shelving, windows, doors, radiators, outlets, switches, wired ceiling lights and ceiling fans, built-in ovens and cooktops, fitted wardrobes, flooring, walls.
- People and pets.

How to list:
- One entry per kind of thing. Group many small similar things into a single entry and set quantity, e.g. "books" with quantity 30, "throw pillows" with quantity 4, "kitchen utensils" with quantity 12. Give an estimate when an exact count is impossible.
- Distinct large items get their own entry even if similar (two different armchairs are two entries unless they are a matching set, which is one entry with quantity 2).
- Use short, plain, specific names a buyer would search for: "floor lamp", "office chair", "stand mixer" rather than "object" or "furniture piece".
- Never invent items you cannot see. Do not infer the contents of closed drawers, boxes, or cupboards; list the closed box itself if it is movable.

Fields for each item:
- category: one of ${CATEGORIES.join(", ")}.
- quantity: integer >= 1.
- size_class: small (fits in one hand or a small box), medium (one person carries it easily), large (one person struggles, e.g. armchair, TV, bike), bulky (needs two people or a truck, e.g. sofa, bed, wardrobe, fridge).
- condition: new, good, fair, poor, or unknown when the photo does not show it well enough.
- brand: only if a logo or label is visible or the design is unmistakable; otherwise null. Never guess.
- estimated_resale_usd: a realistic used-market range for the whole entry (all units), as {"low": number, "high": number} in US dollars, or null if you cannot judge.
- confidence: 0 to 1, how sure you are the item is really there and named correctly.
- notes: anything that affects resale or moving (damage, visible model, needs disassembly), or null.

Also give room_type: a short label such as "living room", "kitchen", "bedroom", "home office", "garage", "closet", "bathroom", or "storage room".

Respond with JSON only, matching this shape exactly, with no markdown and no commentary:
{"room_type": string, "items": [{"name": string, "category": string, "quantity": integer, "size_class": string, "condition": string, "brand": string|null, "estimated_resale_usd": {"low": number, "high": number}|null, "confidence": number, "notes": string|null}]}`;

export const INVENTORY_USER_PROMPT = "List every movable belonging visible in this photo.";

export const INVENTORY_PROMPT_CHARS =
  INVENTORY_SYSTEM_PROMPT.length + INVENTORY_USER_PROMPT.length + JSON.stringify(INVENTORY_RESPONSE_FORMAT).length;

export function buildInventoryRequest(
  model: string,
  imageUrl: string,
  maxTokens: number,
  reasoningEffort: ReasoningEffort,
): VisionRequest {
  return {
    model,
    messages: [
      { role: "system", content: INVENTORY_SYSTEM_PROMPT },
      // OpenRouter recommends the text part before the image.
      {
        role: "user",
        content: [
          { type: "text", text: INVENTORY_USER_PROMPT },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    maxTokens,
    responseFormat: INVENTORY_RESPONSE_FORMAT,
    reasoningEffort,
  };
}

export function inventoryCallUpperBound(pricing: ModelPricing, maxTokens: number): number {
  return callCostUpperBound(pricing, INVENTORY_PROMPT_CHARS, 1, maxTokens);
}

export function inventoryCallExpected(pricing: ModelPricing, maxTokens: number): number {
  return callCostExpected(pricing, INVENTORY_PROMPT_CHARS, 1, maxTokens);
}

/** Null when the model can take this request; otherwise why not, from its /models entry. */
export function unsupportedReason(model: PricedModel): string | null {
  if (!model.inputModalities.includes("image")) return `${model.id} does not list image input`;
  if (!model.supportedParameters.includes("structured_outputs")) return `${model.id} does not support structured outputs`;
  if (!model.supportedParameters.includes("max_tokens")) return `${model.id} does not accept max_tokens`;
  return null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; kind: "empty" | "json" | "schema"; detail: string };

/** Removes a markdown code fence around the JSON if present; no other repair is attempted. */
export function stripFences(text: string): string {
  const match = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/.exec(text);
  return (match ? match[1] : text).trim();
}

export function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n");
}

export function parseJsonOutput<T>(content: string, schema: z.ZodType<T>): ParseResult<T> {
  const body = stripFences(content);
  if (!body) return { ok: false, kind: "empty", detail: "model returned no content" };
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (error) {
    return { ok: false, kind: "json", detail: error instanceof Error ? error.message : String(error) };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, kind: "schema", detail: formatIssues(parsed.error) };
}

export function parseInventoryOutput(content: string): ParseResult<InventoryResult> {
  return parseJsonOutput(content, InventoryResultSchema);
}
