import "server-only";

import { ActionPayloads, type ActionPayload } from "@/contracts";
import type { ToolContext } from "@/server/auth";
import { disclosesAddress } from "@/server/domain/drafts";
import { approveAction, MarketplaceError } from "@/server/marketplace";
import { serviceClient } from "@/server/supabase";
import { negotiateTurn, saleContext } from "./negotiate";

// Facebook Marketplace lane: Muse relays each buyer message, the shared agent
// decides the reply, and the reply is queued as an approved buyer.reply task
// for Muse to send from the renter's account (Muse still shows its own prompt).
// Replies within the renter's limits need no review (D18); deals still wait for
// the renter's Approve on /sell.

/** Runs one negotiation turn for a relayed Facebook message. Returns the queued reply task, if any. */
export async function negotiateFacebookMessage(ownerId: string, conversationId: string, buyerText: string, now = new Date()) {
  const db = serviceClient();
  const { data: conv } = await db.from("conversations").select("*").eq("id", conversationId).eq("owner_id", ownerId).maybeSingle();
  if (!conv) return { replyTaskId: null, handled: "no_conversation" };
  const sale = await saleContext(db, conv.listing_id, "facebook_marketplace");
  if (!sale || sale.listing.owner_id !== ownerId) return { replyTaskId: null, handled: "listing_gone" };

  // Facebook prices are not edited automatically, so buyers see the listed price.
  const turn = await negotiateTurn(db, { conv, sale, buyerText, listedCents: sale.listing.price_cents, channelLabel: "on Facebook", now });
  if (!turn.reply) return { replyTaskId: null, handled: turn.handled };

  const payload = ActionPayloads["buyer.reply"].parse({
    conversationId: conv.id,
    buyerLabel: conv.buyer_label,
    body: turn.reply,
    disclosesExactAddress: disclosesAddress(turn.reply, sale.move.address_private),
  });
  const created = await db
    .from("actions")
    .insert({ move_id: sale.move.id, owner_id: ownerId, kind: "buyer.reply", title: `Agent reply to ${conv.buyer_label}`, payload })
    .select("id, payload_hash")
    .single();
  if (created.error) throw new Error(created.error.message);
  // Approved under the renter's standing rule; Muse claims it exactly once from list_tasks.
  const approved = await db
    .from("actions")
    .update({ status: "approved", approved_hash: created.data.payload_hash, approved_at: now.toISOString() })
    .eq("id", created.data.id)
    .eq("status", "pending_review");
  if (approved.error) throw new Error(approved.error.message);
  await db.from("action_events").insert({
    action_id: created.data.id,
    owner_id: ownerId,
    event: "approved",
    detail: { by: "selling_agent", rule: "D18: replies within the renter's minimum and pickup cutoff", payload_hash: created.data.payload_hash },
  });
  return { replyTaskId: created.data.id, handled: turn.handled };
}

/**
 * The renter approves a Facebook deal on /sell with the meetup address. Muse
 * then claims it (which holds the item for this buyer) and sends it; other
 * waiting deals on the item are cancelled now so only one buyer is promised it.
 */
export async function approveFacebookDeal(
  ctx: ToolContext,
  input: { actionId: string; deal: ActionPayload<"pickup.confirm">; conversationId: string; listingId: string; message: string },
) {
  // Editing the payload voids any earlier approval, so the renter approves exactly this message.
  const edited = await ctx.db
    .from("actions")
    .update({ payload: { ...input.deal, message: input.message, disclosesExactAddress: true } })
    .eq("id", input.actionId)
    .select("payload_hash")
    .single();
  if (edited.error) throw new MarketplaceError(edited.error.message, 409);
  await approveAction(ctx, { actionId: input.actionId, payloadHash: edited.data.payload_hash });

  const { data: others } = await ctx.db
    .from("conversations")
    .select("id")
    .eq("listing_id", input.listingId)
    .neq("id", input.conversationId)
    .eq("deal_status", "awaiting_seller");
  for (const other of others ?? []) {
    const { data: waiting } = await ctx.db
      .from("actions")
      .select("id")
      .eq("kind", "pickup.confirm")
      .eq("status", "pending_review")
      .eq("payload->>conversationId", other.id);
    for (const w of waiting ?? []) await ctx.db.rpc("cancel_action", { p_action_id: w.id });
    await ctx.db.from("conversations").update({ deal_status: "negotiating" }).eq("id", other.id);
  }
  await ctx.db.from("conversations").update({ deal_status: "confirmed" }).eq("id", input.conversationId);
  return { confirmed: true, via: "muse", next: "Muse sends this confirmation from your Facebook account next." };
}
