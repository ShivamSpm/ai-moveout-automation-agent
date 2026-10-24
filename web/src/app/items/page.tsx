import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { accountPageUser } from "@/server/account-page";
async function Inventory() {
  await connection();
  const ctx = await accountPageUser("/items");
  const { data, error } = await ctx.db.from("items").select("id,name,condition,disposition,status,ask_cents").eq("owner_id", ctx.user.id).order("created_at");
  if (error) throw error;
  return <><p className="my-5 text-muted">{data.length} items in your inventory. Listings are prepared and reviewed in your Muse workspace.</p>{!data.length && <p className="box-label rounded-3xl p-6">No items yet. Add your belongings to start selling, donating, or deciding what to keep.</p>}<ul className="my-6 grid gap-4 sm:grid-cols-2">{data.map(i => <li className="box-label rounded-3xl p-5" key={i.id}><h2 className="font-display text-2xl">{i.name}</h2><p>{i.condition} · {i.disposition} · {i.status}</p><Link href={`/muse#item-${i.id}`} className="underline">Manage item and listing</Link></li>)}</ul><Link className="tape inline-block rounded-xl px-5 py-3" href="/muse">Add items and prepare listings</Link></>;
}
export default function ItemsPage() { return <main className="mx-auto max-w-6xl px-6 py-10"><h1 className="font-display text-5xl">Your items</h1><Suspense fallback={<p>Loading your items…</p>}><Inventory /></Suspense></main>; }
