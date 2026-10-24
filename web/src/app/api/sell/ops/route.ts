import { z } from "zod";
import { AuthError, requireUser } from "@/server/auth";
import { ScopeError } from "@/server/domain/scope";
import { TelegramError } from "@/server/integrations/telegram";
import { cancelAction, MarketplaceError } from "@/server/marketplace";
import * as sales from "@/server/selling/telegram-sales";

// Web app operations for the Telegram selling lane. Signed-in renter only.
const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("state") }),
  z.object({ op: z.literal("publish"), actionId: z.uuid(), payloadHash: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.object({ op: z.literal("discard_listing"), actionId: z.uuid() }),
  sales.ConfirmDealInput.extend({ op: z.literal("confirm_deal") }),
  z.object({ op: z.literal("decline_deal"), actionId: z.uuid() }),
]);

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const ctx = await requireUser();
    const input = Op.parse(await request.json());
    switch (input.op) {
      case "state":
        return Response.json(await sales.sellingState(ctx));
      case "publish":
        return Response.json(await sales.publishListing(ctx, input));
      case "discard_listing":
        return Response.json(await cancelAction(ctx, input.actionId));
      case "confirm_deal":
        return Response.json(await sales.confirmDeal(ctx, input));
      case "decline_deal":
        return Response.json(await sales.declineDeal(ctx, input.actionId));
    }
  } catch (e) {
    const status =
      e instanceof z.ZodError ? 400
      : e instanceof AuthError || e instanceof ScopeError || e instanceof MarketplaceError || e instanceof TelegramError ? e.status
      : 500;
    const message = e instanceof z.ZodError ? z.prettifyError(e) : e instanceof Error ? e.message : "Request failed";
    if (status === 500) console.error(e);
    return Response.json({ error: message }, { status });
  }
}
