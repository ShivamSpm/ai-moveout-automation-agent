import { describe, expect, it, vi } from "vitest";
import { PICKUP_ADDRESS_PENDING } from "@/contracts";
import type { ToolContext } from "@/server/auth";
import { approveAction, MarketplaceError } from "@/server/marketplace";

// An agent-proposed deal has no meetup address until the renter adds it on
// /sell, so approving it anywhere else (Muse console, Claude connector) is refused.

function ctxWith(row: { kind: string; payload: unknown }) {
  const rpc = vi.fn(async () => ({ data: { id: "a1", status: "approved" }, error: null }));
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
  return { ctx: { db: { from: () => chain, rpc }, user: { id: "u1" } } as unknown as ToolContext, rpc };
}

const input = { actionId: "0b1e7f52-4a59-4c3e-9d0e-6a3f5b2c1d00", payloadHash: "a".repeat(64) };

describe("approveAction", () => {
  it("refuses an agent-proposed deal that still lacks the meetup address", async () => {
    const { ctx, rpc } = ctxWith({ kind: "pickup.confirm", payload: { message: PICKUP_ADDRESS_PENDING } });
    await expect(approveAction(ctx, input)).rejects.toThrow(MarketplaceError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("approves a pickup whose message has the details", async () => {
    const { ctx, rpc } = ctxWith({ kind: "pickup.confirm", payload: { message: "Confirmed: Saturday 11am at 24th St BART." } });
    await expect(approveAction(ctx, input)).resolves.toMatchObject({ status: "approved" });
    expect(rpc).toHaveBeenCalledWith("approve_action", { p_action_id: input.actionId, p_payload_hash: input.payloadHash });
  });
});
