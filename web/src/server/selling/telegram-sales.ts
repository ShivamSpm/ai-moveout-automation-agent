import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { ActionPayloads, type ActionPayload } from "@/contracts";
import type { ToolContext } from "@/server/auth";
import { disclosesAddress } from "@/server/domain/drafts";
import { assertInScope } from "@/server/domain/scope";
import { isConfigured as openRouterConfigured } from "@/server/integrations/openrouter";
import {
  channelPostUrl,
  editCaption,
  readTelegramConfig,
  sendMessage,
  sendPhoto,
  startLink,
  telegramConfigured,
  TelegramError,
  toBuyerEvent,
  type TelegramConfig,
  type TelegramUpdate,
} from "@/server/integrations/telegram";
import { approveAction, currentMove, MarketplaceError } from "@/server/marketplace";
import { slidingWindow } from "@/server/rate-limit";
import { serviceClient } from "@/server/supabase";
import { photoProblem } from "@/server/tools/identify-items";
import { proposeTurn } from "./negotiator";
import { checkTurn, pickupCutoff, scheduledPrice, usd } from "./policy";

// Telegram selling lane. The renter approves each listing and each final deal
// in the web app; the agent handles buyer chats in between, within the
// renter's minimum price and the day-before-move-out pickup cutoff.

const PICKUP_MINUTES = 30;
const perChat = slidingWindow(15, 10 * 60_000);

const local = (date: Date, timeZone: string) =>
  date.toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function caption(listing: { title: string; body: string; price_cents: number; area_label: string | null }, cutoff: Date, timeZone: string, sold = false) {
  const lines = [
    sold ? `SOLD: ${listing.title}` : `${listing.title} · ${usd(listing.price_cents)}`,
    "",
    listing.body,
    "",
    `Pickup${listing.area_label ? ` near ${listing.area_label}` : ""}, by ${cutoff.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" })}. Pay in person at pickup.`,
  ];
  return lines.join("\n").slice(0, 1024);
}

const button = (config: TelegramConfig, listingId: string) => ({
  inline_keyboard: [[{ text: "Message seller", url: startLink(config, listingId) }]],
});

// ---------------------------------------------------------------- add an item

export const SaleItemInput = z
  .object({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(1000),
    askUsd: z.number().positive().max(100_000),
    floorUsd: z.number().min(0).max(100_000),
  })
  .refine((v) => v.floorUsd <= v.askUsd, { message: "The minimum can't be higher than the asking price" });

/** Stores the photo and item, drafts the Telegram listing and its review card. Nothing is posted. */
export async function createSaleItem(ctx: ToolContext, photo: { bytes: Uint8Array; mimeType: string; name: string }, input: z.infer<typeof SaleItemInput>) {
  input = SaleItemInput.parse(input);
  assertInScope(input.title, input.description);
  const problem = photoProblem(photo.bytes, photo.mimeType);
  if (problem) throw new MarketplaceError(problem);
  const move = await currentMove(ctx);
  if (!move.move_out_date) throw new MarketplaceError("Set your move-out date on /start first; pickups end the day before it");
  if (disclosesAddress(`${input.title}\n${input.description}`, move.address_private)) {
    throw new MarketplaceError("Listings must not include your exact address");
  }

  const path = `${ctx.user.id}/${move.id}/${randomUUID()}`;
  const upload = await ctx.db.storage.from("move-files").upload(path, photo.bytes, { contentType: photo.mimeType });
  if (upload.error) throw new MarketplaceError(`Photo upload failed: ${upload.error.message}`, 500);
  const doc = await ctx.db
    .from("documents")
    .insert({
      move_id: move.id,
      kind: "photo",
      storage_path: path,
      original_name: photo.name.slice(0, 200),
      mime_type: photo.mimeType,
      byte_size: photo.bytes.byteLength,
      sha256: createHash("sha256").update(photo.bytes).digest("hex"),
    })
    .select("id")
    .single();
  if (doc.error) throw new MarketplaceError(doc.error.message, 500);

  const cents = (n: number) => Math.round(n * 100);
  const item = await ctx.db
    .from("items")
    .insert({
      move_id: move.id,
      name: input.title,
      description: input.description,
      ask_cents: cents(input.askUsd),
      floor_cents: cents(input.floorUsd),
      disposition: "sell",
      disposition_confirmed: true,
    })
    .select("*")
    .single();
  if (item.error) throw new MarketplaceError(item.error.message);
  const link = await ctx.db.from("item_photos").insert({ item_id: item.data.id, document_id: doc.data.id });
  if (link.error) throw new MarketplaceError(link.error.message, 500);

  const listing = await ctx.db
    .from("listings")
    .insert({
      item_id: item.data.id,
      channel: "telegram",
      mode: "live",
      title: input.title,
      body: input.description,
      price_cents: cents(input.askUsd),
      area_label: move.area_label,
    })
    .select("*")
    .single();
  if (listing.error) throw new MarketplaceError(listing.error.message);
  const payload: ActionPayload<"listing.publish"> = ActionPayloads["listing.publish"].parse({
    listingId: listing.data.id,
    channel: "telegram",
    title: input.title,
    body: input.description,
    priceCents: cents(input.askUsd),
    areaLabel: move.area_label,
  });
  const action = await ctx.db
    .from("actions")
    .insert({ move_id: move.id, kind: "listing.publish", title: `Post "${input.title}" to the Telegram sale channel`, payload })
    .select("*")
    .single();
  if (action.error) throw new MarketplaceError(action.error.message);
  return { item: item.data, listing: listing.data, action: action.data };
}

