// Cross-account isolation check against a hosted Supabase project.
//
// Creates two pre-confirmed throwaway users on example.test (no email is sent),
// verifies that each can reach only their own move and files through RLS, then
// deletes both users and their objects. Reads URL and keys from the environment
// and never prints them. Refuses to run without HOSTED_CHECK_CONFIRM=1.
//
//   HOSTED_CHECK_CONFIRM=1 NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… \
//   SUPABASE_SECRET_KEY=… node scripts/hosted-isolation-check.mjs

import { randomBytes } from "node:crypto";
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

// Minimal valid one-page PDF, synthetic content only.
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

async function makeUser(label) {
  const email = `isolation-${label}-${randomBytes(4).toString("hex")}@example.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const db = createClient(url, publishable, opts);
  const signIn = await db.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, db };
}

const users = [];
try {
  const a = await makeUser("a");
  users.push(a);
  const b = await makeUser("b");
  users.push(b);

  const created = await a.db.from("moves").insert({ title: "Isolation check", address_private: "1 Synthetic Way" }).select("id").single();
  check("A creates own move", !created.error, created.error?.message);
  const moveId = created.data?.id;

  const aUpdate = await a.db.from("moves").update({ landlord_name: "Synthetic Landlord" }).eq("id", moveId).select("id");
  check("A updates own move", !aUpdate.error && aUpdate.data?.length === 1, aUpdate.error?.message);

  const bRead = await b.db.from("moves").select("id").eq("id", moveId);
  check("B cannot read A's move by id", !bRead.error && bRead.data?.length === 0, bRead.error?.message);

  const bUpdate = await b.db.from("moves").update({ landlord_name: "Changed by B" }).eq("id", moveId).select("id");
  check("B cannot update A's move", !bUpdate.error && bUpdate.data?.length === 0, bUpdate.error?.message);

  const bInsertTask = await b.db.from("tasks").insert({ move_id: moveId, owner_id: a.id, task_key: "x", lane: "admin", title: "x", source_kind: "plan" });
  check("B cannot insert a task into A's move", Boolean(bInsertTask.error), bInsertTask.error ? "" : "insert succeeded");

  const path = `${a.id}/${moveId}/isolation.pdf`;
  const up = await a.db.storage.from("move-files").upload(path, pdf, { contentType: "application/pdf" });
  check("A uploads to own folder", !up.error, up.error?.message);

  const bDownload = await b.db.storage.from("move-files").download(path);
  check("B cannot download A's file by exact path", Boolean(bDownload.error), bDownload.error ? "" : "download succeeded");

  const bSigned = await b.db.storage.from("move-files").createSignedUrl(path, 60);
  check("B cannot sign A's file", Boolean(bSigned.error), bSigned.error ? "" : "signed URL issued");

  const bUpload = await b.db.storage.from("move-files").upload(`${a.id}/${moveId}/intruder.pdf`, pdf, { contentType: "application/pdf" });
  check("B cannot upload into A's folder", Boolean(bUpload.error), bUpload.error ? "" : "upload succeeded");

  await b.db.storage.from("move-files").remove([path]);
  const stillThere = await a.db.storage.from("move-files").download(path);
  check("B cannot delete A's file", !stillThere.error, stillThere.error?.message);

  const anon = createClient(url, publishable, opts);
  const anonRead = await anon.from("moves").select("id").eq("id", moveId);
  check("Signed-out client cannot read moves", !anonRead.error ? anonRead.data?.length === 0 : true, anonRead.error?.message);

  const bucket = await admin.storage.getBucket("move-files");
  check("move-files bucket is private", bucket.data && bucket.data.public === false, bucket.error?.message);
} finally {
  for (const u of users) {
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
