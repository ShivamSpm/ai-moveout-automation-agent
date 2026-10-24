// Runs against the local Supabase stack (`supabase start`) with synthetic
// users. Exercises the database guarantees the Muse bridge depends on.

import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

for (const line of readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { tokenClient, serviceClient } = await import("@/server/supabase");
const market = await import("@/server/marketplace");
const bridge = await import("@/server/muse/bridge");
const { a2aTransport, callContext } = await import("@/server/muse/a2a");
const { buildMcpServer } = await import("@/server/connector/mcp");

type Ctx = { db: ReturnType<typeof tokenClient>; user: User };

async function renter(label: string): Promise<Ctx> {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const admin = serviceClient();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { db: tokenClient(data.session.access_token), user: data.user };
}

let a: Ctx;
let b: Ctx;
let tokenA: string;

beforeAll(async () => {
  a = await renter("renter-a");
  b = await renter("renter-b");
  await market.updateMove(a, { areaLabel: "Mission District", addressPrivate: "100 Example Street, Apt 2" });
  tokenA = (await bridge.createConnectorToken(a.db)).token;
});

async function approvedListing(ctx: Ctx, name: string) {
  const item = await market.addItem(ctx, { name, askUsd: 120, floorUsd: 80, condition: "Good" });
  await market.setDisposition(ctx, { itemId: item.id, disposition: "sell" });
  const { listing, action } = await market.prepareFacebookListing(ctx, { itemId: item.id });
  await market.approveAction(ctx, { actionId: action.id, payloadHash: action.payload_hash });
  return { item, listing, action };
}

describe("Muse bridge", () => {
  it("resolves a connector token to its owner and rejects unknown tokens", async () => {
    expect(await bridge.resolveConnector(`Bearer ${tokenA}`)).toEqual({ ownerId: a.user.id });
    await expect(bridge.resolveConnector("Bearer vac_unknownunknownunknownunknown")).rejects.toThrow(/Unknown/);
  });

  it("only offers approved work, to its owner only, exactly once (A04, A13)", async () => {
    const item = await market.addItem(a, { name: "Bookshelf", askUsd: 40 });
    await market.setDisposition(a, { itemId: item.id, disposition: "sell" });
    const { action } = await market.prepareFacebookListing(a, { itemId: item.id });
    const ownerA = { ownerId: a.user.id };
    expect((await bridge.listTasks(ownerA)).some((t) => t.taskId === action.id)).toBe(false);

    await expect(market.approveAction(a, { actionId: action.id, payloadHash: "0".repeat(64) })).rejects.toThrow();
    await market.approveAction(a, { actionId: action.id, payloadHash: action.payload_hash });
    const task = (await bridge.listTasks(ownerA)).find((t) => t.taskId === action.id)!;
    expect(task.payload).toMatchObject({ channel: "facebook_marketplace", title: "Bookshelf" });
    expect(JSON.stringify(task.payload)).not.toContain("100 Example");

    const ownerB = { ownerId: b.user.id };
    expect(await bridge.listTasks(ownerB)).toHaveLength(0);
    expect((await bridge.claimTask(ownerB, { taskId: action.id, payloadHash: task.payloadHash })).claimed).toBe(false);

    const first = await bridge.claimTask(ownerA, { taskId: action.id, payloadHash: task.payloadHash });
    const second = await bridge.claimTask(ownerA, { taskId: action.id, payloadHash: task.payloadHash });
    expect([first.claimed, second.claimed]).toEqual([true, false]);
  });

  it("requires the Marketplace URL and the approved payload hash to report success", async () => {
    const { action, listing } = await approvedListing(a, "Desk lamp");
    const owner = { ownerId: a.user.id };
    await bridge.claimTask(owner, { taskId: action.id, payloadHash: action.payload_hash });
    await expect(
      bridge.reportResult(owner, { taskId: action.id, payloadHash: action.payload_hash, status: "succeeded" }),
    ).rejects.toThrow(/Marketplace URL/);
    await expect(
      bridge.reportResult(owner, {
        taskId: action.id,
        payloadHash: "f".repeat(64),
        status: "succeeded",
        externalUrl: "https://www.facebook.com/marketplace/item/1000000000000001/",
      }),
    ).rejects.toThrow();
    const ok = await bridge.reportResult(owner, {
      taskId: action.id,
      payloadHash: action.payload_hash,
      status: "succeeded",
      externalUrl: "https://www.facebook.com/marketplace/item/1000000000000001/",
    });
    expect(ok.status).toBe("succeeded");
    const { data } = await a.db.from("listings").select("status, mode, delegate, external_url").eq("id", listing.id).single();
    expect(data).toMatchObject({ status: "published", mode: "delegated", delegate: "muse" });
  });

  it("voids approval when the payload is edited after approval (A03)", async () => {
    const { action } = await approvedListing(a, "Rug");
    const edited = { ...(action.payload as object), priceCents: 1 };
    const { data } = await a.db.from("actions").update({ payload: edited }).eq("id", action.id).select("status, approved_hash").single();
    expect(data).toMatchObject({ status: "pending_review", approved_hash: null });
    expect((await bridge.listTasks({ ownerId: a.user.id })).some((t) => t.taskId === action.id)).toBe(false);
  });

  it("never lists a kept item (A06)", async () => {
    const item = await market.addItem(a, { name: "Grandma's chair" });
    await market.setDisposition(a, { itemId: item.id, disposition: "keep" });
    await expect(market.prepareFacebookListing(a, { itemId: item.id })).rejects.toThrow(/kept items are never listed/);
  });

  it("holds an item for one buyer only (A08)", async () => {
    const { item, listing, action } = await approvedListing(a, "Bike");
    const owner = { ownerId: a.user.id };
    await bridge.claimTask(owner, { taskId: action.id, payloadHash: action.payload_hash });
    await bridge.reportResult(owner, {
      taskId: action.id,
      payloadHash: action.payload_hash,
      status: "succeeded",
      externalUrl: "https://www.facebook.com/marketplace/item/1000000000000002/",
    });
    const sam = await bridge.relayBuyerMessage(owner, { listingId: listing.id, buyerName: "Sam K.", message: "Is it available? I can do $90", threadRef: "t-sam" });
    const lee = await bridge.relayBuyerMessage(owner, { listingId: listing.id, buyerName: "Lee", message: "Available today?", threadRef: "t-lee" });
    const window = { pickupStart: "2026-11-01T11:00:00-07:00", pickupEnd: "2026-11-01T11:30:00-07:00" };
    const p1 = await market.proposePickup(a, { conversationId: sam.conversationId, priceUsd: 90, message: "Saturday 11:00 works. See you then.", ...window });
    const p2 = await market.proposePickup(a, { conversationId: lee.conversationId, priceUsd: 100, message: "Saturday 11:00 works.", ...window });
    for (const p of [p1, p2]) await market.approveAction(a, { actionId: p.id, payloadHash: p.payload_hash });
    expect((await bridge.claimTask(owner, { taskId: p1.id, payloadHash: p1.payload_hash })).claimed).toBe(true);
    await expect(bridge.claimTask(owner, { taskId: p2.id, payloadHash: p2.payload_hash })).rejects.toThrow(/already held/);
    const { data } = await a.db.from("reservations").select("status").eq("item_id", item.id);
    expect(data).toEqual([{ status: "held" }]);
  });

  it("flags a reply that reveals the exact address (A09)", async () => {
    const { listing, action } = await approvedListing(a, "Mirror");
    const owner = { ownerId: a.user.id };
    await bridge.claimTask(owner, { taskId: action.id, payloadHash: action.payload_hash });
    await bridge.reportResult(owner, { taskId: action.id, payloadHash: action.payload_hash, status: "succeeded", externalUrl: "https://www.facebook.com/marketplace/item/1000000000000003/" });
    const c = await bridge.relayBuyerMessage(owner, { listingId: listing.id, buyerName: "Ana", message: "what's the address?", threadRef: "t-ana" });
    const reply = await market.draftBuyerReply(a, { conversationId: c.conversationId, body: "Come to 100 Example St, buzz 2" });
    expect(reply.payload).toMatchObject({ disclosesExactAddress: true });
  });

  it("keeps another renter's records invisible (A13)", async () => {
    const { item } = await approvedListing(a, "Lamp");
    const { data } = await b.db.from("items").select("id").eq("id", item.id);
    expect(data).toEqual([]);
    await expect(market.setDisposition(b, { itemId: item.id, disposition: "keep" })).rejects.toThrow();
    await expect(
      bridge.relayBuyerMessage({ ownerId: b.user.id }, { listingId: item.id, buyerName: "x", message: "x", threadRef: "x" }),
    ).rejects.toThrow(/not found/);
  });

  it("refuses landlord-side eviction work at the tool boundary (A15)", async () => {
    await expect(market.addItem(a, { name: "Tenant's couch", description: "Throw out the tenant's belongings" })).rejects.toThrow(/renters/);
  });
});

describe("manual Muse relay", () => {
  it("records a renter-relayed Muse result once, for the approved version only", async () => {
    const { action, listing } = await approvedListing(a, "Floor lamp");
    const url = "https://www.facebook.com/marketplace/item/1000000000000777/";
    await expect(
      market.recordRelayedResult(a, { actionId: action.id, payloadHash: "e".repeat(64), status: "succeeded", externalUrl: url }),
    ).rejects.toThrow();
    await expect(
      market.recordRelayedResult(b, { actionId: action.id, payloadHash: action.payload_hash, status: "succeeded", externalUrl: url }),
    ).rejects.toThrow();
    await expect(
      market.recordRelayedResult(a, { actionId: action.id, payloadHash: action.payload_hash, status: "succeeded", externalUrl: "https://example.com/x" }),
    ).rejects.toThrow(/Marketplace URL/);
    const ok = await market.recordRelayedResult(a, { actionId: action.id, payloadHash: action.payload_hash, status: "succeeded", externalUrl: url });
    expect(ok.status).toBe("succeeded");
    await expect(
      market.recordRelayedResult(a, { actionId: action.id, payloadHash: action.payload_hash, status: "succeeded", externalUrl: url }),
    ).rejects.toThrow(/cannot take a new result/);
    const { data } = await a.db.from("listings").select("status, external_url, mode").eq("id", listing.id).single();
    expect(data).toMatchObject({ status: "published", external_url: url, mode: "delegated" });
  });
});

describe("A2A 1.0 wire", () => {
  const send = (ownerId: string, data: unknown, taskId?: string) =>
    a2aTransport().handle(
      {
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "SendMessage",
        params: {
          message: { messageId: crypto.randomUUID(), role: "ROLE_USER", ...(taskId ? { taskId } : {}), parts: [{ data, mediaType: "application/json" }] },
        },
      },
      callContext({ ownerId }, "1.0"),
    ) as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

  it("lists, claims and reports a task over JSON-RPC", async () => {
    const { action } = await approvedListing(a, "Speaker");
    const listed = await send(a.user.id, { op: "list_tasks" });
    const tasks = JSON.stringify(listed);
    expect(tasks).toContain(action.id);

    const claimed = await send(a.user.id, { op: "claim", taskId: action.id, payloadHash: action.payload_hash });
    const task = claimed.result?.task;
    expect(task?.status?.state).toBe("TASK_STATE_WORKING");

    const reported = await send(
      a.user.id,
      { op: "report", payloadHash: action.payload_hash, status: "succeeded", externalUrl: "https://www.facebook.com/marketplace/item/1000000000000004/" },
      task.id,
    );
    expect(reported.result?.task?.status?.state).toBe("TASK_STATE_COMPLETED");

    const other = await send(b.user.id, { op: "list_tasks" });
    expect(JSON.stringify(other)).not.toContain(action.id);
  });
});

describe("MCP connector", () => {
  async function connect(caller: Parameters<typeof buildMcpServer>[0]) {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await buildMcpServer(caller).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    return client;
  }

  it("gives OAuth renters the full toolset and connector tokens only the work queue", async () => {
    const renterTools = (await (await connect({ kind: "renter", ctx: a })).listTools()).tools.map((t) => t.name);
    const execTools = (await (await connect({ kind: "executor", owner: { ownerId: a.user.id } })).listTools()).tools.map((t) => t.name);
    expect(renterTools).toEqual(expect.arrayContaining(["prepare_facebook_listing", "approve_action", "muse_list_tasks"]));
    expect(execTools.every((n) => n.startsWith("muse_"))).toBe(true);
  });

  it("runs a renter flow through tool calls", async () => {
    const client = await connect({ kind: "renter", ctx: a });
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name, arguments: args });
      return JSON.parse((r.content as { text: string }[])[0].text);
    };
    const item = await call("add_item", { name: "Coffee table", askUsd: 60 });
    await call("set_item_disposition", { itemId: item.id, disposition: "sell" });
    const { action } = await call("prepare_facebook_listing", { itemId: item.id });
    await call("approve_action", { actionId: action.id, payloadHash: action.payload_hash });
    const tasks = await call("muse_list_tasks");
    expect(tasks.some((t: { taskId: string }) => t.taskId === action.id)).toBe(true);
  });
});
