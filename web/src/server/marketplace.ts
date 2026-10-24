import "server-only";

import { z } from "zod";
import { ActionPayloads, type ActionKind } from "@/contracts";
import type { ToolContext } from "./auth";
import { disclosesAddress, draftListing } from "./domain/drafts";
import { assertInScope } from "./domain/scope";

// Renter-side marketplace operations. Always run with the renter's own
// user-scoped client, so RLS decides what exists. Shared by the web app and
// the MCP connector used from Claude or Muse.

export class MarketplaceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function fail(error: { message: string; code?: string } | null, status = 400): never {
  throw new MarketplaceError(error?.message ?? "Not found", status);
}

export async function currentMove(ctx: ToolContext) {
  const { data, error } = await ctx.db
    .from("moves")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) fail(error, 500);
  if (data) return data;
  const created = await ctx.db.from("moves").insert({ title: "My move" }).select("*").single();
  if (created.error) fail(created.error, 500);
  return created.data;
}

export const UpdateMoveInput = z.object({
  areaLabel: z.string().max(100).nullish(),
  addressPrivate: z.string().max(200).nullish(),
  moveOutDate: z.iso.date().nullish(),
  depositCents: z.number().int().min(0).max(2147483647).nullish(),
  landlordName: z.string().max(100).nullish(),
  landlordEmail: z.email().nullish(),
  renterName: z.string().max(100).nullish(),
  landlordPhone: z.string().max(20).nullish(),
  zip: z.string().regex(/^\d{5}$/).nullish(),
  bedrooms: z.number().int().min(0).max(10).nullish(),
  bathrooms: z.number().min(0.5).max(10).multipleOf(0.5).nullish(),
  sqft: z.number().int().min(100).max(20000).nullish(),
});

export async function updateMove(ctx: ToolContext, input: z.infer<typeof UpdateMoveInput>) {
  input = UpdateMoveInput.parse(input);
  const move = await currentMove(ctx);
  const patch = {
    area_label: input.areaLabel,
    address_private: input.addressPrivate,
    move_out_date: input.moveOutDate,
    deposit_cents: input.depositCents,
    landlord_name: input.landlordName,
    landlord_email: input.landlordEmail,
    renter_name: input.renterName,
    landlord_phone: input.landlordPhone,
    zip: input.zip,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    sqft: input.sqft,
  };
  for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
    if (patch[key] === undefined) delete patch[key];
  }
  const { data, error } = await ctx.db.from("moves").update(patch).eq("id", move.id).select("*").single();
  if (error) fail(error);
  return data;
}

export const AddItemInput = z.object({
  name: z.string().min(1).max(120),
  condition: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  askUsd: z.number().min(0).max(100_000).optional(),
  floorUsd: z.number().min(0).max(100_000).optional(),
});

export async function addItem(ctx: ToolContext, input: z.infer<typeof AddItemInput>) {
  assertInScope(input.name, input.description);
  const move = await currentMove(ctx);
  const cents = (usd?: number) => (usd === undefined ? null : Math.round(usd * 100));
  const { data, error } = await ctx.db
    .from("items")
    .insert({
      move_id: move.id,
      name: input.name,
      condition: input.condition ?? null,
      description: input.description ?? null,
      ask_cents: cents(input.askUsd),
      floor_cents: cents(input.floorUsd),
    })
    .select("*")
    .single();
  if (error) fail(error);
  return data;
}

export const SetDispositionInput = z.object({
  itemId: z.uuid(),
  disposition: z.enum(["keep", "sell", "donate"]),
});

// The renter's own decision. A model may propose; this call records a confirmation.
export async function setDisposition(ctx: ToolContext, input: z.infer<typeof SetDispositionInput>) {
  const { data, error } = await ctx.db
    .from("items")
    .update({ disposition: input.disposition, disposition_confirmed: true })
    .eq("id", input.itemId)
    .select("*")
    .maybeSingle();
  if (error) fail(error);
  if (!data) fail(null, 404);
  return data;
}

