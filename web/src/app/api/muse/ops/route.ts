import { z } from "zod";
import { AuthError, requireUser } from "@/server/auth";
import { ScopeError } from "@/server/domain/scope";
import * as market from "@/server/marketplace";
import { BridgeError, createConnectorToken } from "@/server/muse/bridge";

// Web app operations for the Muse lane. Same functions the MCP connector uses.
const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("state") }),
  market.UpdateMoveInput.extend({ op: z.literal("update_move") }),
  market.AddItemInput.extend({ op: z.literal("add_item") }),
  market.SetDispositionInput.extend({ op: z.literal("set_disposition") }),
  market.PrepareListingInput.extend({ op: z.literal("prepare_listing") }),
  market.ApproveInput.extend({ op: z.literal("approve") }),
  z.object({ op: z.literal("cancel"), actionId: z.uuid() }),
  market.DraftReplyInput.extend({ op: z.literal("draft_reply") }),
  market.ProposePickupInput.extend({ op: z.literal("propose_pickup") }),
  z.object({ op: z.literal("create_token"), label: z.string().max(60).optional() }),
  z.object({ op: z.literal("revoke_token"), tokenId: z.uuid() }),
]);

export async function POST(request: Request) {
  try {
    const ctx = await requireUser();
    const input = Op.parse(await request.json());
    switch (input.op) {
      case "state":
        return Response.json(await market.marketplaceState(ctx));
      case "update_move":
        return Response.json(await market.updateMove(ctx, input));
      case "add_item":
        return Response.json(await market.addItem(ctx, input));
      case "set_disposition":
        return Response.json(await market.setDisposition(ctx, input));
      case "prepare_listing":
        return Response.json(await market.prepareFacebookListing(ctx, input));
      case "approve":
        return Response.json(await market.approveAction(ctx, input));
      case "cancel":
        return Response.json(await market.cancelAction(ctx, input.actionId));
      case "draft_reply":
        return Response.json(await market.draftBuyerReply(ctx, input));
      case "propose_pickup":
        return Response.json(await market.proposePickup(ctx, input));
      case "create_token":
        return Response.json(await createConnectorToken(ctx.db, input.label));
      case "revoke_token": {
        const { error } = await ctx.db
          .from("connector_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", input.tokenId);
        if (error) throw new market.MarketplaceError(error.message);
        return Response.json({ revoked: true });
      }
    }
  } catch (e) {
    const status =
      e instanceof z.ZodError ? 400
      : e instanceof AuthError || e instanceof ScopeError || e instanceof BridgeError || e instanceof market.MarketplaceError ? e.status
      : 500;
    const message = e instanceof z.ZodError ? z.prettifyError(e) : e instanceof Error ? e.message : "Request failed";
    return Response.json({ error: message }, { status });
  }
}
