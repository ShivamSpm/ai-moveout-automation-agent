// Household sharing check against a hosted Supabase project.
//
// Creates three pre-confirmed throwaway users on example.test (owner A, member
// B, stranger C; no email is sent). A shares a lease with a household, B joins
// through the invite RPC, and the script checks that B can read the shared
// document, file and tasks but nothing else, that C sees nothing, and that A's
// account cannot be deleted while B is an active member. Everything is removed
// afterwards. Refuses to run without HOSTED_CHECK_CONFIRM=1.

import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (process.env.HOSTED_CHECK_CONFIRM !== "1") throw new Error("Set HOSTED_CHECK_CONFIRM=1 to run against a hosted project");
if (!url || !publishable || !secret) throw new Error("Supabase URL, publishable key and secret key are required");

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, opts);
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

async function makeUser(label) {
  const email = `household-${label}-${randomBytes(4).toString("hex")}@example.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const db = createClient(url, publishable, opts);
  const signIn = await db.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, db };
}

const users = [];
let memberId;
try {
  const a = await makeUser("owner");
  const b = await makeUser("member");
  const c = await makeUser("stranger");
  users.push(a, b, c);

  const household = await a.db.from("households").insert({ name: "Isolation household" }).select("id").single();
  check("A creates a household", !household.error, household.error?.message);
  const move = await a.db.from("moves").insert({ title: "Household check", address_private: "1 Synthetic Way", household_id: household.data?.id }).select("id").single();
  check("A attaches a move to it", !move.error, move.error?.message);

  const docId = crypto.randomUUID();
  const path = `${a.id}/${move.data?.id}/${docId}.pdf`;
  const up = await a.db.storage.from("move-files").upload(path, pdf, { contentType: "application/pdf" });
  const doc = await a.db.from("documents").insert({
    id: docId, move_id: move.data?.id, kind: "lease", storage_path: path, original_name: "synthetic.pdf",
    mime_type: "application/pdf", byte_size: pdf.length, sha256: createHash("sha256").update(pdf).digest("hex"), page_count: 1,
  }).select("id").single();
  check("A uploads and registers a shared lease", !up.error && !doc.error, up.error?.message ?? doc.error?.message);
  const task = await a.db.from("tasks").insert({ move_id: move.data?.id, document_id: docId, task_key: "notice", lane: "landlord", title: "Send notice", source: "Lease p.1", source_kind: "lease" }).select("id").single();
  check("A has a lease task", !task.error, task.error?.message);

  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invite = await a.db.rpc("invite_household_member", { h: household.data?.id, email: b.email, token_hash: tokenHash });
  check("A invites B", !invite.error, invite.error?.message);
  memberId = invite.data;

  const pendingRead = await b.db.from("documents").select("id").eq("id", docId);
  check("Invited (not yet accepted) B sees nothing", !pendingRead.error && pendingRead.data?.length === 0, pendingRead.error?.message);

  const wrongAccept = await c.db.rpc("accept_household_invite", { token_hash: tokenHash });
  check("C cannot accept B's invite", Boolean(wrongAccept.error), wrongAccept.error ? "" : "accepted");

  const accept = await b.db.rpc("accept_household_invite", { token_hash: tokenHash });
  check("B accepts with the invited email", !accept.error, accept.error?.message);

  const bDoc = await b.db.from("documents").select("id").eq("id", docId);
  check("B reads the shared document", !bDoc.error && bDoc.data?.length === 1, bDoc.error?.message);
  const bFile = await b.db.storage.from("move-files").download(path);
  check("B downloads the shared file", !bFile.error, bFile.error?.message);
  const bTask = await b.db.from("tasks").select("id").eq("id", task.data?.id);
  check("B reads the lease task", !bTask.error && bTask.data?.length === 1, bTask.error?.message);
  const bTaskUpdate = await b.db.from("tasks").update({ status: "done" }).eq("id", task.data?.id).select("id");
  check("B cannot update A's task", !bTaskUpdate.error ? bTaskUpdate.data?.length === 0 : true, bTaskUpdate.error?.message);
  const bMove = await b.db.from("moves").select("address_private").eq("id", move.data?.id);
  check("B cannot read A's private address", !bMove.error ? bMove.data?.length === 0 : true, bMove.error?.message);
  const bDelete = await b.db.storage.from("move-files").remove([path]);
  const stillThere = await a.db.storage.from("move-files").download(path);
  check("B cannot delete A's file", !stillThere.error, bDelete.error?.message ?? "");
  const bActions = await b.db.from("actions").select("id");
  check("B sees no actions", !bActions.error ? bActions.data?.length === 0 : true, bActions.error?.message);

  for (const [label, client] of [["C", c.db], ["signed-out", createClient(url, publishable, opts)]]) {
    const r1 = await client.from("documents").select("id").eq("id", docId);
    const r2 = await client.from("households").select("id").eq("id", household.data?.id);
    const r3 = await client.storage.from("move-files").download(path);
    check(`${label} sees no document, household or file`, (r1.data ?? []).length === 0 && (r2.data ?? []).length === 0 && Boolean(r3.error));
  }

  const blocked = await admin.auth.admin.deleteUser(a.id);
  check("A's account deletion is blocked while B is active", Boolean(blocked.error), blocked.error ? "" : "deleted");

  const unshare = await a.db.from("documents").update({ shared_with_household: false }).eq("id", docId);
  const afterUnshare = await b.db.from("documents").select("id").eq("id", docId);
  check("Unsharing removes B's access", !unshare.error && (afterUnshare.data ?? []).length === 0, unshare.error?.message);

  const revoke = await a.db.rpc("revoke_household_member", { member_id: memberId });
  check("A revokes B", !revoke.error, revoke.error?.message);
} finally {
  // Members first, so the owner's deletion guard no longer applies.
  for (const u of [...users].reverse()) {
    const { data } = await admin.storage.from("move-files").list(u.id, { limit: 1000 });
    for (const folder of data ?? []) {
      const inner = await admin.storage.from("move-files").list(`${u.id}/${folder.name}`, { limit: 1000 });
      const paths = (inner.data ?? []).map((f) => `${u.id}/${folder.name}/${f.name}`);
      if (paths.length) await admin.storage.from("move-files").remove(paths);
    }
    await admin.auth.admin.deleteUser(u.id);
  }
  const leftover = await Promise.all(users.map((u) => admin.auth.admin.getUserById(u.id)));
  check("Test users removed", leftover.every((r) => !r.data?.user));
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
