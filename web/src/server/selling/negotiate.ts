import "server-only";

import { ActionPayloads, PICKUP_ADDRESS_PENDING } from "@/contracts";
import type { Database } from "@/server/db/database.types";
import { disclosesAddress } from "@/server/domain/drafts";
import { isConfigured as openRouterConfigured } from "@/server/integrations/openrouter";
import { slidingWindow } from "@/server/rate-limit";
import type { serviceClient } from "@/server/supabase";
import { proposeTurn } from "./negotiator";
import { checkTurn, pickupCutoff, usd } from "./policy";

// One negotiation turn with one buyer, shared by every selling channel
// (Telegram, Facebook via Muse). It decides the reply and, when the buyer has
// agreed to a price and time, records a deal for the renter to approve. The
// caller delivers the reply on its channel.

type Service = ReturnType<typeof serviceClient>;
type Conversation = Database["public"]["Tables"]["conversations"]["Row"];

const PICKUP_MINUTES = 30;
const perBuyer = slidingWindow(15, 10 * 60_000);

const local = (date: Date, timeZone: string) =>
  date.toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** What the buyer receives once the renter approves a deal and enters the meetup address. */
export function dealMessage(title: string, priceCents: number, pickupStart: string, timeZone: string, address: string) {
  return `Good news: the seller confirmed! ${title} for ${usd(priceCents)}. Pickup ${local(new Date(pickupStart), timeZone)} at ${address}. Please pay in person at pickup. See you then!`;
}

/** A listing on one channel with its item and move, read with the service client. */
export async function saleContext(db: Service, listingId: string, channel: "telegram" | "facebook_marketplace") {
  const { data } = await db
    .from("listings")
    .select("*, items!inner(*, moves!inner(*))")
    .eq("id", listingId)
    .eq("channel", channel)
    .maybeSingle();
  if (!data) return null;
  const { items, ...listing } = data as typeof data & {
    items: { id: string; name: string; description: string | null; condition: string | null; ask_cents: number | null; floor_cents: number | null; status: string; moves: { id: string; move_out_date: string | null; timezone: string; address_private: string | null; area_label: string | null } };
  };
  const { moves: move, ...item } = items;
  return { listing, item, move };
}
export type SaleContext = NonNullable<Awaited<ReturnType<typeof saleContext>>>;

/** Cancels a waiting deal that nobody was told about and puts the buyer back to negotiating. */
export async function reopenConversation(db: Service, conversationId: string) {
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

export interface TurnInput {
  conv: Conversation;
  sale: SaleContext;
  buyerText: string;
  /** The price buyers currently see on this channel. */
  listedCents: number;
  /** Shown in the renter's deal card, e.g. "on Facebook". */
  channelLabel: string;
  now: Date;
}

/** The reply to send (null: send nothing) and what happened, for logs and callers. */
export async function negotiateTurn(db: Service, input: TurnInput): Promise<{ reply: string | null; handled: string }> {
  const { conv, sale, buyerText, listedCents, now } = input;
  const { listing, item, move } = sale;
  if (conv.deal_status === "confirmed") return { reply: "You're all set for pickup. See the details above. See you then!", handled: "confirmed" };
  if (item.status !== "listed" || conv.deal_status === "closed") return { reply: "Sorry, this item has already been sold.", handled: "sold" };
  if (conv.deal_status === "awaiting_seller") return { reply: "I'm still confirming with the seller and will message you shortly.", handled: "awaiting_seller" };
  if (!perBuyer.check(conv.id).allowed) return { reply: null, handled: "rate_limited" };
  if (!openRouterConfigured() || !move.move_out_date) {
    return { reply: "Thanks for your message! The seller will get back to you soon.", handled: "agent_unavailable" };
  }

  const cutoff = pickupCutoff(move.move_out_date, move.timezone);
  const floor = item.floor_cents ?? item.ask_cents ?? listing.price_cents;
  const [{ data: history }, { data: others }] = await Promise.all([
    db.from("messages").select("direction, body").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(30),
    db.from("conversations").select("id, deal_status, offer_cents").eq("listing_id", listing.id).neq("id", conv.id).neq("deal_status", "closed"),
  ]);
  const pending = (others ?? []).filter((o) => o.deal_status === "awaiting_seller");
  const pendingDealCents = pending.length ? Math.max(...pending.map((o) => o.offer_cents ?? 0)) : null;

  const proposed = await proposeTurn({
    item: { title: listing.title, description: listing.body, condition: item.condition },
    listedCents,
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
    return { reply: `Thanks! It's ${usd(listedCents)}. What would you like to offer, and when could you pick it up?`, handled: "agent_failed" };
  }
  const checked = checkTurn(
    proposed.turn,
    { floorCents: floor, listedCents, cutoff, now, buyerText, addressPrivate: move.address_private, pendingDealCents },
    (text) => disclosesAddress(text, move.address_private),
  );
  if (!checked.ok) {
    console.warn("selling agent reply blocked:", checked.reason);
    return { reply: checked.fallback, handled: "blocked" };
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
      message: PICKUP_ADDRESS_PENDING,
      disclosesExactAddress: false,
    });
    const created = await db
      .from("actions")
      .insert({
        move_id: move.id,
        owner_id: conv.owner_id,
        kind: "pickup.confirm",
        title: `Sell ${listing.title} to ${conv.buyer_label} ${input.channelLabel} for ${usd(checked.deal.priceCents)}, pickup ${local(pickupStart, move.timezone)}`,
        payload,
      })
      .select("id")
      .single();
    if (created.error) throw new Error(created.error.message);
    await db.from("conversations").update({ deal_status: "awaiting_seller", offer_cents: checked.deal.priceCents }).eq("id", conv.id);
  }
  return { reply: checked.reply, handled: checked.deal ? "deal_proposed" : "replied" };
}
