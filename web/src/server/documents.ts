import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { ToolContext } from "./auth";
import { readLease, readPdf } from "./domain/lease-pipeline";
export const MAX_LEASE_BYTES = 20 * 1024 * 1024;
const uuid = z.uuid();
export async function prepareLeaseUpload(ctx: ToolContext, moveId: string) {
  uuid.parse(moveId);
  const { data, error } = await ctx.db.from("moves").select("id").eq("id", moveId).eq("owner_id", ctx.user.id).single();
  if (error || !data) throw new Error("Move not found");
  const documentId = randomUUID();
  const path = `${ctx.user.id}/${moveId}/${documentId}.pdf`;
  const signed = await ctx.db.storage.from("move-files").createSignedUploadUrl(path);
  if (signed.error) throw signed.error;
  return { documentId, moveId, path, token: signed.data.token };
}
export async function registerDocument(ctx: ToolContext, input: unknown) {
  const { documentId, moveId, name } = z.object({ documentId: uuid, moveId: uuid, name: z.string().min(1).max(255) }).parse(input);
  const path = `${ctx.user.id}/${moveId}/${documentId}.pdf`;
  const bucket = ctx.db.storage.from("move-files");
  const existing = await ctx.db.from("documents").select("id").eq("id", documentId).eq("owner_id", ctx.user.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return readLease(ctx, documentId); // safe retry; never delete a registered file
  let inserted = false;
  try {
    const { data: move, error: moveError } = await ctx.db.from("moves").select("id").eq("id", moveId).eq("owner_id", ctx.user.id).single();
    if (moveError || !move) throw new Error("Move not found");
    const { data: blob, error } = await bucket.download(path);
    if (error) throw error;
    if (blob.type.split(";")[0] !== "application/pdf" || !blob.size || blob.size > MAX_LEASE_BYTES) throw new Error("Upload a PDF of at most 20 MB");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") throw new Error("Invalid PDF");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const parsed = await readPdf(bytes);
    const result = await ctx.db.from("documents").insert({ id: documentId, move_id: moveId,
      kind: "lease", storage_path: path, original_name: name, mime_type: "application/pdf",
      byte_size: blob.size, sha256, page_count: parsed.pageCount });
    if (result.error) throw result.error;
    inserted = true;
    return await readLease(ctx, documentId, parsed);
  } catch (e) {
    // Preserve registered documents if parsing persistence failed: Re-read can retry.
    if (!inserted) {
      // A concurrent successful registration must not lose its object.
      const check = await ctx.db.from("documents").select("id").eq("id", documentId).maybeSingle();
      if (!check.error && !check.data) {
        const removed = await bucket.remove([path]);
        if (removed.error) throw new Error("Registration failed and upload cleanup failed. Retry deleting this upload from your account.", { cause: e });
      }
    }
    throw e;
  }
}
export async function deleteDocument(ctx: ToolContext, documentId: string) {
  uuid.parse(documentId);
  const { data, error } = await ctx.db.from("documents").select("storage_path").eq("id", documentId).eq("owner_id", ctx.user.id).maybeSingle();
  if (error) throw error;
  if (!data) return;
  const removed = await ctx.db.storage.from("move-files").remove([data.storage_path]);
  if (removed.error) throw removed.error;
  const deleted = await ctx.db.from("documents").delete().eq("id", documentId).eq("owner_id", ctx.user.id);
  if (deleted.error) throw deleted.error;
}
export async function documentUrl(ctx: ToolContext, documentId: string, download = false) {
  uuid.parse(documentId);
  const { data, error } = await ctx.db.from("documents").select("storage_path,original_name").eq("id", documentId).single();
  if (error) throw new Error("Document not found");
  const signed = await ctx.db.storage.from("move-files").createSignedUrl(data.storage_path, 60,
    { download: download ? data.original_name ?? true : false });
  if (signed.error) throw signed.error;
  return signed.data.signedUrl;
}
