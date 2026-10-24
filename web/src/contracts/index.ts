// Shared, validated shapes for tools, reviewed actions and capability states.
// Kept free of framework and provider imports so it can move to
// packages/contracts unchanged when the agent worker needs it.

import { z } from "zod";

export const uuid = z.uuid();

// How an outcome was produced. Shown to the renter on every action and listing.
export const ExecutionMode = z.enum(["live", "manual_handoff", "simulated"]);
export type ExecutionMode = z.infer<typeof ExecutionMode>;

export const ActionStatus = z.enum([
  "pending_review",
  "approved",
  "executing",
  "succeeded",
  "failed",
  "unknown",
  "cancelled",
]);
export type ActionStatus = z.infer<typeof ActionStatus>;

const email = z.email().max(254);

export const GmailSendPayload = z.object({
  to: z.array(email).min(1).max(5),
  cc: z.array(email).max(5).default([]),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
});

export const CalendarCreatePayload = z.object({
  summary: z.string().min(1).max(200),
  description: z.string().max(5_000).default(""),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  timeZone: z.string().min(1).max(64),
  // Attendees receive an invitation. Empty means a private calendar entry only.
  attendees: z.array(email).max(10).default([]),
  sendInvitations: z.boolean().default(false),
});

export const ListingPublishPayload = z.object({
  listingId: uuid,
  channel: z.enum(["facebook_marketplace", "craigslist", "buy_nothing", "vinted", "in_app", "telegram"]),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(5_000),
  priceCents: z.int().min(0),
  areaLabel: z.string().max(100).nullable(),
  // The exact stored photos approved with this listing. Absent on older drafts.
  photos: z
    .array(z.object({ documentId: uuid, sha256: z.string().regex(/^[0-9a-f]{64}$/) }))
    .max(10)
    .optional(),
});

export const BuyerReplyPayload = z.object({
  conversationId: uuid,
  buyerLabel: z.string().min(1).max(100),
  body: z.string().min(1).max(2_000),
  // True when the body reveals the exact pickup address; requires its own review.
  disclosesExactAddress: z.boolean(),
});

export const PickupConfirmPayload = z.object({
  conversationId: uuid,
  itemId: uuid,
  buyerLabel: z.string().min(1).max(100),
  priceCents: z.int().min(0),
  pickupStart: z.iso.datetime({ offset: true }),
  pickupEnd: z.iso.datetime({ offset: true }),
  message: z.string().min(1).max(2_000),
  disclosesExactAddress: z.boolean(),
});

export const ActionPayloads = {
  "gmail.send": GmailSendPayload,
  "calendar.create": CalendarCreatePayload,
  "listing.publish": ListingPublishPayload,
  "buyer.reply": BuyerReplyPayload,
  "pickup.confirm": PickupConfirmPayload,
} as const;
export type ActionKind = keyof typeof ActionPayloads;
export const ActionKind = z.enum(
  Object.keys(ActionPayloads) as [ActionKind, ...ActionKind[]],
);
export type ActionPayload<K extends ActionKind> = z.infer<(typeof ActionPayloads)[K]>;

// Lease rules in the shape web/src/lib/schedule.ts already plans from.
export const LeaseRuleKey = z.enum([
  "notice_days",
  "carpet_cleaning",
  "wall_repair",
  "general_cleaning",
  "key_return",
]);
export type LeaseRuleKey = z.infer<typeof LeaseRuleKey>;

export const Confidence = z.enum(["high", "medium", "low", "unresolved"]);

export const LeaseFinding = z.object({
  ruleKey: LeaseRuleKey,
  value: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).nullable(),
  quote: z.string().max(1_000).nullable(),
  page: z.int().positive().nullable(),
  confidence: Confidence,
});
export type LeaseFinding = z.infer<typeof LeaseFinding>;

export const Disposition = z.enum(["undecided", "keep", "sell", "donate"]);
export type Disposition = z.infer<typeof Disposition>;

// Per-channel marketplace capabilities, reported independently and honestly.
export const CapabilityState = z.enum(["live", "manual_handoff", "unsupported", "untested"]);
export type CapabilityState = z.infer<typeof CapabilityState>;
