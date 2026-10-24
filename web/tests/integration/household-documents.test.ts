import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/server/db/database.types";
import type { ToolContext } from "@/server/auth";
import { syntheticPdf } from "../../../fixtures/synthetic/generate-lease";
for (const line of readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
 const m = line.match(/^([A-Z_]+)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2];
}
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("Local Supabase required");
const {serviceClient} = await import("@/server/supabase");
const {prepareLeaseUpload,registerDocument,deleteDocument,documentUrl} = await import("@/server/documents");
const {readLease} = await import("@/server/domain/lease-pipeline");
const {createHousehold,inviteMember,acceptInvite,revokeMember} = await import("@/server/households");
const {closeAccount,removeAccountFiles} = await import("@/server/account-deletion");
const admin=serviceClient(), people: ToolContext[]=[];
async function renter(label:string) {
 const email=`storage-${label}-${crypto.randomUUID()}@example.test`,password=crypto.randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true}); if(made.error) throw made.error;
 const db=createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.signInWithPassword({email,password}); if(error) throw error;
 const ctx={db,user:data.user}; people.push(ctx); return ctx;
}
let a:ToolContext,b:ToolContext,c:ToolContext,invited:ToolContext;
let moveId:string,householdId:string,documentId:string,storagePath:string;
const fixture=readFileSync(path.resolve(__dirname,"../../../fixtures/synthetic/lease.pdf"));
async function upload(ctx:ToolContext,bytes:Buffer=fixture,move=moveId) {
 const prepared=await prepareLeaseUpload(ctx,move);
 expect((await ctx.db.storage.from("move-files").uploadToSignedUrl(prepared.path,prepared.token,bytes,{contentType:"application/pdf"})).error).toBeNull();
 return prepared;
}
beforeAll(async()=>{
 [a,b,c,invited]=await Promise.all([renter("owner"),renter("member"),renter("stranger"),renter("invited")]);
 householdId=(await createHousehold(a,"Synthetic household")).id;
 const move=await a.db.from("moves").insert({title:"Synthetic move",address_private:"Synthetic private address",move_out_date:"2026-12-31",household_id:householdId}).select().single();
 if(move.error) throw move.error; moveId=move.data.id;
 await acceptInvite(b,await inviteMember(a,householdId,b.user.email!));
 await inviteMember(a,householdId,invited.user.email!);
});
afterAll(async()=>{
 await admin.from("household_members").delete().eq("household_id",householdId);
 for(const ctx of people){await removeAccountFiles(ctx).catch(()=>{});await admin.auth.admin.deleteUser(ctx.user.id);}
});
describe.sequential("Household documents (local Supabase)",()=>{
 it("uploads unchanged PDF; registers hash, pages, findings and lease tasks",async()=>{
  const prepared=await upload(a);documentId=prepared.documentId;storagePath=prepared.path;
  expect((await registerDocument(a,{...prepared,name:"synthetic.pdf"})).scanned).toBe(false);
  expect((await a.db.from("documents").select("*").eq("id",documentId).single()).data).toMatchObject({owner_id:a.user.id,page_count:4,sha256:createHash("sha256").update(fixture).digest("hex"),byte_size:fixture.length});
  const findings=(await a.db.from("lease_findings").select("*").eq("document_id",documentId)).data!;
  expect(findings).toHaveLength(5);expect(findings.every(f=>f.page && f.quote && f.extractor==="pattern")).toBe(true);
  const tasks=(await a.db.from("tasks").select("*").eq("move_id",moveId)).data!;
  expect(tasks).toHaveLength(6);expect(tasks.every(t=>t.source_kind==="lease" && t.source?.startsWith("Lease p."))).toBe(true);
  expect(Buffer.from(await (await a.db.storage.from("move-files").download(storagePath)).data!.arrayBuffer())).toEqual(fixture);
  expect(await documentUrl(a,documentId)).toContain("token=");
 });
 it("re-read preserves done and skipped statuses without duplicates",async()=>{
  await a.db.from("tasks").update({status:"done"}).eq("move_id",moveId).eq("task_key","notice");
  await a.db.from("tasks").update({status:"skipped"}).eq("move_id",moveId).eq("task_key","carpet");
  await readLease(a,documentId);await readLease(a,documentId);
  const rows=(await a.db.from("tasks").select("task_key,status").eq("move_id",moveId)).data!;
  expect(rows).toHaveLength(6);expect(rows.find(t=>t.task_key==="notice")?.status).toBe("done");expect(rows.find(t=>t.task_key==="carpet")?.status).toBe("skipped");
 });
 it("member reads shared files/findings/tasks but cannot see private moves or mutate owner data",async()=>{
  expect((await b.db.from("documents").select("id").eq("id",documentId)).data).toHaveLength(1);
  expect((await b.db.from("lease_findings").select("id").eq("document_id",documentId)).data).toHaveLength(5);
  expect((await b.db.from("tasks").select("id").eq("move_id",moveId)).data).toHaveLength(6);
  expect((await b.db.storage.from("move-files").download(storagePath)).error).toBeNull();
  expect((await b.db.from("moves").select("address_private").eq("id",moveId)).data).toEqual([]);
  const safe=await b.db.rpc("household_moves");expect(safe.data?.find(m=>m.id===moveId)).toBeTruthy();expect(JSON.stringify(safe.data)).not.toContain("address_private");
  const action=await a.db.from("actions").insert({move_id:moveId,kind:"gmail.send",title:"Synthetic draft",payload:{}}).select("id").single();expect(action.error).toBeNull();
  for(const table of ["actions","messages","connector_tokens"] as const) expect((await b.db.from(table).select("*").eq("owner_id",a.user.id)).data).toEqual([]);
  expect((await b.db.from("tasks").update({status:"done"}).eq("move_id",moveId).select()).data).toEqual([]);
  await b.db.storage.from("move-files").remove([storagePath]);expect((await a.db.storage.from("move-files").download(storagePath)).error).toBeNull();
  expect((await b.db.storage.from("move-files").upload(`${a.user.id}/${moveId}/${crypto.randomUUID()}.pdf`,fixture,{contentType:"application/pdf"})).error).toBeTruthy();
 });
 it("strangers and unaccepted invitees cannot read exact document ids or storage paths",async()=>{
  for(const ctx of [c,invited]) {
   for(const table of ["documents","lease_findings","tasks"] as const) expect((await ctx.db.from(table).select("*").eq("move_id",moveId)).data).toEqual([]);
   expect((await ctx.db.from("documents").select("*").eq("id",documentId)).data).toEqual([]);
   expect((await ctx.db.storage.from("move-files").download(storagePath)).error).toBeTruthy();
   expect((await ctx.db.storage.from("move-files").createSignedUrl(storagePath,60)).error).toBeTruthy();await expect(documentUrl(ctx,documentId)).rejects.toThrow();
  }
 });
 it("unsharing removes member access to metadata, findings, tasks and file",async()=>{
  await a.db.from("documents").update({shared_with_household:false}).eq("id",documentId);
  for(const table of ["documents","lease_findings","tasks"] as const) expect((await b.db.from(table).select("*").eq("move_id",moveId)).data).toEqual([]);
  expect((await b.db.storage.from("move-files").download(storagePath)).error).toBeTruthy();
  await a.db.from("documents").update({shared_with_household:true}).eq("id",documentId);
 });
 it("rejects wrong email, expired tokens, direct self-acceptance and foreign household attachment",async()=>{
  const token=await inviteMember(a,householdId,invited.user.email!);await expect(acceptInvite(c,token)).rejects.toThrow(/different email/);
  await admin.from("household_members").update({expires_at:"2020-01-01T00:00:00Z"}).eq("invite_token_hash",createHash("sha256").update(token).digest("hex"));
  await expect(acceptInvite(invited,token)).rejects.toThrow(/expired/);
  expect((await invited.db.from("household_members").insert({household_id:householdId,user_id:invited.user.id,role:"member",status:"active",invited_email:invited.user.email!,accepted_at:new Date().toISOString()})).error).toBeTruthy();
  expect((await c.db.from("moves").insert({household_id:householdId})).error).toBeTruthy();
 });
 it("removes vanished unfinished tasks while retaining completed tasks",async()=>{
  expect((await a.db.rpc("save_lease_result",{doc:documentId,findings:[],plan:[]})).error).toBeNull();
  expect((await a.db.from("tasks").select("task_key,status").eq("move_id",moveId)).data).toEqual([{task_key:"notice",status:"done"}]);await readLease(a,documentId);
 });
 it("stores unresolved rules for scans and findings without guessing a missing move-out date",async()=>{
  const empty=await upload(a,syntheticPdf([""]));expect((await registerDocument(a,{...empty,name:"empty.pdf"})).message).toBe("We couldn't read text in this PDF");
  const rows=(await a.db.from("lease_findings").select("confidence,page").eq("document_id",empty.documentId)).data!;
  expect(rows).toHaveLength(5);expect(rows.every(f=>f.confidence==="unresolved" && f.page===null)).toBe(true);await deleteDocument(a,empty.documentId);
  const move=await a.db.from("moves").insert({title:"No date"}).select().single();const noDate=await upload(a,fixture,move.data!.id);
  expect((await registerDocument(a,{...noDate,name:"no-date.pdf"})).message).toBe("Add your move-out date to build the plan");expect((await a.db.from("tasks").select("id").eq("move_id",move.data!.id)).data).toEqual([]);await deleteDocument(a,noDate.documentId);
 });
 it("cleans invalid uploads and ignores forged owner/path fields",async()=>{
  const invalid=await upload(a,Buffer.from("not a PDF"));await expect(registerDocument(a,{...invalid,name:"bad.pdf",owner_id:c.user.id,path:"other/file.pdf"})).rejects.toThrow("Invalid PDF");expect((await a.db.storage.from("move-files").download(invalid.path)).error).toBeTruthy();
 });
 it("denies expired memberships and metadata pointing outside the owner folder",async()=>{
  const membership=(await a.db.from("household_members").select("id").eq("user_id",b.user.id).single()).data!;
  await admin.from("household_members").update({expires_at:"2020-01-01T00:00:00Z"}).eq("id",membership.id);
  expect((await b.db.from("documents").select("id").eq("id",documentId)).data).toEqual([]);
  expect((await b.db.storage.from("move-files").download(storagePath)).error).toBeTruthy();
  await admin.from("household_members").update({expires_at:null}).eq("id",membership.id);
  expect((await a.db.from("documents").update({storage_path:`${c.user.id}/unregistered.pdf`}).eq("id",documentId)).error).toBeTruthy();
 });
 it("stops before auth deletion when storage cleanup fails",async()=>{
  const bucket=c.db.storage.from("move-files");
  const list=vi.spyOn(bucket,"list").mockResolvedValueOnce({data:null,error:new Error("Synthetic storage failure")} as never);
  const from=vi.spyOn(c.db.storage,"from").mockReturnValue(bucket);
  await expect(closeAccount(c,"DELETE MY ACCOUNT")).rejects.toThrow("Synthetic storage failure");
  expect((await admin.auth.admin.getUserById(c.user.id)).error).toBeNull();
  list.mockRestore();from.mockRestore();
 });
 it("cleans every page and nested folder without skipping shrinking offsets",async()=>{
  const bucket=c.db.storage.from("move-files");
  // 105 real objects force a second listing page; a nested folder tests recursion.
  const names=Array.from({length:105},(_,i)=>`${c.user.id}/paging/${String(i).padStart(3,"0")}.pdf`);
  names.push(`${c.user.id}/paging/nested/test.pdf`);
  for(let i=0;i<names.length;i+=15) {
   const results=await Promise.all(names.slice(i,i+15).map(name=>bucket.upload(name,fixture,{contentType:"application/pdf"})));
   expect(results.every(r=>!r.error)).toBe(true);
  }
  await removeAccountFiles(c);await removeAccountFiles(c);
  expect((await bucket.list(c.user.id)).data).toEqual([]);
 });
 it("deletes file and metadata, cascades findings and unfinished tasks, retains done history",async()=>{
  await deleteDocument(a,documentId);await deleteDocument(a,documentId);
  expect((await a.db.storage.from("move-files").download(storagePath)).error).toBeTruthy();expect((await a.db.from("documents").select("id").eq("id",documentId)).data).toEqual([]);
  expect((await a.db.from("lease_findings").select("id").eq("document_id",documentId)).data).toEqual([]);expect((await a.db.from("tasks").select("status,document_id").eq("move_id",moveId)).data).toEqual([{status:"done",document_id:null}]);
 });
 it("blocks deletion for active members, wrong phrase or stale verified claims",async()=>{
  await expect(closeAccount(a,"no")).rejects.toThrow("DELETE MY ACCOUNT");await expect(closeAccount(a,"DELETE MY ACCOUNT")).rejects.toThrow("Remove active household");
  const spy=vi.spyOn(a.db.auth,"getClaims").mockResolvedValueOnce({data:{claims:{iat:1}},error:null} as never);await expect(closeAccount(a,"DELETE MY ACCOUNT")).rejects.toThrow("Sign in again");spy.mockRestore();expect((await admin.auth.admin.getUserById(a.user.id)).error).toBeNull();
 });
 it("revocation removes access; deletion resumes after cleanup and removes auth user, rows and orphan files",async()=>{
  const member=(await a.db.from("household_members").select("id").eq("user_id",b.user.id).single()).data!;await revokeMember(a,member.id);expect((await b.db.rpc("household_moves")).data).toEqual([]);
  await removeAccountFiles(a);const orphan=await upload(a),registered=await upload(a);await registerDocument(a,{...registered,name:"final.pdf"});await closeAccount(a,"DELETE MY ACCOUNT");
  expect((await admin.auth.admin.getUserById(a.user.id)).error).toBeTruthy();
  for(const table of ["moves","documents","tasks","lease_findings"] as const) expect((await admin.from(table).select("id").eq("owner_id",a.user.id)).data).toEqual([]);
  expect((await admin.storage.from("move-files").download(orphan.path)).error).toBeTruthy();expect((await admin.storage.from("move-files").download(registered.path)).error).toBeTruthy();
 });
});
