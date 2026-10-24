import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/server/db/database.types";
import type { ToolContext } from "@/server/auth";

vi.mock("@/server/integrations/telegram", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/integrations/telegram")>();
  return { ...actual, sendPhoto: vi.fn(), sendMessage: vi.fn(), editCaption: vi.fn() };
});
for (const line of readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Local Supabase required");
const { serviceClient } = await import("@/server/supabase");
const market = await import("@/server/marketplace");
const sales = await import("@/server/selling/claude-sales");
const legacy = await import("@/server/selling/telegram-sales");
const photos = await import("@/server/item-photos");
const telegram = await import("@/server/integrations/telegram");
const { buildMcpServer } = await import("@/server/connector/mcp");
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
const admin = serviceClient();
const people: ToolContext[] = [];
let a: ToolContext, b: ToolContext;
let updates = Date.now();
async function renter() {
  const email = `sales-${crypto.randomUUID()}@example.test`, password = crypto.randomUUID();
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw made.error;
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const ctx = { db, user: data.user }; people.push(ctx); return ctx;
}
beforeAll(async () => {
  for (const [key, value] of Object.entries({ TELEGRAM_BOT_TOKEN: "synthetic", TELEGRAM_BOT_USERNAME: "synthetic_bot", TELEGRAM_CHANNEL_ID: "-100123", TELEGRAM_WEBHOOK_SECRET: "synthetic", APP_URL: "https://vacate.example.test" })) vi.stubEnv(key, value);
  [a, b] = await Promise.all([renter(), renter()]);
  await market.updateMove(a, { moveOutDate: "2099-12-31", addressPrivate: "123 Synthetic Street" });
});
beforeEach(() => {
  vi.mocked(telegram.sendPhoto).mockReset().mockResolvedValue({ message_id: 10, chat: { id: -100123 } });
  vi.mocked(telegram.sendMessage).mockReset().mockResolvedValue({ message_id: 11, chat: { id: 456 } });
  vi.mocked(telegram.editCaption).mockReset();
});
afterAll(async () => { for (const ctx of people) {
  const docs = await admin.from("documents").select("storage_path").eq("owner_id", ctx.user.id);
  if (docs.data?.length) await admin.storage.from("move-files").remove(docs.data.map(d => d.storage_path));
  await admin.auth.admin.deleteUser(ctx.user.id);
} vi.unstubAllEnvs(); });
async function draft() {
  const item = await market.addItem(a, { name: "Synthetic chair", askUsd: 30, floorUsd: 10 });
  await market.setDisposition(a, { itemId: item.id, disposition: "sell" });
  const upload = await photos.prepareItemPhotoUpload(a, { itemId: item.id, mimeType: "image/jpeg" });
  const bytes = new Uint8Array([255,216,255,224,1,2,3,4]);
  const put = await fetch(upload.upload.url, { method: "PUT", headers: upload.upload.headers, body: bytes });
  expect(put.ok).toBe(true);
  await photos.attachItemPhoto(a, { itemId: item.id, documentId: upload.documentId, fileName: "synthetic.jpg" });
  return sales.prepareTelegramListing(a, { itemId: item.id, photoDocumentId: upload.documentId, title: "Synthetic chair", body: "A test chair." });
}
const args = (action: { id: string; payload_hash: string }) => ({ actionId: action.id, payloadHash: action.payload_hash });
async function publish() { const d = await draft(); await market.approveAction(a, args(d.action)); await sales.executeTelegramAction(a, args(d.action)); return d; }
async function buyer(listingId: string, id = 456) {
  await legacy.handleTelegramUpdate({ update_id: ++updates, message: { message_id: 1, date: 1, chat: { id, type: "private" }, from: { id, is_bot: false, first_name: "Synthetic buyer" }, text: `/start ${listingId}` } });
  const result = await a.db.from("conversations").select("*").eq("listing_id", listingId).eq("external_thread_ref", String(id)).single();
  expect(result.error).toBeNull(); return result.data!;
}
describe.sequential("Claude sales with real local RLS and mocked Telegram", () => {
  it("exposes renter sales tools but not to Muse executor tokens", async () => {
    for (const caller of [{ kind: "renter" as const, ctx: a }, { kind: "executor" as const, owner: { ownerId: a.user.id } }]) {
      const [c,s] = InMemoryTransport.createLinkedPair(); const server = buildMcpServer(caller); await server.connect(s);
      const client = new Client({ name: "sales-test", version: "1" }); await client.connect(c);
      const names = (await client.listTools()).tools.map(t => t.name);
      expect(names.includes("execute_telegram_action")).toBe(caller.kind === "renter");
      expect(names.includes("prepare_muse_handoff")).toBe(caller.kind === "renter");
      await client.close(); await server.close();
    }
  });
  it("requires ownership and separate exact approval; duplicate calls send once", async () => {
    const d = await draft(); const input = args(d.action);
    expect(d.review.text).toContain("$30"); expect(d.review.chatId).toBe("-100123"); expect(d.review.photos).toHaveLength(1);
    await expect(sales.executeTelegramAction(a, input)).rejects.toThrow(/approve/);
    await expect(sales.executeTelegramAction(b, input)).rejects.toThrow(/not found/);
    await expect(sales.prepareTelegramListing(b, { itemId: d.listing.item_id, photoDocumentId: d.review.photos[0].documentId, title: "x", body: "y" })).rejects.toThrow(/not found/);
    await market.approveAction(a, input);
    await expect(sales.executeTelegramAction(a, { ...input, payloadHash: "0".repeat(64) })).rejects.toThrow(/approve/);
    const results = await Promise.all([sales.executeTelegramAction(a, input), sales.executeTelegramAction(a, input)]);
    expect(results.some(r => r.status === "succeeded")).toBe(true); expect(telegram.sendPhoto).toHaveBeenCalledTimes(1);
    await sales.executeTelegramAction(a, input); expect(telegram.sendPhoto).toHaveBeenCalledTimes(1);
    expect(vi.mocked(telegram.sendPhoto).mock.calls[0][3]).toBe(d.review.text);
  });
  it("rejects changed destination and photo rather than silently sending new content", async () => {
    const d = await draft(); await market.approveAction(a, args(d.action));
    vi.stubEnv("TELEGRAM_CHANNEL_ID", "-100999");
    await expect(sales.executeTelegramAction(a, args(d.action))).rejects.toThrow(/destination changed/);
    vi.stubEnv("TELEGRAM_CHANNEL_ID", "-100123");
    await a.db.from("documents").update({ sha256: "a".repeat(64) }).eq("id", d.review.photos[0].documentId);
    await expect(sales.executeTelegramAction(a, args(d.action))).rejects.toThrow(/photo changed/);
    expect(telegram.sendPhoto).not.toHaveBeenCalled();
  });
  it("records timeout as unknown and never resends it", async () => {
    const d = await draft(); await market.approveAction(a, args(d.action));
    vi.mocked(telegram.sendPhoto).mockRejectedValue(new Error("timeout"));
    expect((await sales.executeTelegramAction(a, args(d.action))).status).toBe("unknown");
    expect((await sales.executeTelegramAction(a, args(d.action))).status).toBe("unknown");
    expect(telegram.sendPhoto).toHaveBeenCalledTimes(1);
  });
  it("holds inbound messages for review and never auto-replies or drops prices", async () => {
    const d = await publish(); const conv = await buyer(d.listing.id);
    await legacy.handleTelegramUpdate({ update_id: ++updates, message: { message_id: 2, date: 1, chat: { id: 456, type: "private" }, text: "Can I offer $20?" } });
    expect(telegram.sendMessage).not.toHaveBeenCalled();
    const reply = await sales.prepareTelegramReply(a, { conversationId: conv.id, body: "The asking price is $30." });
    await market.approveAction(a, args(reply.action)); await sales.executeTelegramAction(a, args(reply.action));
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    await legacy.applyPriceDrops(new Date("2099-12-29T12:00:00Z")); expect(telegram.editCaption).not.toHaveBeenCalled();
  });
  it("keeps an uncertain pickup held and prevents a second buyer commitment", async () => {
    const d = await publish(); const c1 = await buyer(d.listing.id, 457), c2 = await buyer(d.listing.id, 458);
    const details = { priceUsd: 25, pickupStart: "2099-12-20T10:00:00Z", pickupEnd: "2099-12-20T10:30:00Z", message: "Pickup at 123 Synthetic Street, December 20, 10:00 UTC, for $25." };
    const p1 = await sales.prepareTelegramPickup(a, { ...details, conversationId: c1.id });
    const p2 = await sales.prepareTelegramPickup(a, { ...details, conversationId: c2.id });
    expect(p1.action.payload).toMatchObject({ disclosesExactAddress: true });
    await market.approveAction(a, args(p1.action)); await market.approveAction(a, args(p2.action));
    vi.mocked(telegram.sendMessage).mockRejectedValue(new Error("timeout"));
    expect((await sales.executeTelegramAction(a, args(p1.action))).status).toBe("unknown");
    await expect(sales.executeTelegramAction(a, args(p2.action))).rejects.toThrow(/reserve/);
    expect((await sales.executeTelegramAction(a, args(p1.action))).status).toBe("unknown");
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
  });
  it("confirms one pickup without announcing a sale or messaging other buyers", async () => {
    const d = await publish(); const conv = await buyer(d.listing.id, 459);
    const pickup = await sales.prepareTelegramPickup(a, { conversationId: conv.id, priceUsd: 25, pickupStart: "2099-12-20T10:00:00Z", pickupEnd: "2099-12-20T10:30:00Z", message: "Pickup December 20 at 10:00 UTC for $25." });
    await expect(legacy.confirmDeal(a, { actionId: pickup.action.id, address: "123 Synthetic Street" })).rejects.toThrow(/Claude/);
    await market.approveAction(a, args(pickup.action));
    expect((await sales.executeTelegramAction(a, args(pickup.action))).status).toBe("succeeded");
    expect((await a.db.from("items").select("status").eq("id", d.listing.item_id).single()).data?.status).toBe("reserved");
    expect((await a.db.from("reservations").select("status").eq("conversation_id", conv.id).single()).data?.status).toBe("confirmed");
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1); expect(telegram.editCaption).not.toHaveBeenCalled();
  });
  it("creates a Muse handoff only for the approved owner/version and does not invoke Muse", async () => {
    const d = await draft(); const fb = await market.prepareFacebookListing(a, { itemId: d.listing.item_id });
    await expect(sales.museHandoff(a, args(fb.action))).rejects.toThrow(/No approved task/);
    await market.approveAction(a, args(fb.action));
    const handoff = await sales.museHandoff(a, args(fb.action));
    expect(handoff.canStart).toBe(true); expect(handoff.automaticApiInvocation).toBe(false);
    expect(handoff.prompt).toContain(fb.action.id); expect(handoff.prompt).not.toContain("vac_");
    await expect(sales.museHandoff(b, args(fb.action))).rejects.toThrow(/No approved task/);
    await expect(sales.museHandoff(a, { ...args(fb.action), payloadHash: "0".repeat(64) })).rejects.toThrow(/changed/);
  });
});