// ---------------------------------------------------------------- publish

/** Approves the exact listing version the renter saw and posts it to the channel. */
export async function publishListing(ctx: ToolContext, input: { actionId: string; payloadHash: string }) {
  const config = readTelegramConfig();
  await approveAction(ctx, input);
  const claimed = await ctx.db.rpc("claim_action", { p_action_id: input.actionId });
  if (claimed.error || !claimed.data?.id) throw new MarketplaceError("This listing is already being posted", 409);
  const payload = ActionPayloads["listing.publish"].parse(claimed.data.payload);

  const { data: listing } = await ctx.db.from("listings").select("*").eq("id", payload.listingId).single();
  const { data: photo } = await ctx.db
    .from("item_photos")
    .select("documents!inner(storage_path)")
    .eq("item_id", listing!.item_id)
    .limit(1)
    .maybeSingle();
  const move = await currentMove(ctx);
  const cutoff = pickupCutoff(move.move_out_date!, move.timezone);
  const storagePath = (photo?.documents as unknown as { storage_path: string } | undefined)?.storage_path;
  const signed = storagePath ? await ctx.db.storage.from("move-files").createSignedUrl(storagePath, 600) : null;

  const record = (status: "succeeded" | "failed" | "unknown", ref?: string, url?: string | null, error?: string) =>
    ctx.db.rpc("record_action_result", {
      p_action_id: input.actionId,
      p_status: status,
      p_mode: "live",
      p_provider_ref: ref,
      p_provider_url: url ?? undefined,
      p_error: error,
    });

  if (!signed?.data?.signedUrl) {
    await record("failed", undefined, null, "The item photo could not be read");
    await ctx.db.from("listings").update({ status: "failed" }).eq("id", payload.listingId);
    throw new MarketplaceError("The item photo could not be read", 500);
  }
  try {
    const sent = await sendPhoto(config, config.channelId, signed.data.signedUrl, caption(listing!, cutoff, move.timezone), button(config, listing!.id));
    const url = channelPostUrl(config, sent.message_id);
    await record("succeeded", String(sent.message_id), url);
    await ctx.db
      .from("listings")
      .update({ status: "published", external_ref: String(sent.message_id), external_url: url, published_at: new Date().toISOString() })
      .eq("id", listing!.id);
    await ctx.db.from("items").update({ status: "listed" }).eq("id", listing!.item_id).eq("status", "inventory");
    return { posted: true, url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A transport failure may still have posted; "unknown" keeps it from being retried blindly.
    const unknown = error instanceof TelegramError && error.message.includes("did not complete");
    await record(unknown ? "unknown" : "failed", undefined, null, message);
    if (!unknown) await ctx.db.from("listings").update({ status: "failed" }).eq("id", listing!.id);
    throw new MarketplaceError(message, 502);
  }
}

// ---------------------------------------------------------------- buyer chats

type Service = ReturnType<typeof serviceClient>;

async function saveOutbound(db: Service, conv: { id: string; owner_id: string }, body: string, source: "agent" | "app_reply", actionId?: string) {
  await db.from("messages").insert({ conversation_id: conv.id, owner_id: conv.owner_id, direction: "outbound", body, source, action_id: actionId ?? null });
}

async function reply(db: Service, config: TelegramConfig, chatId: string, conv: { id: string; owner_id: string } | null, text: string) {
  await sendMessage(config, chatId, text);
  if (conv) await saveOutbound(db, conv, text, "agent");
}

async function listingContext(db: Service, listingId: string) {
  const { data } = await db
    .from("listings")
    .select("*, items!inner(*, moves!inner(*))")
    .eq("id", listingId)
    .eq("channel", "telegram")
    .maybeSingle();
  if (!data) return null;
  const { items, ...listing } = data as typeof data & {
    items: { id: string; name: string; description: string | null; condition: string | null; ask_cents: number | null; floor_cents: number | null; status: string; moves: { id: string; move_out_date: string | null; timezone: string; address_private: string | null; area_label: string | null } };
  };
  const { moves: move, ...item } = items;
  return { listing, item, move };
}

/** Handles one Telegram update. Safe to call twice with the same update: the second is a no-op. */
export async function handleTelegramUpdate(update: TelegramUpdate, now = new Date()) {
  const config = readTelegramConfig();
  const db = serviceClient();
  const fresh = await db.from("telegram_updates").upsert({ update_id: update.update_id }, { onConflict: "update_id", ignoreDuplicates: true }).select();
  if (fresh.error) throw new Error(fresh.error.message);
  if (!fresh.data?.length) return { handled: "duplicate" };

  const event = toBuyerEvent(update);
  if (event.kind === "ignored") return { handled: "ignored" };
  if (event.kind === "unsupported") {
    await sendMessage(config, event.chatId, "Sorry, I can only read text messages.");
    return { handled: "unsupported" };
  }
  const hint = "Hi! Tap \"Message seller\" under an item in the sale channel to ask about it.";

  if (event.kind === "start") {
    const found = event.listingId ? await listingContext(db, event.listingId) : null;
    if (!found || found.listing.status !== "published") {
      await sendMessage(config, event.chatId, found ? "Sorry, that item isn't available anymore." : hint);
      return { handled: "start_unknown" };
    }
    const { listing, item } = found;
    let conv = (
      await db.from("conversations").select("*").eq("listing_id", listing.id).eq("external_thread_ref", event.chatId).maybeSingle()
    ).data;
    if (!conv) {
      const created = await db
        .from("conversations")
        .insert({ listing_id: listing.id, owner_id: listing.owner_id, buyer_label: event.buyerLabel, source: "telegram", external_thread_ref: event.chatId })
        .select("*")
        .single();
      if (created.error) throw new Error(created.error.message);
      conv = created.data;
    } else {
      await db.from("conversations").update({ last_active_at: now.toISOString() }).eq("id", conv.id);
    }
    const text =
      item.status === "listed"
        ? `Hi! You're asking about the ${listing.title}, listed at ${usd(listing.price_cents)}. It's still available. Ask me anything or make an offer.`
        : "Sorry, this item has already been sold.";
    await reply(db, config, event.chatId, conv, text);
    return { handled: "start", conversationId: conv.id };
  }

  // A text message: it belongs to the listing this chat opened most recently.
  const { data: conv } = await db
    .from("conversations")
    .select("*")
    .eq("source", "telegram")
    .eq("external_thread_ref", event.chatId)
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conv) {
    await sendMessage(config, event.chatId, hint);
    return { handled: "no_conversation" };
  }
  await db.from("messages").insert({ conversation_id: conv.id, owner_id: conv.owner_id, direction: "inbound", body: event.text, source: "telegram" });

  const found = await listingContext(db, conv.listing_id);
  if (!found) return { handled: "listing_gone" };
  const { listing, item, move } = found;
  if (conv.deal_status === "confirmed") {
    await reply(db, config, event.chatId, conv, "You're all set for pickup. See the details above. See you then!");
    return { handled: "confirmed" };
  }
  if (item.status !== "listed" || conv.deal_status === "closed") {
    await reply(db, config, event.chatId, conv, "Sorry, this item has already been sold.");
    return { handled: "sold" };
  }
  if (conv.deal_status === "awaiting_seller") {
    await reply(db, config, event.chatId, conv, "I'm still confirming with the seller and will message you shortly.");
    return { handled: "awaiting_seller" };
  }
  if (!perChat.check(event.chatId).allowed) return { handled: "rate_limited" };
  if (!openRouterConfigured() || !move.move_out_date) {
    await reply(db, config, event.chatId, conv, "Thanks for your message! The seller will get back to you soon.");
    return { handled: "agent_unavailable" };
  }

  const cutoff = pickupCutoff(move.move_out_date, move.timezone);
  const ask = item.ask_cents ?? listing.price_cents;
  const floor = item.floor_cents ?? ask;
  const listed = scheduledPrice({ askCents: ask, floorCents: floor, publishedAt: new Date(listing.published_at ?? listing.created_at), cutoff, now });
  const [{ data: history }, { data: others }] = await Promise.all([
    db.from("messages").select("direction, body").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(30),
    db.from("conversations").select("id, deal_status, offer_cents").eq("listing_id", listing.id).neq("id", conv.id).neq("deal_status", "closed"),
  ]);
  const pending = (others ?? []).filter((o) => o.deal_status === "awaiting_seller");
  const pendingDealCents = pending.length ? Math.max(...pending.map((o) => o.offer_cents ?? 0)) : null;

  const proposed = await proposeTurn({
    item: { title: listing.title, description: listing.body, condition: item.condition },
    listedCents: listed,
    floorCents: floor,
    areaLabel: listing.area_label,
    timeZone: move.timezone,
    now,
    cutoff,
    buyerLabel: conv.buyer_label,
    transcript: (history ?? []).reverse().map((m) => ({ from: m.direction === "inbound" ? "buyer" : "you", text: m.body })),
    otherBuyers: (others ?? []).map((o) => ({ offerCents: o.offer_cents, status: o.deal_status === "awaiting_seller" ? "waiting for seller approval" : "negotiating" })),
    dealPendingElsewhere: pendingDealCents !== null,
  });
  if (!proposed.ok) {
    console.error("selling agent failed", proposed.message);
    await reply(db, config, event.chatId, conv, `Thanks! It's ${usd(listed)}. What would you like to offer, and when could you pick it up?`);
    return { handled: "agent_failed" };
  }
  const checked = checkTurn(
    proposed.turn,
    { floorCents: floor, listedCents: listed, cutoff, now, buyerText: event.text, addressPrivate: move.address_private, pendingDealCents },
    (text) => disclosesAddress(text, move.address_private),
  );
  if (!checked.ok) {
    console.warn("selling agent reply blocked:", checked.reason);
    await reply(db, config, event.chatId, conv, checked.fallback);
    return { handled: "blocked", reason: checked.reason };
  }

  if (proposed.turn.buyerOfferCents !== null) {
    await db.from("conversations").update({ offer_cents: proposed.turn.buyerOfferCents }).eq("id", conv.id);
  }
  if (checked.deal) {
    // A better offer replaces a lower one that is still waiting; that buyer hasn't been promised anything.
    for (const other of pending) await reopenConversation(db, other.id);
    const pickupStart = checked.deal.pickupStart;
    const payload = ActionPayloads["pickup.confirm"].parse({
      conversationId: conv.id,
      itemId: item.id,
      buyerLabel: conv.buyer_label,
      priceCents: checked.deal.priceCents,
      pickupStart: pickupStart.toISOString(),
      pickupEnd: new Date(pickupStart.getTime() + PICKUP_MINUTES * 60_000).toISOString(),
      message: "Sent when you approve, with the pickup address you enter.",
      disclosesExactAddress: false,
    });
    const created = await db
      .from("actions")
      .insert({
        move_id: move.id,
        owner_id: conv.owner_id,
        kind: "pickup.confirm",
        title: `Sell ${listing.title} to ${conv.buyer_label} for ${usd(checked.deal.priceCents)}, pickup ${local(pickupStart, move.timezone)}`,
        payload,
      })
      .select("id")
      .single();
    if (created.error) throw new Error(created.error.message);
    await db.from("conversations").update({ deal_status: "awaiting_seller", offer_cents: checked.deal.priceCents }).eq("id", conv.id);
  }
  await reply(db, config, event.chatId, conv, checked.reply);
  return { handled: checked.deal ? "deal_proposed" : "replied" };
}

