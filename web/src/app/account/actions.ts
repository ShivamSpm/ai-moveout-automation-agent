"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { createHousehold, inviteMember, revokeMember, acceptInvite } from "@/server/households";
import { closeAccount } from "@/server/account-deletion";
export async function householdAction(form: FormData) {
  try {
    const ctx = await requireUser();
    const action = form.get("action");
    if (action === "create") await createHousehold(ctx, String(form.get("name")));
    else if (action === "invite") {
      const token = await inviteMember(ctx, String(form.get("householdId")), String(form.get("email")));
      revalidatePath("/account");
      return { message: "Copy this invitation now; it is shown only once. It expires in 7 days. No email was sent.", invitePath: `/account/invite/${token}` };
    } else if (action === "revoke") await revokeMember(ctx, String(form.get("memberId")));
    else if (action === "attach") {
      const result = await ctx.db.from("moves").update({ household_id: z.uuid().parse(form.get("householdId")) })
        .eq("id", z.uuid().parse(form.get("moveId"))).eq("owner_id", ctx.user.id).select("id").single();
      if (result.error) throw result.error;
    } else if (action === "date") {
      const result = await ctx.db.from("moves").update({ move_out_date: z.iso.date().parse(form.get("date")) })
        .eq("id", z.uuid().parse(form.get("moveId"))).eq("owner_id", ctx.user.id).select("id").single();
      if (result.error) throw result.error;
    } else throw new Error("Unknown household action");
    revalidatePath("/account"); revalidatePath("/plan"); return { message: action === "date" ? "Date saved. Re-read your lease to rebuild the checklist." : "Saved" };
  } catch (e) { return { error: e instanceof Error ? e.message : "Could not update household" }; }
}
export async function acceptInvitation(form: FormData) {
  try { await acceptInvite(await requireUser(), String(form.get("token"))); }
  catch (e) { return { error: e instanceof Error ? e.message : "Could not accept invitation" }; }
  revalidatePath("/account"); redirect("/account");
}
export async function deleteAccount(form: FormData) {
  try { await closeAccount(await requireUser(), String(form.get("phrase"))); }
  catch (e) { return { error: e instanceof Error ? e.message : "Account deletion failed. You can retry." }; }
  redirect("/?account=closed");
}
