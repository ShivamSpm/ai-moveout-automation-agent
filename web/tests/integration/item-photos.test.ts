// Runs against the local Supabase stack (`supabase start`) with synthetic
// users and synthetic image bytes. Exercises the connector photo upload,
// attach, isolation and photo binding into reviewed Facebook listings.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createClient, type User } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it } from "vitest";

for (const line of readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { tokenClient, serviceClient } = await import("@/server/supabase");
const market = await import("@/server/marketplace");
const bridge = await import("@/server/muse/bridge");
const { buildMcpServer } = await import("@/server/connector/mcp");

type Ctx = { db: ReturnType<typeof tokenClient>; user: User };

async function renter(label: string): Promise<Ctx> {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const created = await serviceClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { db: tokenClient(data.session.access_token), user: data.user };
}

const clients: Client[] = [];
async function connect(ctx: Ctx) {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await buildMcpServer({ kind: "renter", ctx }).connect(s);
  const client = new Client({ name: "item-photos-test", version: "1" });
  await client.connect(c);
  clients.push(client);
  return async (name: string, args: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name, arguments: args });
    if (response.isError) throw new Error(JSON.stringify(response.content));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test reads nested tool output
    return response.structuredContent as Record<string, any>;
  };
}

// A JPEG signature followed by synthetic bytes; not a real photo.
const jpeg = (seed: string) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(`synthetic-${seed}`)]);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function put(upload: { url: string; headers: Record<string, string> }, bytes: Uint8Array) {
  const res = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: Buffer.from(bytes) });
  expect(res.ok, await res.clone().text()).toBe(true);
}

let a: Ctx, b: Ctx;
let callA: Awaited<ReturnType<typeof connect>>, callB: Awaited<ReturnType<typeof connect>>;
let itemA: string, itemB: string;

beforeAll(async () => {
  process.env.APP_URL = "https://vacate.example.test";
  a = await renter("photos-a");
  b = await renter("photos-b");
  for (const ctx of [a, b]) await market.updateMove(ctx, { moveOutDate: "2026-12-31", areaLabel: "Synthetic district" });
  callA = await connect(a);
  callB = await connect(b);
  itemA = (await callA("add_item", { name: "Synthetic mouse" })).id;
  itemB = (await callB("add_item", { name: "Synthetic lamp" })).id;
});

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
  for (const ctx of [a, b]) if (ctx) await serviceClient().auth.admin.deleteUser(ctx.user.id);
});

it("uploads, verifies and attaches an original photo, and retries safely", async () => {
  const bytes = jpeg("a1");
  const started = await callA("create_item_photo_upload", { itemId: itemA, mimeType: "image/jpeg" });
  expect(started.upload).toMatchObject({ method: "PUT", headers: { "content-type": "image/jpeg" } });
  await put(started.upload, bytes);
  const args = { itemId: itemA, documentId: started.documentId, fileName: "IMG_0001.jpeg", sha256: sha(bytes) };
  const attached = await callA("attach_item_photo", args);
  expect(attached.photo).toMatchObject({ documentId: started.documentId, sha256: sha(bytes), mimeType: "image/jpeg", byteSize: bytes.length, analyzable: true });
  expect(attached.alreadyAttached).toBe(false);
  expect((await callA("attach_item_photo", args)).alreadyAttached).toBe(true);

  const listed = await callA("list_item_photos", { itemId: itemA });
  expect(listed.photos).toEqual([expect.objectContaining({ documentId: started.documentId, fileName: "IMG_0001.jpeg" })]);
  expect(JSON.stringify(listed)).not.toMatch(/storage_path|signedUrl|token=/);
});

