import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/supabase";
import type { Database } from "@/server/db/database.types";
// Replace only Next's cookie transport. requireUser and Supabase getUser are real.
const session = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("@/server/supabase", async (original) => ({
  ...await original<typeof import("@/server/supabase")>(),
  userClient: async () => session.db!,
}));
for (const line of readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Local Supabase required");
const { serviceClient } = await import("@/server/supabase");
const { POST: quotes } = await import("@/app/api/cleaning/quotes/route");
const { POST: propose } = await import("@/app/api/cleaning/bookings/route");
const { POST: approve } = await import("@/app/api/cleaning/bookings/[id]/approve/route");
const { defaultCleaningServices } = await import("@/server/tools/cleaning");
const admin = serviceClient(), people: { id: string; db: Db }[] = [];
const client = () => createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const post = (body: unknown) => new Request("http://localhost/api/cleaning", { method: "POST", body: JSON.stringify(body) });
const request = () => ({ requesterRole: "renter", serviceArea: { kind: "zip", zip: "94110" }, bedrooms: 1, bathrooms: 1, leaseRequirements: {}, itemsRemaining: { count: 0, hasBulky: false }, window: { earliestStart: new Date(Date.now() + 3 * 86400000).toISOString(), latestFinish: new Date(Date.now() + 17 * 86400000).toISOString() } });
beforeAll(async () => {
  for (let i = 0; i < 2; i++) {
    const email = `cleaning-${crypto.randomUUID()}@example.test`, password = crypto.randomUUID();
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (made.error) throw made.error;
    const db = client(); const result = await db.auth.signInWithPassword({ email, password }); if (result.error) throw result.error;
    people.push({ id: result.data.user.id, db });
  }
});
afterAll(async () => { for (const p of people) await admin.auth.admin.deleteUser(p.id); });
describe.sequential("Cleaning routes with verified Supabase identities", () => {
  it("returns 401 on every route when signed out, including malformed requests", async () => {
    session.db = client();
    for (const body of [{}, request()]) {
      expect((await quotes(post(body))).status).toBe(401);
      expect((await propose(post(body))).status).toBe(401);
      expect((await approve(post(body), { params: Promise.resolve({ id: "cbp_other" }) })).status).toBe(401);
    }
  });
  it("isolates quotes, proposals and approval writes between A and B", async () => {
    const [a, b] = people; session.db = a.db;
    const found = await quotes(post(request())); expect(found.status).toBe(200);
    const quote = (await found.json()).matches[0];
    const proposed = await propose(post({ quote, slotId: quote.slots[0].slotId })); expect(proposed.status).toBe(201);
    const { proposal } = await proposed.json();
    const repository = defaultCleaningServices().repository;
    expect(await repository.getQuote(b.id, quote.quoteId)).toBeNull();
    expect(await repository.getProposal(b.id, proposal.id)).toBeNull();
    session.db = b.db;
    expect((await propose(post({ quote, slotId: quote.slots[0].slotId }))).status).toBe(404);
    const input = { payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey };
    const forbidden = await approve(post(input), { params: Promise.resolve({ id: proposal.id }) });
    expect(forbidden.status).toBe(404);
    expect(JSON.stringify(await forbidden.json())).not.toContain(a.id);
    expect(await repository.getApproval(a.id, proposal.id)).toBeNull();
    expect((await repository.getProposal(a.id, proposal.id))?.status).toBe("pending_review");
    session.db = a.db;
    const approved = await approve(post(input), { params: Promise.resolve({ id: proposal.id }) });
    expect(approved.status).toBe(200);
    expect((await approved.json()).result.status).toBe("simulated_confirmed");
    expect(await repository.getApproval(b.id, proposal.id)).toBeNull();
  });
  it("never accepts owner identity from the request", async () => {
    session.db = people[0].db;
    expect((await quotes(post({ ...request(), ownerId: people[1].id }))).status).toBe(400);
  });
});
