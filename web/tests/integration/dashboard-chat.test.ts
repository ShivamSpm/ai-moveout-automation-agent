import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/supabase";
import type { Database } from "@/server/db/database.types";
import type { ToolContext } from "@/server/auth";
const state = vi.hoisted(() => ({ db: null as Db | null, complete: vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Review your checklist in /plan." } }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0.001 } }), { status: 200 })) }));
vi.mock("@/server/supabase", async original => ({ ...await original<typeof import("@/server/supabase")>(), userClient: async () => state.db! }));
vi.mock("@/server/integrations/openrouter", async original => ({ ...await original<typeof import("@/server/integrations/openrouter")>(), isConfigured: () => true, complete: state.complete }));
vi.mock("@/server/tools/identify-items", async original => {
  const real = await original<typeof import("@/server/tools/identify-items")>();
  const { SpendLedger } = await import("@/server/integrations/spend-ledger");
  const pricing = { prompt: 0.000001, completion: 0.000001, image: 0, request: 0, internalReasoning: null };
  return { ...real, loadIdentifyItemsDeps: async () => ({ openRouter: { apiKey: "synthetic", baseUrl: "https://model.example.test", fetch: state.complete }, ledger: new SpendLedger(1), pricing: new Map([[process.env.OPENROUTER_MODEL?.trim() || "anthropic/claude-opus-5.5", { id: "synthetic", pricing }]]) }) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
for (const line of readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Local Supabase required");
const { serviceClient } = await import("@/server/supabase");
const { getMoveView, getChecklist, getLeaseFindings, getActivity } = await import("@/server/move-view");
const { POST } = await import("@/app/api/chat/route");
const { setTaskStatus } = await import("@/app/plan/actions");
const { createHousehold, inviteMember, acceptInvite } = await import("@/server/households");
const admin = serviceClient(), people: ToolContext[] = [];
const client = () => createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
let a: ToolContext, b: ToolContext, member: ToolContext, taskA: string, household: string;
beforeAll(async () => {
  for (let i = 0; i < 3; i++) {
    const email = `dashboard-${crypto.randomUUID()}@example.test`, password = crypto.randomUUID();
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (made.error) throw made.error;
    const db = client(), signed = await db.auth.signInWithPassword({ email, password }); if (signed.error) throw signed.error;
    people.push({ db, user: signed.data.user });
  }
  [a, b, member] = people;
  household = (await createHousehold(a, "Synthetic household")).id;
  await acceptInvite(member, await inviteMember(a, household, member.user.email!));
  for (const [ctx, label] of [[a, "A"], [b, "B"]] as const) {
    const move = await ctx.db.from("moves").insert({ title: `Move-${label}`, address_private: `PRIVATE-${label}`, move_out_date: "2026-12-01", ...(label === "A" ? { household_id: household } : {}) }).select().single();
    if (move.error) throw move.error;
    const doc = await ctx.db.from("documents").insert({ move_id: move.data.id, kind: "lease", storage_path: `${ctx.user.id}/synthetic.pdf`, original_name: `lease-${label}.pdf`, mime_type: "application/pdf", byte_size: 100, sha256: "a".repeat(64), shared_with_household: true }).select().single();
    if (doc.error) throw doc.error;
    const task = await ctx.db.from("tasks").insert({ move_id: move.data.id, document_id: doc.data.id, task_key: "notice", lane: "landlord", title: `Task-${label}`, source_kind: "lease", source: "Lease p.2", due_date: "2026-11-01" }).select().single();
    if (task.error) throw task.error; if (label === "A") taskA = task.data.id;
    const finding = await ctx.db.from("lease_findings").insert({ move_id: move.data.id, document_id: doc.data.id, rule_key: "notice_days", value: { days: 30 }, quote: `Quote-${label}`, page: 2, confidence: "medium", extractor: "pattern" });
    if (finding.error) throw finding.error;
    const action = await ctx.db.from("actions").insert({ move_id: move.data.id, kind: "gmail.send", title: `Action-${label}`, payload: {} }).select().single();
    if (action.error) throw action.error;
    const event = await admin.from("action_events").insert({ action_id: action.data.id, owner_id: ctx.user.id, event: `Event-${label}`, detail: {} });
    if (event.error) throw event.error;
  }
});
afterAll(async () => {
  await admin.from("household_members").delete().eq("household_id", household);
  for (const ctx of people) await admin.auth.admin.deleteUser(ctx.user.id);
});
describe.sequential("Saved dashboard and renter chat", () => {
  it("never reads another renter's tasks, findings, approvals or activity", async () => {
    const view = await getMoveView(a), serialized = JSON.stringify(view);
    for (const label of ["Task-A", "Quote-A", "Action-A", "Event-A"]) expect(serialized).toContain(label);
    for (const label of ["Task-B", "Quote-B", "Action-B", "Event-B", "PRIVATE-B"]) expect(serialized).not.toContain(label);
    expect(view.sharedTasks).toEqual([]);
    expect(await getChecklist(a, {})).toEqual(view.tasks);
    expect(await getLeaseFindings(a)).toEqual(view.findings);
    expect(await getActivity(a, { limit: 15 })).toEqual(view.activity);
  });
  it("shows shared lease tasks separately, without granting write access", async () => {
    const view = await getMoveView(member);
    expect(view.move).toBeNull(); expect(view.tasks).toEqual([]);
    expect(view.sharedTasks.map(t => t.id)).toContain(taskA);
    state.db = member.db;
    const form = new FormData(); form.set("id", taskA); form.set("status", "done");
    expect(await setTaskStatus(form)).toHaveProperty("error");
    expect((await getMoveView(a)).tasks.find(t => t.id === taskA)?.status).toBe("todo");
    state.db = a.db;
    expect(await setTaskStatus(form)).toEqual({ message: "Task updated" });
    expect((await getMoveView(a)).tasks.find(t => t.id === taskA)?.status).toBe("done");
  });
  it("rejects anonymous chat, then sends only A's bounded context to the stubbed model", async () => {
    const request = () => new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "What next?" }] }) });
    state.db = client(); expect((await POST(request())).status).toBe(401);
    state.db = a.db; expect((await POST(request())).status).toBe(200);
    const call = state.complete.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.stringify(JSON.parse(String(call[1].body)).messages);
    expect(sent).toContain("Quote-A"); expect(sent).toContain("renter_context");
    expect(sent).toContain("untrusted data"); expect(sent).not.toContain("PRIVATE-A");
    expect(sent).not.toContain("Quote-B"); expect(sent).not.toContain("Event-B");
    expect((await getMoveView(a)).chat).toEqual([{ role: "user", content: "What next?" }, { role: "assistant", content: "Review your checklist in /plan." }]);
    expect((await getMoveView(b)).chat).toEqual([]);
  });
});