it("rejects mismatched hashes and non-images and removes the rejected upload", async () => {
  const bytes = jpeg("a2");
  const started = await callA("create_item_photo_upload", { itemId: itemA, mimeType: "image/jpeg" });
  await put(started.upload, bytes);
  await expect(callA("attach_item_photo", { itemId: itemA, documentId: started.documentId, fileName: "x.jpeg", sha256: "0".repeat(64) })).rejects.toThrow(/do not match/);
  // The rejected object is gone, so a retry cannot attach it.
  await expect(callA("attach_item_photo", { itemId: itemA, documentId: started.documentId, fileName: "x.jpeg" })).rejects.toThrow(/No upload found/);

  const text = await callA("create_item_photo_upload", { itemId: itemA, mimeType: "image/png" });
  await put({ url: text.upload.url, headers: { "content-type": "image/png" } }, new TextEncoder().encode("not an image"));
  await expect(callA("attach_item_photo", { itemId: itemA, documentId: text.documentId, fileName: "x.png" })).rejects.toThrow(/not a JPEG, PNG or WebP/);
  expect((await callA("list_item_photos", { itemId: itemA })).photos).toHaveLength(1);
});

it("keeps photos and items isolated between renters", async () => {
  await expect(callB("create_item_photo_upload", { itemId: itemA, mimeType: "image/jpeg" })).rejects.toThrow(/Item not found/);
  await expect(callB("list_item_photos", { itemId: itemA })).rejects.toThrow(/Item not found/);
  await expect(callB("analyze_item_photos", { itemId: itemA })).rejects.toThrow(/Item not found/);
  await expect(callB("update_item", { itemId: itemA, name: "Taken" })).rejects.toThrow();

  const [photoA] = (await callA("list_item_photos", { itemId: itemA })).photos;
  // B cannot attach A's upload to B's own item: the object is not in B's folder.
  await expect(callB("attach_item_photo", { itemId: itemB, documentId: photoA.documentId, fileName: "steal.jpeg" })).rejects.toThrow();
  const foreign = await b.db.from("documents").select("id").eq("id", photoA.documentId);
  expect(foreign.data).toEqual([]);
  expect((await a.db.from("items").select("name").eq("id", itemA).single()).data?.name).toBe("Synthetic mouse");
});

it("asks for a photo before analysis", async () => {
  await expect(callB("analyze_item_photos", { itemId: itemB })).rejects.toThrow(/Attach a photo/);
});

it("binds the exact approved photos into the listing and hands Muse only those", async () => {
  const updated = await callA("update_item", { itemId: itemA, name: "Synthetic wireless mouse", askUsd: 45, condition: "Used" });
  expect(updated).toMatchObject({ name: "Synthetic wireless mouse", ask_cents: 4500, condition: "Used" });
  await callA("set_item_disposition", { itemId: itemA, disposition: "sell" });
  const [photo] = (await callA("list_item_photos", { itemId: itemA })).photos;

  const draft = await callA("prepare_facebook_listing", { itemId: itemA, title: "Synthetic wireless mouse", body: "Synthetic listing body.", priceUsd: 45 });
  expect(draft.action.payload.photos).toEqual([{ documentId: photo.documentId, sha256: photo.sha256 }]);
  expect(draft.photo_note).toBeUndefined();
  await expect(callA("prepare_facebook_listing", { itemId: itemA, photoDocumentIds: [crypto.randomUUID()] })).rejects.toThrow(/not attached/);

  await market.approveAction(a, { actionId: draft.action.id, payloadHash: draft.action.payload_hash });
  const task = (await bridge.listTasks({ ownerId: a.user.id })).find((t) => t.taskId === draft.action.id)!;
  expect(task.photoUrls).toHaveLength(1);
  expect(task).toMatchObject({ missingPhotos: 0, photos: [expect.objectContaining({ documentId: photo.documentId, sha256: photo.sha256 })] });
  expect(task.instructions).toContain("attach exactly the photos");
  expect(await bridge.listTasks({ ownerId: b.user.id })).toEqual([]);

  // A stored photo that no longer matches the approved hash is withheld.
  await serviceClient().from("documents").update({ sha256: "f".repeat(64) }).eq("id", photo.documentId);
  const changed = (await bridge.listTasks({ ownerId: a.user.id })).find((t) => t.taskId === draft.action.id)!;
  expect(changed).toMatchObject({ photoUrls: [], missingPhotos: 1 });
});

it("labels a draft without photos", async () => {
  await callB("set_item_disposition", { itemId: itemB, disposition: "sell" });
  const draft = await callB("prepare_facebook_listing", { itemId: itemB, priceUsd: 5 });
  expect(draft.action.payload.photos).toEqual([]);
  expect(draft.photo_note).toMatch(/No photos/);
});
