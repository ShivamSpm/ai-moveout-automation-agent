"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import * as documents from "@/server/documents";
import { readLease } from "@/server/domain/lease-pipeline";
export async function prepareUpload(moveId: string) { return documents.prepareLeaseUpload(await requireUser(), moveId); }
export async function registerDocument(input: unknown) {
  const result = await documents.registerDocument(await requireUser(), input);
  revalidatePath("/account/documents"); revalidatePath("/plan"); return result;
}
export async function fileAction(form: FormData) {
  try {
    const ctx = await requireUser();
    const id = z.uuid().parse(form.get("id"));
    const action = form.get("action");
    let message = "Saved";
    if (action === "delete") {
      if (form.get("confirmed") !== "yes") throw new Error("Confirm deletion first");
      await documents.deleteDocument(ctx, id);
      message = "File deleted";
    } else if (action === "share") {
      const result = await ctx.db.from("documents").update({ shared_with_household: form.get("shared") === "true" }).eq("id", id).eq("owner_id", ctx.user.id).select("id").single();
      if (result.error) throw result.error;
    } else if (action === "read") message = (await readLease(ctx, id)).message;
    else if (action === "download" || action === "view") return { url: await documents.documentUrl(ctx, id, action === "download"), message: "Link ready (expires in 60 seconds)" };
    else throw new Error("Unknown file action");
    revalidatePath("/account/documents"); revalidatePath("/plan"); return { message };
  } catch (e) { return { error: e instanceof Error ? e.message : "Could not update file" }; }
}
