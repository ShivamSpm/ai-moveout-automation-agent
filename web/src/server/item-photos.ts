import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { MAX_PHOTO_BYTES } from "@/contracts/inventory";
import type { ToolContext } from "./auth";
import { MarketplaceError } from "./marketplace";
import { sniffPhotoMime } from "./tools/identify-items";

// Item photos for the connector. The renter's assistant asks for a one-time
// signed upload URL, PUTs the original bytes straight to private storage (no
// app body-size limit), then attaches the upload to the item. Originals are
// kept unchanged; the server records their size, type and SHA-256 itself.

export const MAX_ITEM_PHOTO_BYTES = 20 * 1024 * 1024; // move-files bucket limit
export const MAX_PHOTOS_PER_ITEM = 10;
const SIGNED_UPLOAD_SECONDS = 2 * 60 * 60; // Supabase signed upload URLs last two hours
const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, "Use the lowercase hex SHA-256 of the file");

async function ownItem(ctx: ToolContext, itemId: string) {
  const { data, error } = await ctx.db
    .from("items")
    .select("id, move_id, name")
    .eq("id", itemId)
    .eq("owner_id", ctx.user.id)
    .maybeSingle();
  if (error) throw new MarketplaceError(error.message, 500);
  if (!data) throw new MarketplaceError("Item not found", 404);
  return data;
}

const photoPath = (ownerId: string, moveId: string, documentId: string) => `${ownerId}/${moveId}/${documentId}`;

export const PreparePhotoUploadInput = z.object({
  itemId: z.uuid(),
  mimeType: z.enum(UPLOAD_TYPES),
});

export async function prepareItemPhotoUpload(ctx: ToolContext, input: z.infer<typeof PreparePhotoUploadInput>) {
  input = PreparePhotoUploadInput.parse(input);
  const item = await ownItem(ctx, input.itemId);
  const documentId = randomUUID();
  const signed = await ctx.db.storage
    .from("move-files")
    .createSignedUploadUrl(photoPath(ctx.user.id, item.move_id, documentId));
  if (signed.error) throw new MarketplaceError(`Could not start the upload: ${signed.error.message}`, 500);
  return {
    itemId: item.id,
    documentId,
    upload: {
      method: "PUT" as const,
      url: signed.data.signedUrl,
      headers: { "content-type": input.mimeType },
      maxBytes: MAX_ITEM_PHOTO_BYTES,
      expiresInSeconds: SIGNED_UPLOAD_SECONDS,
    },
    next: "PUT the unmodified file bytes to upload.url with the content-type header, then call attach_item_photo with itemId, documentId, fileName and the file's SHA-256. The URL is single-use; do not share it.",
  };
}

export const AttachPhotoInput = z.object({
  itemId: z.uuid(),
  documentId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  sha256: sha256Hex.optional(),
});

function photoRow(doc: { id: string; original_name: string | null; mime_type: string; byte_size: number; sha256: string; uploaded_at: string }) {
  return {
    documentId: doc.id,
    fileName: doc.original_name,
    mimeType: doc.mime_type,
    byteSize: doc.byte_size,
    sha256: doc.sha256,
    uploadedAt: doc.uploaded_at,
    // Vision analysis has a smaller per-image limit than storage.
    analyzable: doc.byte_size <= MAX_PHOTO_BYTES,
  };
}

