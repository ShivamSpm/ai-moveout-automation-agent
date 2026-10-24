import "server-only";
import { z } from "zod";
import type { ToolContext } from "../auth";
import type { Db } from "../supabase";
import { ListingPublishPayload, BuyerReplyPayload, PickupConfirmPayload } from "@/contracts";
import { assertInScope } from "../domain/scope";
import { disclosesAddress } from "../domain/drafts";
import { itemPhotoRefs } from "../item-photos";
import { MarketplaceError, ApproveInput, ProposePickupInput } from "../marketplace";
import { readTelegramConfig, sendPhoto, sendMessage, startLink, postRef, postUrl } from "../integrations/telegram";
import { pickupCutoff, usd } from "./policy";
import { getTask, listTasks } from "../muse/bridge";
import { appLink } from "../links";

const Delivery = z.object({
  reviewEachAction: z.literal(true), chatId: z.string().min(1), botUsername: z.string().min(1),
  text: z.string().min(1).max(4096),
});
const Listing = ListingPublishPayload.extend({ telegram: Delivery, photos: z.array(z.object({ documentId: z.uuid(), sha256: z.string() })).length(1) });
const Reply = BuyerReplyPayload.extend({ telegram: Delivery });
const Pickup = PickupConfirmPayload.extend({ telegram: Delivery });
export const PreparePickupInput = ProposePickupInput;
export const PrepareTelegramInput = z.object({ itemId: z.uuid(), photoDocumentId: z.uuid(), title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(700) });
export const PrepareReplyInput = z.object({ conversationId: z.uuid(), body: z.string().trim().min(1).max(2000) });
export const HandoffInput = ApproveInput;
export const BatchHandoffInput = z.object({ actions: z.array(HandoffInput).min(1).max(20).refine(actions => new Set(actions.map(a => a.actionId)).size === actions.length, "Duplicate action IDs are not allowed") });

async function ownMove(ctx: ToolContext, moveId: string) {
  const { data, error } = await ctx.db.from("moves").select("*").eq("id", moveId).eq("owner_id", ctx.user.id).maybeSingle();
  if (error) throw new MarketplaceError(error.message, 500);
  if (!data) throw new MarketplaceError("Move not found", 404);
  return data;
}
async function target(ctx: ToolContext) {
  const config = readTelegramConfig();
  const { data, error } = await ctx.db.from("telegram_targets").select("chat_id, chat_title").eq("owner_id", ctx.user.id).maybeSingle();
  if (error) throw new MarketplaceError(error.message, 500);
  return { chatId: data?.chat_id ?? config.channelId, botUsername: config.botUsername, title: data?.chat_title ?? "Default sale channel" };
}

/** Also used by the webhook/cron to keep Claude-managed listings review-only. Fail closed. */
export async function requiresTelegramReview(db: Db, listingId: string) {
  const { data, error } = await db.from("actions").select("id")
    .eq("kind", "listing.publish").eq("payload->>listingId", listingId)
    .eq("payload->telegram->>reviewEachAction", "true").limit(1);
  if (error) throw new MarketplaceError(error.message, 500);
  return Boolean(data?.length);
}

