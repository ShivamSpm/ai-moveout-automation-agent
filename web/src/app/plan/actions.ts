"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
export async function setTaskStatus(form: FormData) {
  try {
    const ctx = await requireUser();
    const result = await ctx.db.from("tasks").update({ status: z.enum(["todo", "done", "skipped"]).parse(form.get("status")) })
      .eq("id", z.uuid().parse(form.get("id"))).eq("owner_id", ctx.user.id).select("id").single();
    if (result.error) throw result.error;
    revalidatePath("/plan"); revalidatePath("/dashboard"); return { message: "Task updated" };
  } catch (e) { return { error: e instanceof Error ? e.message : "Could not update task" }; }
}