export async function attachItemPhoto(ctx: ToolContext, input: z.infer<typeof AttachPhotoInput>) {
  input = AttachPhotoInput.parse(input);
  const item = await ownItem(ctx, input.itemId);
  const path = photoPath(ctx.user.id, item.move_id, input.documentId);
  const bucket = ctx.db.storage.from("move-files");

  const existing = await ctx.db
    .from("documents")
    .select("id, storage_path, original_name, mime_type, byte_size, sha256, uploaded_at")
    .eq("id", input.documentId)
    .eq("owner_id", ctx.user.id)
    .maybeSingle();
  if (existing.error) throw new MarketplaceError(existing.error.message, 500);
  if (existing.data) {
    // Safe retry of an attach that already registered this upload.
    if (existing.data.storage_path !== path) throw new MarketplaceError("That upload belongs to a different item", 409);
    if (input.sha256 && input.sha256 !== existing.data.sha256) throw new MarketplaceError("The stored photo does not match that SHA-256", 409);
    const link = await ctx.db.from("item_photos").upsert({ item_id: item.id, document_id: existing.data.id }, { ignoreDuplicates: true });
    if (link.error) throw new MarketplaceError(link.error.message, 500);
    return { itemId: item.id, photo: photoRow(existing.data), alreadyAttached: true };
  }

  const count = await ctx.db.from("item_photos").select("document_id", { count: "exact", head: true }).eq("item_id", item.id);
  if (count.error) throw new MarketplaceError(count.error.message, 500);

  let inserted = false;
  try {
    if ((count.count ?? 0) >= MAX_PHOTOS_PER_ITEM) throw new MarketplaceError(`An item can have at most ${MAX_PHOTOS_PER_ITEM} photos`);
    const { data: blob, error } = await bucket.download(path);
    if (error || !blob) throw new MarketplaceError("No upload found for that documentId; PUT the file to the upload URL first", 404);
    if (!blob.size || blob.size > MAX_ITEM_PHOTO_BYTES) throw new MarketplaceError("Photos must be between 1 byte and 20 MB");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mimeType = sniffPhotoMime(bytes);
    if (!mimeType) throw new MarketplaceError("The upload is not a JPEG, PNG or WebP image");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (input.sha256 && input.sha256 !== sha256) {
      throw new MarketplaceError("The uploaded bytes do not match the SHA-256 you sent; upload the file again", 409);
    }
    const doc = await ctx.db
      .from("documents")
      .insert({
        id: input.documentId,
        move_id: item.move_id,
        kind: "photo",
        storage_path: path,
        original_name: input.fileName,
        mime_type: mimeType,
        byte_size: bytes.byteLength,
        sha256,
      })
      .select("id, original_name, mime_type, byte_size, sha256, uploaded_at")
      .single();
    if (doc.error) throw new MarketplaceError(doc.error.message, 500);
    inserted = true;
    const link = await ctx.db.from("item_photos").insert({ item_id: item.id, document_id: doc.data.id });
    if (link.error) throw new MarketplaceError(link.error.message, 500);
    return { itemId: item.id, photo: photoRow(doc.data), alreadyAttached: false };
  } catch (e) {
    // Remove an unregistered upload so a rejected file is not kept. A
    // registered document is never deleted here; retrying attach relinks it.
    if (!inserted) {
      const check = await ctx.db.from("documents").select("id").eq("id", input.documentId).maybeSingle();
      if (!check.error && !check.data) await bucket.remove([path]);
    }
    throw e;
  }
}

type PhotoDoc = Parameters<typeof photoRow>[0] & { storage_path: string };

// Storage paths stay server-side; callers only see document ids and hashes.
async function itemPhotoDocs(ctx: ToolContext, itemId: string) {
  const item = await ownItem(ctx, z.uuid().parse(itemId));
  const { data, error } = await ctx.db
    .from("item_photos")
    .select("documents!inner(id, storage_path, original_name, mime_type, byte_size, sha256, uploaded_at)")
    .eq("item_id", item.id);
  if (error) throw new MarketplaceError(error.message, 500);
  const docs = (data ?? [])
    .map((row) => row.documents as unknown as PhotoDoc)
    .sort((x, y) => x.uploaded_at.localeCompare(y.uploaded_at));
  return { item, docs };
}

export async function listItemPhotos(ctx: ToolContext, itemId: string) {
  const { item, docs } = await itemPhotoDocs(ctx, itemId);
  return { itemId: item.id, photos: docs.map(photoRow) };
}

/** The item's own stored photos (all, or the chosen ids) in upload order, with their bytes. */
export async function readItemPhotos(ctx: ToolContext, itemId: string, documentIds?: string[]) {
  const { docs } = await itemPhotoDocs(ctx, itemId);
  const chosen = documentIds?.length ? docs.filter((d) => documentIds.includes(d.id)) : docs;
  if (documentIds?.length && chosen.length !== new Set(documentIds).size) {
    throw new MarketplaceError("One or more photos are not attached to this item", 404);
  }
  const bucket = ctx.db.storage.from("move-files");
  return Promise.all(
    chosen.map(async (doc) => {
      const { data, error } = await bucket.download(doc.storage_path);
      if (error || !data) throw new MarketplaceError(`Could not read photo ${doc.id}`, 500);
      return { ...photoRow(doc), bytes: new Uint8Array(await data.arrayBuffer()) };
    }),
  );
}

/** Document ids and hashes of the item's photos, for binding into a reviewed listing payload. */
export async function itemPhotoRefs(ctx: ToolContext, itemId: string, documentIds?: string[]) {
  const { docs } = await itemPhotoDocs(ctx, itemId);
  const chosen = documentIds ? docs.filter((d) => documentIds.includes(d.id)) : docs;
  if (documentIds && chosen.length !== new Set(documentIds).size) {
    throw new MarketplaceError("One or more photos are not attached to this item", 404);
  }
  return chosen.slice(0, MAX_PHOTOS_PER_ITEM).map((d) => ({ documentId: d.id, sha256: d.sha256 }));
}