export async function prepareTelegramListing(ctx: ToolContext, raw: z.infer<typeof PrepareTelegramInput>) {
  const input = PrepareTelegramInput.parse(raw);
  assertInScope(input.title, input.body);
  const { data: item, error } = await ctx.db.from("items").select("*").eq("id", input.itemId).eq("owner_id", ctx.user.id).maybeSingle();
  if (error) throw new MarketplaceError(error.message, 500);
  if (!item) throw new MarketplaceError("Item not found", 404);
  if (!item.disposition_confirmed || !["sell", "donate"].includes(item.disposition) || !["inventory", "listed"].includes(item.status)) throw new MarketplaceError("Confirm sell/donate on an available item first");
  const move = await ownMove(ctx, item.move_id);
  if (!move.move_out_date) throw new MarketplaceError("Set a move-out date first");
  const cutoff = pickupCutoff(move.move_out_date, move.timezone);
  if (cutoff.getTime() <= Date.now()) throw new MarketplaceError("The pickup cutoff has passed");
  if (disclosesAddress(`${input.title}\n${input.body}\n${move.area_label ?? ""}`, move.address_private)) throw new MarketplaceError("A public listing must not include the exact address");
  if (item.disposition === "sell" && item.ask_cents === null) throw new MarketplaceError("Confirm an asking price first");
  const price = item.disposition === "donate" ? 0 : item.ask_cents!;
  const photos = await itemPhotoRefs(ctx, item.id, [input.photoDocumentId]);
  const destination = await target(ctx);
  const text = `${input.title} · ${usd(price)}\n\n${input.body}\n\nPickup${move.area_label ? ` near ${move.area_label}` : ""}, by ${cutoff.toLocaleDateString("en-US", { timeZone: move.timezone, month: "short", day: "numeric", year: "numeric" })}. Pay in person at pickup.`;
  if (text.length > 1024) throw new MarketplaceError("Shorten the listing to fit the Telegram photo caption");
  const created = await ctx.db.from("listings").insert({ item_id: item.id, channel: "telegram", mode: "live", title: input.title, body: input.body, price_cents: price, area_label: move.area_label }).select("*").single();
  if (created.error) throw new MarketplaceError(created.error.message, 500);
  const payload = Listing.parse({ listingId: created.data.id, channel: "telegram", title: input.title, body: input.body, priceCents: price, areaLabel: move.area_label, photos, telegram: { reviewEachAction: true, ...destination, text } });
  const saved = await ctx.db.from("actions").insert({ move_id: move.id, kind: "listing.publish", title: `Post ${input.title} to ${destination.title}`, payload }).select("*").single();
  if (saved.error) throw new MarketplaceError(saved.error.message, 500);
  return { listing: created.data, action: saved.data, destination, review: { text, photos, account: destination.botUsername, chatId: destination.chatId, automaticReplies: false, automaticPriceDrops: false }, posted: false };
}

export async function prepareTelegramReply(ctx: ToolContext, raw: z.infer<typeof PrepareReplyInput>) {
  const input = PrepareReplyInput.parse(raw);
  assertInScope(input.body);
  const { data: conv, error } = await ctx.db.from("conversations").select("*").eq("id", input.conversationId).eq("source", "telegram").eq("owner_id", ctx.user.id).maybeSingle();
  if (error) throw new MarketplaceError(error.message, 500);
  if (!conv?.external_thread_ref) throw new MarketplaceError("Telegram conversation not found", 404);
  if (!await requiresTelegramReview(ctx.db, conv.listing_id)) throw new MarketplaceError("Use the existing Telegram workflow for this legacy conversation");
  const { data: listing } = await ctx.db.from("listings").select("item_id").eq("id", conv.listing_id).single();
  const { data: item } = await ctx.db.from("items").select("move_id").eq("id", listing!.item_id).single();
  const move = await ownMove(ctx, item!.move_id);
  const payload = Reply.parse({ conversationId: conv.id, buyerLabel: conv.buyer_label, body: input.body, disclosesExactAddress: disclosesAddress(input.body, move.address_private), telegram: { reviewEachAction: true, chatId: conv.external_thread_ref, botUsername: readTelegramConfig().botUsername, text: input.body } });
  const saved = await ctx.db.from("actions").insert({ move_id: move.id, kind: "buyer.reply", title: `Reply to ${conv.buyer_label} on Telegram`, payload }).select("*").single();
  if (saved.error) throw new MarketplaceError(saved.error.message, 500);
  return { action: saved.data, sent: false };
}

