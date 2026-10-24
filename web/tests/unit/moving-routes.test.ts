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
import { POST as approve } from "@/app/api/moving/bookings/[id]/approve/route";
import { POST as propose } from "@/app/api/moving/bookings/route";
import { POST as quotes } from "@/app/api/moving/quotes/route";

const DAY = 24 * 60 * 60 * 1000;
const post = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function movingRequest() {
  // Routes run on the real clock, so the window is relative to now.
  return {
    requesterRole: "renter",
    origin: { zip: "94110", floor: 2, hasElevator: false, longCarryFeet: 0, parkingPermitNeeded: false },
    destination: { zip: "94117", floor: 1, hasElevator: false, longCarryFeet: 0 },
    distanceMiles: 3,
    moveWindow: { earliestStart: new Date(Date.now() + 4 * DAY).toISOString(), latestFinish: new Date(Date.now() + 18 * DAY).toISOString() },
    boxes: { small: 5, medium: 10, large: 2, wardrobe: 1 },
    furniture: { small: 2, medium: 2, large: 1, extraLarge: 1 },
  };
}

describe("moving API routes", () => {
  beforeEach(() => {
    identity.id = "renter-a";
    identity.signedIn = true;
  });

  it("requires sign-in", async () => {
    identity.signedIn = false;
    const res = await quotes(post(movingRequest()));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ simulated: true, error: { code: "unauthorized" } });
  });

  it("does not let a second renter propose from or approve another renter's booking", async () => {
    const found = await (await quotes(post(movingRequest()))).json();
    const quote = found.matches[0];
    const proposal = (await (await propose(post({ quote, slotId: quote.slots[0].slotId }))).json()).proposal;
    identity.id = "renter-b";
    expect((await propose(post({ quote, slotId: quote.slots[0].slotId }))).status).toBe(404);
    const res = await approve(post({ payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey }), {
      params: Promise.resolve({ id: proposal.id }),
    });
    expect(res.status).toBe(404);
  });

  it("runs quote, propose and approve end to end, all labeled simulated", async () => {
    const res = await quotes(post(movingRequest()));
    expect(res.status).toBe(200);
    const found = await res.json();
    expect(found).toMatchObject({ simulated: true, catalogSource: "fixture" });
    expect(found.excluded.length).toBeGreaterThan(0);
    const quote = found.matches[0];
    const proposed = await propose(post({ quote, slotId: quote.slots[0].slotId }));
    expect(proposed.status).toBe(201);
    const { proposal } = await proposed.json();
    const ok = await approve(post({ payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey }), { params: Promise.resolve({ id: proposal.id }) });
    const body = await ok.json();
    expect(body).toMatchObject({ simulated: true, result: { status: "simulated_confirmed" } });
    expect(body.result.confirmationCode).toMatch(/^SIM-/);
  });

  it("returns 400 for an owner id in the body and 404 for an unknown proposal", async () => {
    const withOwner = await quotes(post({ ...movingRequest(), ownerId: "someone-else" }));
    expect(withOwner.status).toBe(400);
    expect(await withOwner.json()).toMatchObject({ simulated: true, error: { code: "invalid_request" } });
    const missing = await approve(post({ payloadHash: "a".repeat(64), idempotencyKey: "client-key-0001" }), { params: Promise.resolve({ id: "mbp_nope" }) });
    expect(missing.status).toBe(404);
  });
});