/** Cancels a waiting deal that nobody was told about and puts the buyer back to negotiating. */
async function reopenConversation(db: Service, conversationId: string) {
  const { data: actions } = await db
    .from("actions")
    .select("id, owner_id")
    .eq("kind", "pickup.confirm")
    .eq("status", "pending_review")
    .eq("payload->>conversationId", conversationId);
  for (const a of actions ?? []) {
    await db.from("actions").update({ status: "cancelled" }).eq("id", a.id).eq("status", "pending_review");
    await db.from("action_events").insert({ action_id: a.id, owner_id: a.owner_id, event: "cancelled", detail: { by: "selling_agent", reason: "a higher offer replaced it" } });
  }
  await db.from("conversations").update({ deal_status: "negotiating" }).eq("id", conversationId);
}

// ---------------------------------------------------------------- deals

export const ConfirmDealInput = z.object({ actionId: z.uuid(), address: z.string().trim().min(5).max(200) });

/** The renter approves a deal: hold the item, send the buyer the confirmation and address, close the others. */
export async function confirmDeal(ctx: ToolContext, input: z.infer<typeof ConfirmDealInput>) {
  input = ConfirmDealInput.parse(input);
  const config = readTelegramConfig();
  const { data: action } = await ctx.db.from("actions").select("*").eq("id", input.actionId).eq("kind", "pickup.confirm").maybeSingle();
  if (!action) throw new MarketplaceError("Deal not found", 404);
  if (action.status !== "pending_review") throw new MarketplaceError(`This deal is ${action.status}`, 409);
  const deal = ActionPayloads["pickup.confirm"].parse(action.payload);
  const { data: conv } = await ctx.db.from("conversations").select("*").eq("id", deal.conversationId).single();
  const { data: listing } = await ctx.db.from("listings").select("*").eq("id", conv!.listing_id).single();
  const move = await currentMove(ctx);
  if (new Date(deal.pickupStart).getTime() < Date.now()) throw new MarketplaceError("This pickup time has already passed; decline it", 409);

  const message = `Good news: the seller confirmed! ${listing!.title} for ${usd(deal.priceCents)}. Pickup ${local(new Date(deal.pickupStart), move.timezone)} at ${input.address}. Please pay in person at pickup. See you then!`;
  // Editing the payload voids any earlier approval, so the renter approves exactly this message.
  const edited = await ctx.db
    .from("actions")
    .update({ payload: { ...deal, message, disclosesExactAddress: true } })
    .eq("id", action.id)
    .select("payload_hash")
    .single();
  if (edited.error) throw new MarketplaceError(edited.error.message, 409);
  await approveAction(ctx, { actionId: action.id, payloadHash: edited.data.payload_hash });
  const claimed = await ctx.db.rpc("claim_action", { p_action_id: action.id });
  if (claimed.error || !claimed.data?.id) throw new MarketplaceError("This deal is already being confirmed", 409);

  const hold = await ctx.db
    .from("reservations")
    .insert({ item_id: deal.itemId, conversation_id: conv!.id, price_cents: deal.priceCents, pickup_start: deal.pickupStart, pickup_end: deal.pickupEnd })
    .select("id")
    .single();
  if (hold.error) {
    await ctx.db.rpc("record_action_result", { p_action_id: action.id, p_status: "failed", p_mode: "live", p_error: "item already reserved" });
    throw new MarketplaceError("This item is already reserved for another buyer", 409);
  }

  let sentId: number;
  try {
    sentId = (await sendMessage(config, conv!.external_thread_ref!, message)).message_id;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    await ctx.db.rpc("record_action_result", { p_action_id: action.id, p_status: "failed", p_mode: "live", p_error: text });
    await ctx.db.from("reservations").update({ status: "released" }).eq("id", hold.data.id);
    throw new MarketplaceError(`The buyer was not messaged: ${text}`, 502);
  }
  await ctx.db.rpc("record_action_result", { p_action_id: action.id, p_status: "succeeded", p_mode: "live", p_provider_ref: String(sentId) });
  await ctx.db.from("reservations").update({ status: "confirmed" }).eq("id", hold.data.id);
  await ctx.db.from("items").update({ status: "reserved" }).eq("id", deal.itemId);
  await ctx.db.from("conversations").update({ deal_status: "confirmed" }).eq("id", conv!.id);
  await ctx.db.from("messages").insert({ conversation_id: conv!.id, direction: "outbound", body: message, source: "app_reply", action_id: action.id });

  // Everyone else on this item: cancel waiting deals and tell them it sold.
  const { data: others } = await ctx.db.from("conversations").select("*").eq("listing_id", listing!.id).neq("id", conv!.id).neq("deal_status", "closed");
  const sold = "Sorry, this item has been sold. Thanks for your interest!";
  for (const other of others ?? []) {
    const { data: waiting } = await ctx.db
      .from("actions")
      .select("id")
      .eq("kind", "pickup.confirm")
      .eq("status", "pending_review")
      .eq("payload->>conversationId", other.id);
    for (const w of waiting ?? []) await ctx.db.rpc("cancel_action", { p_action_id: w.id });
    try {
      await sendMessage(config, other.external_thread_ref!, sold);
      await ctx.db.from("messages").insert({ conversation_id: other.id, direction: "outbound", body: sold, source: "app_reply" });
    } catch (error) {
      console.error("could not tell a buyer the item sold", error);
    }
    await ctx.db.from("conversations").update({ deal_status: "closed" }).eq("id", other.id);
  }
  if (listing!.external_ref && move.move_out_date) {
    const cutoff = pickupCutoff(move.move_out_date, move.timezone);
    await editCaption(config, config.channelId, Number(listing!.external_ref), caption(listing!, cutoff, move.timezone, true)).catch((e) =>
      console.error("could not mark the channel post sold", e),
    );
  }
  return { confirmed: true };
}