export async function prepareTelegramPickup(ctx: ToolContext, raw: z.infer<typeof PreparePickupInput>) {
  const input = PreparePickupInput.parse(raw);
  assertInScope(input.message);
  const { data: conv } = await ctx.db.from("conversations").select("*").eq("id", input.conversationId).eq("owner_id", ctx.user.id).eq("source", "telegram").maybeSingle();
  if (!conv?.external_thread_ref) throw new MarketplaceError("Telegram conversation not found", 404);
  if (!await requiresTelegramReview(ctx.db, conv.listing_id)) throw new MarketplaceError("Use the existing Telegram workflow for this legacy conversation");
  const { data: listing } = await ctx.db.from("listings").select("item_id").eq("id", conv.listing_id).single();
  const { data: item } = await ctx.db.from("items").select("*").eq("id", listing!.item_id).single();
  if (!item || !["inventory", "listed"].includes(item.status)) throw new MarketplaceError("Item unavailable", 409);
  const move = await ownMove(ctx, item.move_id);
  const price = Math.round(input.priceUsd * 100);
  if (price < (item.floor_cents ?? 0)) throw new MarketplaceError("Offer is below your saved minimum");
  if (!move.move_out_date || Date.parse(input.pickupStart) <= Date.now() || Date.parse(input.pickupEnd) <= Date.parse(input.pickupStart) || Date.parse(input.pickupEnd) > pickupCutoff(move.move_out_date, move.timezone).getTime()) throw new MarketplaceError("Choose a future pickup window before your move-out cutoff");
  const payload = Pickup.parse({ conversationId: conv.id, buyerLabel: conv.buyer_label, itemId: item.id, priceCents: price, pickupStart: input.pickupStart, pickupEnd: input.pickupEnd, message: input.message, disclosesExactAddress: disclosesAddress(input.message, move.address_private), telegram: { reviewEachAction: true, chatId: conv.external_thread_ref, botUsername: readTelegramConfig().botUsername, text: input.message } });
  const saved = await ctx.db.from("actions").insert({ move_id: move.id, kind: "pickup.confirm", title: `Confirm pickup with ${conv.buyer_label}`, payload }).select("*").single();
  if (saved.error) throw new MarketplaceError(saved.error.message, 500);
  return { action: saved.data, sent: false, reserved: false };
}

