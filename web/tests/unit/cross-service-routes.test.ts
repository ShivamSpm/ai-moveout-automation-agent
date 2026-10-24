const identity = vi.hoisted(() => ({ id: "renter-a", signedIn: true }));
vi.mock("@/server/auth", () => ({
  AuthError: class AuthError extends Error {},
  requireUser: async () => {
    if (!identity.signedIn) {
      const { AuthError } = await import("@/server/auth");
      throw new AuthError("Sign in");
    }
    return { user: { id: identity.id } };
  },
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as approveCleaning } from "@/app/api/cleaning/bookings/[id]/approve/route";
import { POST as proposeCleaning } from "@/app/api/cleaning/bookings/route";
import { POST as cleaningQuotes } from "@/app/api/cleaning/quotes/route";
import { POST as approveMoving } from "@/app/api/moving/bookings/[id]/approve/route";
import { POST as proposeMoving } from "@/app/api/moving/bookings/route";
import { POST as movingQuotes } from "@/app/api/moving/quotes/route";

const DAY = 24 * 60 * 60 * 1000;
const post = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

async function cleaningProposal() {
  const found = await (
    await cleaningQuotes(
      post({
        requesterRole: "renter",
        serviceArea: { kind: "zip", zip: "94110" },
        bedrooms: 1,
        bathrooms: 1,
        leaseRequirements: {},
        itemsRemaining: { count: 0, hasBulky: false },
        window: { earliestStart: at(3), latestFinish: at(17) },
      }),
    )
  ).json();
  const quote = found.matches[0];
  return (await (await proposeCleaning(post({ quote, slotId: quote.slots[0].slotId }))).json()).proposal;
}

async function movingProposal() {
  const found = await (
    await movingQuotes(
      post({
        requesterRole: "renter",
        origin: { zip: "94110", floor: 1, hasElevator: false },
        destination: { zip: "94117", floor: 1, hasElevator: false },
        distanceMiles: 3,
        moveWindow: { earliestStart: at(4), latestFinish: at(18) },
        boxes: { medium: 10 },
        furniture: { medium: 2 },
      }),
    )
  ).json();
  const quote = found.matches[0];
  return (await (await proposeMoving(post({ quote, slotId: quote.slots[0].slotId }))).json()).proposal;
}

describe("proposal ids do not cross services", () => {
  beforeEach(() => {
    identity.id = "renter-a";
    identity.signedIn = true;
  });

  it("returns 404 when a cleaning proposal is approved through the moving route", async () => {
    const proposal = await cleaningProposal();
    expect(proposal.id).toMatch(/^cbp_/);
    const res = await approveMoving(post({ payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey }), {
      params: Promise.resolve({ id: proposal.id }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ simulated: true, error: { code: "not_found" } });
  });

  it("returns 404 when a moving proposal is approved through the cleaning route", async () => {
    const proposal = await movingProposal();
    expect(proposal.id).toMatch(/^mbp_/);
    const res = await approveCleaning(post({ payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey }), {
      params: Promise.resolve({ id: proposal.id }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ simulated: true, error: { code: "not_found" } });
  });
});