async function createAction<K extends ActionKind>(
  ctx: ToolContext,
  moveId: string,
  kind: K,
  title: string,
  payload: unknown,
) {
  const parsed = ActionPayloads[kind].parse(payload);
  const { data, error } = await ctx.db
    .from("actions")
    .insert({ move_id: moveId, kind, title, payload: parsed as never })
    .select("*")
    .single();
  if (error) fail(error);
  return data;
}

export const PrepareListingInput = z.object({
  itemId: z.uuid(),
  title: z.string().min(1).max(100).optional(),
  body: z.string().min(1).max(5000).optional(),
  priceUsd: z.number().min(0).max(100_000).optional(),
});

// Draft a Facebook Marketplace listing and its review card. Nothing is posted
// until the renter approves it and Muse performs it on their account.
export async function prepareFacebookListing(ctx: ToolContext, input: z.infer<typeof PrepareListingInput>) {
  const { data: item, error } = await ctx.db.from("items").select("*").eq("id", input.itemId).maybeSingle();
  if (error) fail(error);
  if (!item) fail(null, 404);
  if (!item.disposition_confirmed || (item.disposition !== "sell" && item.disposition !== "donate")) {
    throw new MarketplaceError("Confirm this item for sale or donation first; kept items are never listed");
  }
  const { data: move } = await ctx.db.from("moves").select("*").eq("id", item.move_id).single();
  const draft = draftListing(
    {
      name: item.name,
      condition: item.condition,
      description: item.description,
      askCents: item.ask_cents,
      disposition: item.disposition,
    },
    move?.area_label ?? null,
  );
  const title = input.title ?? draft.title;
  const body = input.body ?? draft.body;
  assertInScope(title, body);
  if (disclosesAddress(`${title}\n${body}`, move?.address_private ?? null)) {
    throw new MarketplaceError("Listings must not include your exact address; use the general area");
  }
  const priceCents = input.priceUsd === undefined ? draft.priceCents : Math.round(input.priceUsd * 100);
  const listing = await ctx.db
    .from("listings")
    .insert({
      item_id: item.id,
      channel: "facebook_marketplace",
      mode: "delegated",
      delegate: "muse",
      title,
      body,
      price_cents: priceCents,
      area_label: move?.area_label ?? null,
    })
    .select("*")
    .single();
  if (listing.error) fail(listing.error);
  const action = await createAction(ctx, item.move_id, "listing.publish", `Post "${title}" on Facebook Marketplace`, {
    listingId: listing.data.id,
    channel: "facebook_marketplace",
    title,
    body,
    priceCents,
    areaLabel: listing.data.area_label,
  });
  return { listing: listing.data, action };
}

export const DraftReplyInput = z.object({
  conversationId: z.uuid(),
  body: z.string().min(1).max(2000),
});

export async function draftBuyerReply(ctx: ToolContext, input: z.infer<typeof DraftReplyInput>) {
  assertInScope(input.body);
  const conv = await conversationWithMove(ctx, input.conversationId);
  return createAction(ctx, conv.moveId, "buyer.reply", `Reply to ${conv.buyer_label}`, {
    conversationId: conv.id,
    buyerLabel: conv.buyer_label,
    body: input.body,
    disclosesExactAddress: disclosesAddress(input.body, conv.addressPrivate),
  });
}

export const ProposePickupInput = z.object({
  conversationId: z.uuid(),
  priceUsd: z.number().min(0).max(100_000),
  pickupStart: z.iso.datetime({ offset: true }),
  pickupEnd: z.iso.datetime({ offset: true }),
  message: z.string().min(1).max(2000),
});

export async function proposePickup(ctx: ToolContext, input: z.infer<typeof ProposePickupInput>) {
  assertInScope(input.message);
  const conv = await conversationWithMove(ctx, input.conversationId);
  return createAction(ctx, conv.moveId, "pickup.confirm", `Confirm pickup with ${conv.buyer_label}`, {
    conversationId: conv.id,
    itemId: conv.itemId,
    buyerLabel: conv.buyer_label,
    priceCents: Math.round(input.priceUsd * 100),
    pickupStart: input.pickupStart,
    pickupEnd: input.pickupEnd,
    message: input.message,
    disclosesExactAddress: disclosesAddress(input.message, conv.addressPrivate),
  });
}