/** Execution requires a separately approved exact snapshot; retries never resend. */
export async function executeTelegramAction(ctx: ToolContext, raw: z.infer<typeof ApproveInput>) {
  const input = ApproveInput.parse(raw);
  const { data: action, error } = await ctx.db.from("actions").select("*").eq("id", input.actionId).eq("owner_id", ctx.user.id).maybeSingle();
  if (error) throw new MarketplaceError(error.message, 500);
  if (!action) throw new MarketplaceError("Action not found", 404);
  if (action.payload_hash !== input.payloadHash || action.approved_hash !== input.payloadHash) throw new MarketplaceError("Review and approve this exact action version first", 409);
  if (["succeeded", "executing", "unknown"].includes(action.status)) return { status: action.status, sentAgain: false, providerRef: action.provider_ref, url: action.provider_url };
  if (action.status !== "approved") throw new MarketplaceError(`Cannot execute an action that is ${action.status}`, 409);
  assertInScope(JSON.stringify(action.payload));
  const config = readTelegramConfig();
  const listingPayload = action.kind === "listing.publish" ? Listing.parse(action.payload) : null;
  const replyPayload = action.kind === "buyer.reply" ? Reply.parse(action.payload) : null;
  const pickupPayload = action.kind === "pickup.confirm" ? Pickup.parse(action.payload) : null;
  const payload = listingPayload ?? replyPayload ?? pickupPayload;
  if (!payload) throw new MarketplaceError("This tool supports reviewed Telegram listings, replies and pickups only");
  if (payload.telegram.botUsername !== config.botUsername) throw new MarketplaceError("The sending account changed; prepare a new review", 409);
  let photoUrl: string | undefined;
  let itemId: string | undefined;
  if (listingPayload) {
    if (listingPayload.channel !== "telegram") throw new MarketplaceError("Not a Telegram listing");
    if ((await target(ctx)).chatId !== payload.telegram.chatId) throw new MarketplaceError("The destination changed; prepare a new review", 409);
    const { data: listing } = await ctx.db.from("listings").select("*").eq("id", listingPayload.listingId).eq("channel", "telegram").single();
    if (!listing) throw new MarketplaceError("Listing not found", 404);
    itemId = listing.item_id;
    const { data: item } = await ctx.db.from("items").select("status").eq("id", itemId).single();
    if (!item || !["inventory", "listed"].includes(item.status)) throw new MarketplaceError("Item is no longer available", 409);
    const move = await ownMove(ctx, action.move_id);
    if (!move.move_out_date || pickupCutoff(move.move_out_date, move.timezone).getTime() <= Date.now()) throw new MarketplaceError("The pickup cutoff has passed");
    const refs = await itemPhotoRefs(ctx, itemId, listingPayload.photos.map(p => p.documentId));
    if (JSON.stringify(refs) !== JSON.stringify(listingPayload.photos)) throw new MarketplaceError("The reviewed photo changed", 409);
    const { data: doc } = await ctx.db.from("documents").select("storage_path").eq("id", refs[0].documentId).eq("sha256", refs[0].sha256).single();
    if (!doc) throw new MarketplaceError("Photo not found", 404);
    const signed = await ctx.db.storage.from("move-files").createSignedUrl(doc.storage_path, 600);
    if (signed.error || !signed.data?.signedUrl) throw new MarketplaceError("Could not read the reviewed photo");
    photoUrl = signed.data.signedUrl;
  } else if (replyPayload || pickupPayload) {
    const messagePayload = replyPayload ?? pickupPayload!;
    const { data: conv } = await ctx.db.from("conversations").select("external_thread_ref").eq("id", messagePayload.conversationId).eq("source", "telegram").single();
    if (!conv || conv.external_thread_ref !== payload.telegram.chatId) throw new MarketplaceError("The recipient changed; prepare a new reply", 409);
  }
  if (pickupPayload) {
    const move = await ownMove(ctx, action.move_id);
    if (!move.move_out_date || Date.parse(pickupPayload.pickupStart) <= Date.now() || Date.parse(pickupPayload.pickupEnd) > pickupCutoff(move.move_out_date, move.timezone).getTime()) throw new MarketplaceError("Pickup window is no longer valid", 409);
    const { data: item } = await ctx.db.from("items").select("status, floor_cents").eq("id", pickupPayload.itemId).single();
    if (!item || !["inventory", "listed"].includes(item.status) || pickupPayload.priceCents < (item.floor_cents ?? 0)) throw new MarketplaceError("Item availability or minimum price changed", 409);
  }
  const claimed = await ctx.db.rpc("claim_action", { p_action_id: action.id });
  if (claimed.error) throw new MarketplaceError(claimed.error.message, 409);
  if (!claimed.data?.id) return { status: "already_claimed", sentAgain: false };
  // Concurrent edits can invalidate the snapshot between read and claim.
  if (claimed.data.payload_hash !== input.payloadHash) {
    await ctx.db.rpc("record_action_result", { p_action_id: action.id, p_status: "failed", p_mode: "live", p_error: "Payload changed before execution" });
    throw new MarketplaceError("Payload changed before execution", 409);
  }
  let reservationId: string | undefined;
  if (pickupPayload) {
    const held = await ctx.db.from("reservations").insert({ item_id: pickupPayload.itemId, conversation_id: pickupPayload.conversationId, price_cents: pickupPayload.priceCents, pickup_start: pickupPayload.pickupStart, pickup_end: pickupPayload.pickupEnd }).select("id").single();
    if (held.error) {
      await ctx.db.rpc("record_action_result", { p_action_id: action.id, p_status: "failed", p_mode: "live", p_error: "Could not reserve item; nothing sent" });
      throw new MarketplaceError("Could not reserve item; it may already be held", 409);
    }
    reservationId = held.data.id;
  }
  try {
    const sent = listingPayload
      ? await sendPhoto(config, payload.telegram.chatId, photoUrl!, payload.telegram.text, { inline_keyboard: [[{ text: "Message seller", url: startLink(config, listingPayload.listingId) }]] })
      : await sendMessage(config, payload.telegram.chatId, payload.telegram.text);
    const ref = postRef(String(sent.chat.id), sent.message_id);
    const url = listingPayload ? postUrl({ chatId: String(sent.chat.id), username: sent.chat.username }, sent.message_id) : null;
    const recorded = await ctx.db.rpc("record_action_result", { p_action_id: action.id, p_status: "succeeded", p_mode: "live", p_provider_ref: ref, p_provider_url: url ?? undefined });
    if (recorded.error) throw new Error("Provider responded but recording the result failed; reconcile before retrying");
    if (listingPayload) {
      const saved = await ctx.db.from("listings").update({ status: "published", external_ref: ref, external_url: url, published_at: new Date().toISOString() }).eq("id", listingPayload.listingId);
      if (saved.error) return { status: "succeeded", providerRef: ref, url, reconciliationNeeded: true };
      await ctx.db.from("items").update({ status: "listed" }).eq("id", itemId!).eq("status", "inventory");
    } else if (replyPayload || pickupPayload) {
      const messagePayload = replyPayload ?? pickupPayload!;
      const saved = await ctx.db.from("messages").insert({ conversation_id: messagePayload.conversationId, direction: "outbound", body: payload.telegram.text, source: "app_reply", action_id: action.id });
      if (saved.error) return { status: "succeeded", providerRef: ref, reconciliationNeeded: true };
    }
    if (pickupPayload) {
      const results = await Promise.all([
        ctx.db.from("reservations").update({ status: "confirmed" }).eq("id", reservationId!),
        ctx.db.from("items").update({ status: "reserved" }).eq("id", pickupPayload.itemId),
        ctx.db.from("conversations").update({ deal_status: "confirmed" }).eq("id", pickupPayload.conversationId),
      ]);
      if (results.some(r => r.error)) return { status: "succeeded", providerRef: ref, reconciliationNeeded: true };
    }
    return { status: "succeeded", providerRef: ref, url };
  } catch {
    // Any failure after entering the provider call is conservatively unknown,
    // including malformed success responses and failed local persistence.
    await ctx.db.rpc("record_action_result", { p_action_id: action.id, p_status: "unknown", p_mode: "live", p_error: "Telegram outcome needs reconciliation before any retry" });
    return { status: "unknown", sentAgain: false, reconciliationNeeded: true };
  }
}

