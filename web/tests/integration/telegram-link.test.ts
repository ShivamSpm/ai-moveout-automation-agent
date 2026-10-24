import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/server/db/database.types";
import type { ToolContext } from "@/server/auth";
for (const line of readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Local Supabase required");
const { serviceClient } = await import("@/server/supabase");
const admin = serviceClient();
const people: ToolContext[] = [];
let a: ToolContext, b: ToolContext;
async function renter() {
  const email = `telegram-${crypto.randomUUID()}@example.test`, password = crypto.randomUUID();
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw made.error;
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const ctx = { db, user: data.user }; people.push(ctx); return ctx;
}
beforeAll(async () => { [a, b] = await Promise.all([renter(), renter()]); });
afterAll(async () => { for (const ctx of people) await admin.auth.admin.deleteUser(ctx.user.id); });
async function nonce() {
  await admin.from("telegram_link_nonces").delete().eq("owner_id", a.user.id);
  const result = await admin.rpc("prepare_telegram_link", { p_owner_id: a.user.id });
  expect(result.error).toBeNull(); return result.data!;
}
const consume = (code: string, user = "42", chat = "-100123") => admin.rpc("consume_telegram_link", {
  p_nonce: code, p_user_id: user, p_chat_id: chat, p_title: "Synthetic group", p_username: "",
});
const bind = (code: string, user = "42") => admin.rpc("bind_telegram_link", { p_nonce: code, p_user_id: user });
describe.sequential("Telegram link nonce (real local database)", () => {
  it("expires in 15 minutes and polling preserves the nonce", async () => {
    const n = await nonce();
    expect(Date.parse(n.expires_at) - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(Date.parse(n.expires_at) - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    expect(n.nonce).toMatch(/^[a-f0-9]{48}$/);
    expect((await admin.rpc("prepare_telegram_link", { p_owner_id: a.user.id })).data?.nonce).toBe(n.nonce);
  });
  it("binds once, links the matching user, and rejects replay to another group", async () => {
    const n = await nonce();
    expect((await consume(n.nonce)).data).toBe(false);
    expect((await bind(n.nonce)).data).toBe(true);
    expect((await bind(n.nonce, "43")).data).toBe(false);
    expect((await consume(n.nonce)).data).toBe(true);
    expect((await consume(n.nonce, "42", "-100999")).data).toBe(false);
    expect((await admin.from("telegram_targets").select("*").eq("owner_id", a.user.id).single()).data).toMatchObject({ chat_id: "-100123", telegram_user_id: "42" });
    expect((await a.db.from("telegram_link_nonces").select()).data).toEqual([]);
  });
  it("rejects wrong or absent users without consuming the valid nonce", async () => {
    const n = await nonce(); await bind(n.nonce);
    expect((await consume(n.nonce, "43")).data).toBe(false);
    expect((await consume(n.nonce, "")).data).toBe(false);
    expect((await consume(n.nonce)).data).toBe(true);
  });
  it("rejects expired credentials at both steps and rotates them", async () => {
    const n = await nonce(); await bind(n.nonce);
    await admin.from("telegram_link_nonces").update({ expires_at: "2020-01-01T00:00:00Z" }).eq("owner_id", a.user.id);
    expect((await consume(n.nonce)).data).toBe(false);
    expect((await bind(n.nonce)).data).toBe(false);
    const rotated = await admin.rpc("prepare_telegram_link", { p_owner_id: a.user.id });
    expect(rotated.error).toBeNull(); expect(rotated.data?.nonce).not.toBe(n.nonce);
    expect(rotated.data?.telegram_user_id).toBeNull();
  });
  it("allows only one concurrent consumer", async () => {
    const n = await nonce(); await bind(n.nonce);
    const results = await Promise.all([consume(n.nonce), consume(n.nonce, "42", "-100999")]);
    expect(results.map(r => r.data).sort()).toEqual([false, true]);
    expect(results.every(r => !r.error)).toBe(true);
  });
  it("restricts reads to the owner and writes/RPCs to the service role", async () => {
    const n = await nonce();
    expect((await a.db.from("telegram_link_nonces").select()).data).toHaveLength(1);
    expect((await b.db.from("telegram_link_nonces").select().eq("nonce", n.nonce)).data).toEqual([]);
    expect((await a.db.from("telegram_link_nonces").insert({ owner_id: a.user.id })).error).toBeTruthy();
    expect((await a.db.from("telegram_link_nonces").update({ telegram_user_id: "43" }).eq("owner_id", a.user.id)).error).toBeTruthy();
    expect((await a.db.from("telegram_link_nonces").delete().eq("owner_id", a.user.id)).error).toBeTruthy();
    expect((await a.db.rpc("prepare_telegram_link", { p_owner_id: b.user.id })).error).toBeTruthy();
    expect((await a.db.rpc("bind_telegram_link", { p_nonce: n.nonce, p_user_id: "43" })).error).toBeTruthy();
    expect((await a.db.rpc("consume_telegram_link", { p_nonce: n.nonce, p_user_id: "43", p_chat_id: "-123", p_title: "Synthetic", p_username: "" })).error).toBeTruthy();
  });
});