async function conversationWithMove(ctx: ToolContext, conversationId: string) {
  const { data, error } = await ctx.db
    .from("conversations")
    .select("id, buyer_label, listings!inner(item_id, items!inner(move_id, moves!inner(address_private)))")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) fail(error);
  if (!data) fail(null, 404);
  const listing = data.listings as unknown as {
    item_id: string;
    items: { move_id: string; moves: { address_private: string | null } };
  };
  return {
    id: data.id,
    buyer_label: data.buyer_label,
    itemId: listing.item_id,
    moveId: listing.items.move_id,
    addressPrivate: listing.items.moves.address_private,
  };
}

export const ApproveInput = z.object({ actionId: z.uuid(), payloadHash: z.string().regex(/^[0-9a-f]{64}$/) });

// Approves exactly the payload version identified by its hash. Any later edit
// voids the approval in the database.
export async function approveAction(ctx: ToolContext, input: z.infer<typeof ApproveInput>) {
  const { data: action } = await ctx.db.from("actions").select("payload").eq("id", input.actionId).maybeSingle();
  if (!action) fail(null, 404);
  assertInScope(JSON.stringify(action.payload));
  const { data, error } = await ctx.db.rpc("approve_action", {
    p_action_id: input.actionId,
    p_payload_hash: input.payloadHash,
  });
  if (error) fail(error, 409);
  return data;
}

export async function cancelAction(ctx: ToolContext, actionId: string) {
  const { data, error } = await ctx.db.rpc("cancel_action", { p_action_id: actionId });
  if (error) fail(error, 409);
  return data;
}

export async function marketplaceState(ctx: ToolContext) {
  const move = await currentMove(ctx);
  const [items, listings, actions, conversations, messages, reservations, tokens] = await Promise.all([
    ctx.db.from("items").select("*").eq("move_id", move.id).order("created_at"),
    ctx.db.from("listings").select("*").order("created_at"),
    ctx.db.from("actions").select("*").eq("move_id", move.id).order("created_at", { ascending: false }),
    ctx.db.from("conversations").select("*").order("created_at"),
    ctx.db.from("messages").select("*").order("created_at"),
    ctx.db.from("reservations").select("*").order("created_at"),
    ctx.db.from("connector_tokens").select("id, label, token_hint, created_at, last_used_at, revoked_at"),
  ]);
  return {
    move,
    items: items.data ?? [],
    listings: listings.data ?? [],
    actions: actions.data ?? [],
    conversations: conversations.data ?? [],
    messages: messages.data ?? [],
    reservations: reservations.data ?? [],
    connectorTokens: tokens.data ?? [],
  };
}

export const RelayResultInput = z.object({
  actionId: z.uuid(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(["succeeded", "failed", "unknown"]),
  externalUrl: z.url().max(500).optional(),
  note: z.string().max(1000).optional(),
});

// Manual relay: the renter handed the approved package to their Muse
// themselves (no network path between Muse and this app) and reports what Muse
// did. Same exactly-once claim and payload-hash checks as the connector path;
// the owner is the signed-in renter, never a supplied id.
export async function recordRelayedResult(ctx: ToolContext, input: z.infer<typeof RelayResultInput>) {
  const { claimTask, reportResult } = await import("./muse/bridge");
  const owner = { ownerId: ctx.user.id };
  const { data: action } = await ctx.db.from("actions").select("status").eq("id", input.actionId).maybeSingle();
  if (!action) fail(null, 404);
  if (action.status === "approved") {
    const claimed = await claimTask(owner, { taskId: input.actionId, payloadHash: input.payloadHash });
    if (!claimed.claimed) throw new MarketplaceError(claimed.reason, 409);
  } else if (action.status !== "executing" && action.status !== "unknown") {
    throw new MarketplaceError(`This action is ${action.status} and cannot take a new result`, 409);
  }
  return reportResult(owner, {
    taskId: input.actionId,
    payloadHash: input.payloadHash,
    status: input.status,
    externalUrl: input.externalUrl,
    externalRef: "relayed-by-renter",
    note: input.note,
  });
}
