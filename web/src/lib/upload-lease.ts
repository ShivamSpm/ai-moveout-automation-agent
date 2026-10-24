import { createClient } from "@/lib/supabase/client";
import { prepareCurrentUpload, prepareUpload, registerDocument } from "@/app/account/documents/actions";

export async function uploadLease(file: File, moveId?: string) {
  if (file.type !== "application/pdf" || !file.size || file.size > 20 * 1024 * 1024) throw new Error("Choose a PDF of at most 20 MB");
  const upload = moveId ? await prepareUpload(moveId) : await prepareCurrentUpload();
  const { error } = await createClient().storage.from("move-files").uploadToSignedUrl(upload.path, upload.token, file, { contentType: "application/pdf" });
  if (error) throw error;
  return registerDocument({ documentId: upload.documentId, moveId: upload.moveId, name: file.name });
}
