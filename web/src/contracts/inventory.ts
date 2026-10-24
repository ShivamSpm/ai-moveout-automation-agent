import { z } from "zod";
import { jsonSchemaResponseFormat } from "./json-schema";

export const CATEGORIES = [
  "furniture",
  "appliance",
  "electronics",
  "kitchenware",
  "decor",
  "lighting",
  "textiles",
  "books_media",
  "clothing",
  "tools",
  "sports_outdoor",
  "toys",
  "plants",
  "storage",
  "other",
] as const;
export const SIZE_CLASSES = ["small", "medium", "large", "bulky"] as const;
export const CONDITIONS = ["new", "good", "fair", "poor", "unknown"] as const;

export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const ResaleRangeSchema = z
  .strictObject({
    low: z.number().min(0),
    high: z.number().min(0),
  })
  .refine((range) => range.low <= range.high, { message: "low must not exceed high" });

export const InventoryItemSchema = z.strictObject({
  name: z.string().min(1),
  category: CategorySchema,
  quantity: z.number().int().min(1),
  size_class: z.enum(SIZE_CLASSES),
  condition: z.enum(CONDITIONS),
  brand: z.string().nullable(),
  estimated_resale_usd: ResaleRangeSchema.nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

/** What the vision model must return for one room photo. */
export const InventoryResultSchema = z.strictObject({
  room_type: z.string().min(1),
  items: z.array(InventoryItemSchema),
});
export type InventoryResult = z.infer<typeof InventoryResultSchema>;

export const INVENTORY_RESPONSE_FORMAT = jsonSchemaResponseFormat("room_inventory", InventoryResultSchema);

export const ACCEPTED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoMimeType = (typeof ACCEPTED_PHOTO_MIME_TYPES)[number];
// Amazon Bedrock, one of the routes OpenRouter can pick for Claude, accepts at most 5 MB of base64 per
// image (Anthropic vision docs); base64 inflates bytes by 4/3, so 3.75 MB raw is the largest safe photo.
export const MAX_PHOTO_BYTES = 3_750_000;

export const COST_SOURCES = ["response", "usage_x_price", "worst_case", "none"] as const;
export const CostSourceSchema = z.enum(COST_SOURCES);
export type CostSource = z.infer<typeof CostSourceSchema>;

/** Model output is a proposal: nothing is confirmed until the user confirms it. */
export const ProposedItemSchema = InventoryItemSchema.extend({ status: z.literal("proposed") });
export type ProposedItem = z.infer<typeof ProposedItemSchema>;

const UsageSchema = z.strictObject({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative().nullable(),
});

export const ProposedInventorySchema = z.strictObject({
  ownerId: z.string().min(1),
  photo: z.strictObject({
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    mimeType: z.enum(ACCEPTED_PHOTO_MIME_TYPES),
    byteLength: z.number().int().positive(),
  }),
  // Server clock when the photo was analysed; says nothing about when it was taken.
  analyzedAt: z.string(),
  model: z.strictObject({ requested: z.string().min(1), served: z.string().nullable() }),
  roomType: z.string().min(1),
  items: z.array(ProposedItemSchema),
  latencyMs: z.number().nonnegative(),
  attempts: z.number().int().positive(),
  usage: UsageSchema.nullable(),
  cost: z.strictObject({ usd: z.number().nonnegative(), source: CostSourceSchema }),
  warnings: z.array(z.string()),
});
export type ProposedInventory = z.infer<typeof ProposedInventorySchema>;

export const IDENTIFY_FAILURE_KINDS = [
  "invalid_photo",
  "model_unsupported",
  "pricing_missing",
  "budget_refused",
  "provider_error",
  "timeout",
  "aborted",
  "truncated",
  "invalid_output",
] as const;
export type IdentifyFailureKind = (typeof IDENTIFY_FAILURE_KINDS)[number];

export interface IdentifyItemsFailure {
  kind: IdentifyFailureKind;
  message: string;
  model: string;
  photoSha256: string | null;
  /** Charged to the spend ledger; worst case when the provider may have billed without saying. */
  costUsd: number;
  costSource: CostSource;
  attempts: number;
}

export type IdentifyItemsResult =
  | { ok: true; inventory: ProposedInventory }
  | { ok: false; failure: IdentifyItemsFailure };
