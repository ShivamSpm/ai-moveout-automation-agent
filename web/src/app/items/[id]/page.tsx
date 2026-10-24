import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { accountPageUser } from "@/server/account-page";
async function Item({ params }: PageProps<"/items/[id]">) {
  await connection();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await accountPageUser(`/items/${id}`);
  const { data, error } = await ctx.db.from("items").select("id").eq("id", id).eq("owner_id", ctx.user.id).maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  return redirect(`/muse#item-${id}`);
}
export default function ItemPage(props: PageProps<"/items/[id]">) { return <Suspense fallback={<p>Loading item…</p>}><Item {...props} /></Suspense>; }