export async function museHandoff(ctx: ToolContext, raw: z.infer<typeof HandoffInput>) {
  const input = HandoffInput.parse(raw);
  const task = await getTask({ ownerId: ctx.user.id }, input.actionId);
  if (task.payloadHash !== input.payloadHash) throw new MarketplaceError("The approved version changed", 409);
  return handoffForTask(task);
}

function handoffForTask(task: Awaited<ReturnType<typeof getTask>>) {
  const ready = task.state === "ready" && !("missingPhotos" in task && task.missingPhotos);
  return { status: ready ? "ready_for_browser_handoff" : task.state, canStart: Boolean(ready), taskId: task.taskId, payloadHash: task.payloadHash,
    museUrl: "https://muse.ai", reviewUrl: appLink(`/muse#action-${task.taskId}`),
    prompt: ready ? `Check Vacate for approved task ${task.taskId} only, version ${task.payloadHash}. Use the exact approved payload and photos from the connector. Follow your own approval prompt. Report the outcome to Vacate; do not act on other tasks or retry an unknown outcome.` : null,
    automaticApiInvocation: false, userApprovalInMuseRequired: true };
}


export async function museBatchHandoff(ctx: ToolContext, raw: z.infer<typeof BatchHandoffInput>) {
  const input = BatchHandoffInput.parse(raw);
  const queue = await listTasks({ ownerId: ctx.user.id });
  // Validate the whole batch before returning any prompts. Never expand its scope.
  const tasks = input.actions.map(action => {
    const task = queue.find(t => t.taskId === action.actionId);
    if (!task) throw new MarketplaceError("No approved task with that id for this renter", 404);
    if (task.payloadHash !== action.payloadHash) throw new MarketplaceError("The approved version changed", 409);
    return handoffForTask(task);
  });
  return { tasks, readyCount: tasks.filter(t => t.canStart).length,
    blockedCount: tasks.filter(t => !t.canStart).length,
    automaticApiInvocation: false, userApprovalInMuseRequired: true,
    instructions: "Submit ready tasks individually in the matching Muse conversation. Do not submit claimed or unknown tasks. Refresh activity between tasks; preserve each task ID and version. Muse must claim and report each task independently." };
}
