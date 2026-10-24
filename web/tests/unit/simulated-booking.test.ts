import { describe, expect, it } from "vitest";
import { FixtureCleaningCatalog } from "@/server/integrations/cleaning-catalog";
import { SimulatedCleaningMarketplace } from "@/server/integrations/cleaning-simulator";
import {
  InMemoryCleaningRepository,
  approveCleaningBooking,
  findCleaningQuotes,
  proposeCleaningBooking,
  type CleaningContext,
} from "@/server/tools/cleaning";

const NOW = new Date("2026-11-02T17:00:00Z");

function cleaningContext(): CleaningContext {
  return {
    ownerId: "owner-a",
    now: () => NOW,
    repository: new InMemoryCleaningRepository(),
    provider: new SimulatedCleaningMarketplace(new FixtureCleaningCatalog()),
  };
}

describe("shared approval rules", () => {
  it("cleaning: re-approving a confirmed proposal with a wrong hash is a payload_mismatch, not the confirmation", async () => {
    const ctx = cleaningContext();
    const found = await findCleaningQuotes(
      {
        requesterRole: "renter",
        serviceArea: { kind: "zip", zip: "94110" },
        bedrooms: 1,
        bathrooms: 1,
        leaseRequirements: {},
        itemsRemaining: { count: 0, hasBulky: false },
        window: { earliestStart: "2026-11-09T15:00:00Z", latestFinish: "2026-11-14T02:00:00Z" },
      },
      ctx,
    );
    const quote = found.matches[0];
    const proposal = await proposeCleaningBooking({ quote, slotId: quote.slots[0].slotId }, ctx);
    const input = { proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey };
    expect((await approveCleaningBooking(input, ctx)).status).toBe("simulated_confirmed");

    const tampered = await approveCleaningBooking({ ...input, payloadHash: "e".repeat(64) }, ctx);
    expect(tampered).toMatchObject({ status: "rejected", reason: "payload_mismatch", simulated: true });

    const again = await approveCleaningBooking(input, ctx);
    expect(again.status).toBe("simulated_confirmed");
  });
});
