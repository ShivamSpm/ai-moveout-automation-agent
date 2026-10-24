const identity = vi.hoisted(() => ({ id: "renter-a", signedIn: true }));
vi.mock("@/server/auth", () => ({
  AuthError: class AuthError extends Error {},
  requireUser: async () => { if (!identity.signedIn) { const { AuthError } = await import("@/server/auth"); throw new AuthError("Sign in"); } return { user: { id: identity.id } }; },
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as approve } from "@/app/api/cleaning/bookings/[id]/approve/route";
import { POST as propose } from "@/app/api/cleaning/bookings/route";
import { POST as quotes } from "@/app/api/cleaning/quotes/route";

const DAY = 24 * 60 * 60 * 1000;

const post = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function cleaningRequest() {
  // Routes run on the real clock, so the window is relative to now.
  const start = new Date(Date.now() + 3 * DAY).toISOString();
  const finish = new Date(Date.now() + 17 * DAY).toISOString();
  return {
    requesterRole: "renter",
    serviceArea: { kind: "zip", zip: "94110" },
    bedrooms: 1,
    bathrooms: 1,
    leaseRequirements: { deepClean: true },
    itemsRemaining: { count: 0, hasBulky: false },
    window: { earliestStart: start, latestFinish: finish },
  };
}

describe("cleaning API routes", () => {
  beforeEach(() => { identity.id = "renter-a"; identity.signedIn = true; });
  it("requires sign-in", async () => { identity.signedIn = false; expect((await quotes(post(cleaningRequest()))).status).toBe(401); });
  it("does not let a second renter propose from another renter's quote", async () => {
    const result = await (await quotes(post(cleaningRequest()))).json();
    const quote = result.matches[0]; identity.id = "renter-b";
    const response = await propose(post({ quote, slotId: quote.slots[0].slotId }));
    expect(response.status).not.toBe(201);
  });
  it("runs quote, propose and approve end to end, all labeled simulated", async () => {
    const quoteRes = await quotes(post(cleaningRequest()));
    expect(quoteRes.status).toBe(200);
    const found = await quoteRes.json();
    expect(found).toMatchObject({ simulated: true, catalogSource: "fixture" });
    const quote = found.matches[0];
    expect(quote).toBeDefined();

    const proposeRes = await propose(post({ quote, slotId: quote.slots[0].slotId }));
    expect(proposeRes.status).toBe(201);
    const { proposal, simulated } = await proposeRes.json();
    expect(simulated).toBe(true);
    expect(proposal.status).toBe("pending_review");

    const params = Promise.resolve({ id: proposal.id });
    const mismatch = await approve(post({ payloadHash: "0".repeat(64), idempotencyKey: proposal.idempotencyKey }), { params });
    expect((await mismatch.json()).result).toMatchObject({ status: "rejected", reason: "payload_mismatch" });

    const ok = await approve(post({ payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey }), {
      params: Promise.resolve({ id: proposal.id }),
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.simulated).toBe(true);
    expect(body.result.status).toBe("simulated_confirmed");
    expect(body.result.confirmationCode).toMatch(/^SIM-/);
  });

  it("returns 400 with a safe message for bad bodies and never accepts an owner id", async () => {
    const withOwner = await quotes(post({ ...cleaningRequest(), ownerId: "someone-else" }));
    expect(withOwner.status).toBe(400);
    expect(await withOwner.json()).toMatchObject({ simulated: true, error: { code: "invalid_request" } });

    const notJson = await quotes(new Request("http://localhost/api", { method: "POST", body: "{" }));
    expect(notJson.status).toBe(400);

    const badApprove = await approve(post({ payloadHash: "nope" }), { params: Promise.resolve({ id: "cbp_x" }) });
    expect(badApprove.status).toBe(400);
  });

  it("returns 404 for an unknown proposal", async () => {
    const res = await approve(post({ payloadHash: "a".repeat(64), idempotencyKey: "client-key-0001" }), {
      params: Promise.resolve({ id: "cbp_does_not_exist" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ simulated: true, error: { code: "not_found" } });
  });
});