/** The renter declines: the deal is cancelled and the agent keeps negotiating on the buyer's next message. */
export async function declineDeal(ctx: ToolContext, actionId: string) {
  const { data: action } = await ctx.db.from("actions").select("*").eq("id", actionId).eq("kind", "pickup.confirm").maybeSingle();
  if (!action) throw new MarketplaceError("Deal not found", 404);
  const { error } = await ctx.db.rpc("cancel_action", { p_action_id: actionId });
  if (error) throw new MarketplaceError(error.message, 409);
  const deal = ActionPayloads["pickup.confirm"].parse(action.payload);
  await ctx.db.from("conversations").update({ deal_status: "negotiating" }).eq("id", deal.conversationId).eq("deal_status", "awaiting_seller");
  return { declined: true };
}

// ---------------------------------------------------------------- price drops

/** Lowers each live Telegram listing to its scheduled price and updates the channel post. */
export async function applyPriceDrops(now = new Date()) {
  const config = readTelegramConfig();
  const db = serviceClient();
  const { data } = await db
    .from("listings")
    .select("*, items!inner(ask_cents, floor_cents, status, moves!inner(move_out_date, timezone))")
    .eq("channel", "telegram")
    .eq("status", "published");
  const changed: { listingId: string; from: number; to: number }[] = [];
  for (const row of data ?? []) {
    const { items, ...listing } = row as typeof row & {
      items: { ask_cents: number | null; floor_cents: number | null; status: string; moves: { move_out_date: string | null; timezone: string } };
    };
    if (items.status !== "listed" || !items.moves.move_out_date || !listing.published_at) continue;
    const cutoff = pickupCutoff(items.moves.move_out_date, items.moves.timezone);
    const price = scheduledPrice({
      askCents: items.ask_cents ?? listing.price_cents,
      floorCents: items.floor_cents,
      publishedAt: new Date(listing.published_at),
      cutoff,
      now,
    });
    if (price >= listing.price_cents) continue;
    await db.from("listings").update({ price_cents: price }).eq("id", listing.id);
    if (listing.external_ref) {
      await editCaption(config, config.channelId, Number(listing.external_ref), caption({ ...listing, price_cents: price }, cutoff, items.moves.timezone), button(config, listing.id)).catch(
        (e) => console.error("could not update the channel post price", e),
      );
    }
    changed.push({ listingId: listing.id, from: listing.price_cents, to: price });
  }
  return { changed };
}

