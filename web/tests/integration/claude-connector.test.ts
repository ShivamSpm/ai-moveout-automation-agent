// Runs against the local Supabase stack (`supabase start`) with synthetic
// users. Exercises the database guarantees the Muse bridge depends on.

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
const { resolveCaller } = await import("@/server/connector/identity");
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
let client: Client;
const clients: Client[] = [];
let taskA: string, taskB: string, docB: string;
async function connect(caller: Parameters<typeof buildMcpServer>[0]) {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await buildMcpServer(caller).connect(s);
  const client = new Client({ name: 'connector-test', version: '1' });
  await client.connect(c);
  clients.push(client);
  return client;
}
async function call(name: string, args: Record<string, unknown> = {}) {
  const response = await client.callTool({ name, arguments: args });
  if (response.isError) throw new Error(JSON.stringify(response.content));
  return response.structuredContent as Record<string, unknown>;
}
beforeAll(async () => {
  process.env.APP_URL = 'https://vacate.example.test';
  a = await renter('claude-a'); b = await renter('claude-b');
  for (const [ctx, label] of [[a, 'a'], [b, 'b']] as const) {
    const move = await market.currentMove(ctx);
    const task = await ctx.db.from('tasks').insert({ move_id: move.id, task_key: 'notice', lane: 'landlord', title: `Notice-${label}`, source: 'Lease p.2', source_kind: 'lease', due_date: '2026-11-01' }).select().single();
    const doc = await ctx.db.from('documents').insert({ move_id: move.id, kind: 'lease', storage_path: `${ctx.user.id}/synthetic.pdf`, original_name: `lease-${label}.pdf`, mime_type: 'application/pdf', byte_size: 100, sha256: label.repeat(64), page_count: 2 }).select().single();
    if (task.error || doc.error) throw task.error ?? doc.error;
    const findings = await ctx.db.from('lease_findings').insert([
      { move_id: move.id, document_id: doc.data.id, rule_key: 'notice_days', value: { days: 30 }, quote: `Quote-${label}: 30 days written notice.`, page: 2, confidence: 'medium', extractor: 'pattern' },
      { move_id: move.id, document_id: doc.data.id, rule_key: 'key_return', value: null, quote: null, page: null, confidence: 'unresolved', extractor: 'pattern' },
    ]);
    if (findings.error) throw findings.error;
    if (ctx === a) taskA = task.data.id; else { taskB = task.data.id; docB = doc.data.id; }
    const item = await market.addItem(ctx, { name: `Chair-${label}`, askUsd: 10 });
    await market.setDisposition(ctx, { itemId: item.id, disposition: 'sell' });
    const { action, listing } = await market.prepareFacebookListing(ctx, { itemId: item.id });
    await market.approveAction(ctx, { actionId: action.id, payloadHash: action.payload_hash });
    await bridge.claimTask({ ownerId: ctx.user.id }, { taskId: action.id, payloadHash: action.payload_hash });
    await bridge.reportResult({ ownerId: ctx.user.id }, { taskId: action.id, payloadHash: action.payload_hash, status: 'unknown', note: 'Synthetic test; no external post.' });
    const relayed = await bridge.relayBuyerMessage({ ownerId: ctx.user.id }, { listingId: listing.id, buyerName: `buyer-${label}@example.test`, message: `message-${label}`, threadRef: `synthetic-${crypto.randomUUID()}` });
    const reservation = await ctx.db.from('reservations').insert({ item_id: item.id, conversation_id: relayed.conversationId, status: 'held' });
    if (reservation.error) throw reservation.error;
  }
  client = await connect({ kind: 'renter', ctx: a });
});
afterAll(async () => {
  await Promise.all(clients.map(c => c.close()));
  for (const ctx of [a, b]) if (ctx) await serviceClient().auth.admin.deleteUser(ctx.user.id);
});
it('exposes schemas to renters, only muse tools and no private UI to vac_ executors', async () => {
  const tools = (await client.listTools()).tools;
  for (const name of ['get_move_status','get_checklist','set_task_status','list_documents','get_lease_findings','get_activity','get_app_links']) {
    expect(tools.find(t => t.name === name)).toMatchObject({ inputSchema: { type: 'object' }, outputSchema: { type: 'object' } });
  }
  const token = await bridge.createConnectorToken(a.db);
  const exec = await connect(await resolveCaller(`Bearer ${token.token}`));
  expect((await exec.listTools()).tools.every(t => t.name.startsWith('muse_'))).toBe(true);
  expect((await exec.callTool({ name: 'get_checklist', arguments: {} })).isError).toBe(true);
  expect((await client.listResources()).resources[0].uri).toBe('ui://vacate/move-progress.html');
});
it('isolates checklist, metadata, findings and activity, including explicit foreign IDs', async () => {
  const checklist = await call('get_checklist');
  expect(checklist.tasks).toEqual([expect.objectContaining({ id: taskA, page: 2, lane: 'landlord', status: 'todo' })]);
  expect((await call('get_checklist', { taskId: taskB })).tasks).toEqual([]);
  expect((await call('get_checklist', { lane: 'cleaning' })).tasks).toEqual([]);
  expect((await call('list_documents', { documentId: docB })).documents).toEqual([]);
  expect((await call('get_lease_findings', { documentId: docB })).findings).toEqual([]);
  const docs = await call('list_documents');
  expect(JSON.stringify(docs)).toContain('lease-a.pdf');
  expect(JSON.stringify(docs)).not.toMatch(/lease-b|storage_path|signedUrl|sha256/);
  const findings = await call('get_lease_findings');
  expect(JSON.stringify(findings)).toContain('Quote-a');
  expect(JSON.stringify(findings)).not.toContain('Quote-b');
  expect(findings.findings).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'key_return', not_found: true })]));
  expect(findings.summary).toContain('not legal advice');
  const activity = await call('get_activity');
  expect(JSON.stringify(activity)).toContain('message-a');
  expect(JSON.stringify(activity)).not.toContain('message-b');
  const bListings = await b.db.from('listings').select('id');
  for (const row of bListings.data ?? []) expect(JSON.stringify(activity)).not.toContain(row.id);
  expect(activity.activity).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'reservation.snapshot', verified: false })]));
  expect(activity.activity).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'action.unknown', actor: 'muse', verified: false, link: expect.stringMatching(/^https:\/\/vacate.example.test\/muse#listing-/) })]));
});
it('refuses foreign task updates, saves owner status, and validates inputs', async () => {
  await expect(call('set_task_status', { taskId: taskB, status: 'done' })).rejects.toThrow();
  expect(await call('set_task_status', { taskId: taskA, status: 'done' })).toMatchObject({ id: taskA, status: 'done' });
  expect((await b.db.from('tasks').select('status').eq('id', taskB).single()).data?.status).toBe('todo');
  await expect(call('get_activity', { limit: 101 })).rejects.toThrow();
  await expect(call('get_checklist', { lane: 'evict tenants' })).rejects.toThrow();
});
it('returns configured links, review links, progress and safe self-contained HTML', async () => {
  const links = await call('get_app_links', { actionId: taskA, listingId: taskA, conversationId: taskA });
  expect(Object.values(links.app_links as object).every(v => String(v).startsWith(process.env.APP_URL!))).toBe(true);
  const item = await market.addItem(a, { name: 'Synthetic lamp' });
  await market.setDisposition(a, { itemId: item.id, disposition: 'sell' });
  const draft = await call('prepare_facebook_listing', { itemId: item.id });
  expect((draft.links as Record<string,string>).review).toContain('/muse#action-');
  expect(draft.summary).toContain('Nothing is sent or posted until approved');
  const status = await call('get_move_status');
  expect(status.progress).toMatchObject({ checklist: { done: 1 }, approvals_waiting: 1 });
  const resource = await client.readResource({ uri: 'ui://vacate/move-progress.html' });
  const html = "text" in resource.contents[0] ? resource.contents[0].text : "";
  expect(html).toContain('Open in Vacate');
  expect(html).not.toMatch(/<script[^>]+src=|SUPABASE_SECRET|access_token/);
  expect(html).not.toContain('message-b');
});
