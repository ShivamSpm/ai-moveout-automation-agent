import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Real local Auth, SSR cookies, requireUser and RLS. Only Next's request cookie
// container is replaced; no admin/service client is used by this test.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string) => { jar.set(name, value); },
}) }));
for (const line of readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const { saveStart } = await import("@/app/start/actions");
const { requireUser } = await import("@/server/auth");
let owner: Awaited<ReturnType<typeof requireUser>>;
let other: Awaited<ReturnType<typeof requireUser>>;
let ownerCookies: Map<string, string>;
let moveId: string;
const email = `start-${crypto.randomUUID()}@example.test`;
const password = `pw-${crypto.randomUUID()}`;
function form(emailAddress = email, address = "100 Example Street") {
  const data = new FormData();
  for (const [key, value] of Object.entries({ email: emailAddress, password, address, moveOutDate: "2026-11-30", deposit: "$3,950", landlordName: "Example Manager", landlordEmail: emailAddress })) data.set(key, value);
  return data;
}
beforeAll(() => {
  if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname !== "127.0.0.1") throw new Error("This test requires the local Supabase stack");
});
describe.sequential("start signup and saved move", () => {
  it("signs up and saves the move under the verified renter", async () => {
    expect(await saveStart({ status: "idle" }, form())).toEqual({ status: "success" });
    owner = await requireUser();
    ownerCookies = new Map(jar);
    const { data, error } = await owner.db.from("moves").select("*").single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ owner_id: owner.user.id, address_private: "100 Example Street", move_out_date: "2026-11-30", deposit_cents: 395000, landlord_name: "Example Manager", landlord_email: email });
    moveId = data!.id;
  });
  it("prevents another renter from reading or updating the move", async () => {
    jar.clear();
    expect(await saveStart({ status: "idle" }, form(`start-other-${crypto.randomUUID()}@example.test`))).toEqual({ status: "success" });
    other = await requireUser();
    const read = await other.db.from("moves").select("id").eq("id", moveId);
    expect(read.error).toBeNull(); expect(read.data).toEqual([]);
    const update = await other.db.from("moves").update({ address_private: "Unwanted change" }).eq("id", moveId).select("id");
    expect(update.error).toBeNull(); expect(update.data).toEqual([]);
    jar.clear(); for (const [key, value] of ownerCookies) jar.set(key, value);
    expect((await owner.db.from("moves").select("address_private").eq("id", moveId).single()).data?.address_private).toBe("100 Example Street");
  });
  it("updates the existing move without accepting a supplied owner", async () => {
    jar.clear(); for (const [key, value] of ownerCookies) jar.set(key, value);
    const data = form(email, "200 Example Street");
    data.delete("email"); data.delete("password"); data.set("owner_id", other.user.id);
    expect(await saveStart({ status: "idle" }, data)).toEqual({ status: "success" });
    const result = await owner.db.from("moves").select("id, owner_id, address_private");
    expect(result.data).toEqual([{ id: moveId, owner_id: owner.user.id, address_private: "200 Example Street" }]);
  });
  it("offers existing-account sign-in and saves after password authentication", async () => {
    jar.clear();
    expect((await saveStart({ status: "idle" }, form())).status).toBe("existing_account");
    const data = form(email, "300 Example Street"); data.set("intent", "signin");
    expect(await saveStart({ status: "idle" }, data)).toEqual({ status: "success" });
    expect((await requireUser()).user.id).toBe(owner.user.id);
    expect((await owner.db.from("moves").select("id")).data).toEqual([{ id: moveId }]);
  });
});