// ---------------------------------------------------------------- state for /sell

export async function sellingState(ctx: ToolContext, now = new Date()) {
  const move = await currentMove(ctx);
  const [listings, conversations, messages, actions] = await Promise.all([
    ctx.db.from("listings").select("*, items!inner(id, name, ask_cents, floor_cents, status)").eq("channel", "telegram").order("created_at", { ascending: false }),
    ctx.db.from("conversations").select("*").eq("source", "telegram").order("last_active_at", { ascending: false }),
    ctx.db.from("messages").select("conversation_id, direction, body, source, created_at").order("created_at"),
    ctx.db.from("actions").select("*").eq("move_id", move.id).in("kind", ["listing.publish", "pickup.confirm"]).order("created_at", { ascending: false }),
  ]);
  const cutoff = move.move_out_date ? pickupCutoff(move.move_out_date, move.timezone) : null;
  return {
    move: { moveOutDate: move.move_out_date, timezone: move.timezone, areaLabel: move.area_label },
    cutoff: cutoff?.toISOString() ?? null,
    pastCutoff: cutoff ? now.getTime() > cutoff.getTime() : false,
    telegram: { configured: telegramConfigured() },
    listings: listings.data ?? [],
    conversations: conversations.data ?? [],
    messages: messages.data ?? [],
    actions: actions.data ?? [],
  };
}
