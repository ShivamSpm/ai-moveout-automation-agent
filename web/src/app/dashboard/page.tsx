import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { accountPageUser } from "@/server/account-page";
import { getMoveView } from "@/server/move-view";
import { daysUntil, todayInTimezone, leaseFees } from "@/lib/move-summary";
import { AccountActionForm } from "@/components/account-action-form";
import { setTaskStatus } from "@/app/plan/actions";
import { LeaseUpload } from "@/components/lease-upload";
import { RenterChat } from "@/components/renter-chat";
import { LandlordAndServices } from "@/components/landlord-and-services";
import { isConfigured } from "@/server/integrations/openrouter";
import { urgency, type Lane } from "@/lib/schedule";

export const metadata: Metadata = { title: "Your dashboard · Vacate" };
const card = "box-label rounded-3xl p-6";
async function Dashboard() {
  await connection();
  const ctx = await accountPageUser("/dashboard");
  const view = await getMoveView(ctx);
  const { move } = view;
  if (!move) return <section className={card}><h1 className="font-display text-5xl">Your move starts here</h1><p className="my-4">Save your address and move-out date to build your own plan.</p><Link className="tape rounded-xl px-4 py-3 inline-block" href="/start">Add your move details</Link></section>;
  const today = todayInTimezone(move.timezone);
  const days = move.move_out_date ? daysUntil(move.move_out_date, today) : null;
  const fees = leaseFees(view.findings);
  return <>
    <header className="mb-8"><p className="text-sm text-muted">Your saved move · {move.move_out_date ?? "Move-out date needed"}{days !== null ? ` · ${days >= 0 ? `${days} days until move-out` : `${Math.abs(days)} days since move-out`}` : ""}</p>
      <h1 className="mt-4 font-display text-5xl sm:text-6xl">{move.address_private || "Add your address"}</h1>
      <p className="mt-4">{move.renter_name || "Your name not added"}</p>
      <p className="mt-2">{move.property_management_company || "Property management company not added"} · {move.landlord_name || "Contact name not added"}</p>
      <p className="text-muted">{move.landlord_email}</p><Link className="mt-3 inline-block underline" href="/move">Edit move and property manager details</Link>
    </header>
    <section className={`${card} mb-6`}><h2 className="font-display text-3xl">Next steps</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Link className="rounded-xl border border-line p-4" href="/account/documents"><strong>{view.documents.length ? "Review your lease" : "Upload your lease"}</strong><p className="mt-2 text-sm text-muted">Save the original and check the extracted obligations and page references.</p></Link>
      <Link className="rounded-xl border border-line p-4" href="/calls"><strong>Contact your property manager</strong><p className="mt-2 text-sm text-muted">Prepare a call to confirm move-out steps. Review the recipient and script before any call.</p></Link>
      <Link className="rounded-xl border border-line p-4" href="/services"><strong>Choose cleaners &amp; movers</strong><p className="mt-2 text-sm text-muted">Compare three options each on price and timing, and save your pick.</p></Link>
      <Link className="rounded-xl border border-line p-4" href="/muse"><strong>Add items to sell</strong><p className="mt-2 text-sm text-muted">Add your belongings, prepare listings, and approve what Muse can post.</p></Link>
    </div></section>
    <LandlordAndServices ctx={ctx} moveId={move.id} />
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-6 content-start">
        <section className={card}><h2 className="font-display text-3xl">Your checklist</h2>
          {!view.tasks.length && <p className="mt-4 text-muted">No checklist yet. Upload your lease to extract its obligations, then review them. No sample tasks have been added.</p>}
          {view.tasks.map(t => <article key={t.id} className="mt-5 border-t border-line pt-4"><p className="text-xs uppercase text-muted">{t.lane} · {t.status}</p><h3 className="font-semibold">{t.title}</h3><p className="text-sm text-muted">{t.detail}</p><p className="my-2 text-sm">{t.due_date ?? "Date to confirm"} · {t.source ?? "Source not recorded"}{t.due_date && move.move_out_date && t.status === "todo" ? ` · ${urgency({ id: t.id, title: t.title, detail: t.detail ?? "", lane: t.lane as Lane, source: t.source ?? "", due: new Date(`${t.due_date}T00:00:00Z`), agent: "" }, new Date(`${today}T00:00:00Z`), new Date(`${move.move_out_date}T00:00:00Z`)).replaceAll("-", " ")}` : ""}</p>
            <AccountActionForm action={setTaskStatus}><input type="hidden" name="id" value={t.id} /><label>Status <select className="field" name="status" defaultValue={t.status}><option value="todo">To do</option><option value="done">Done</option><option value="skipped">Skipped</option></select></label><button className="underline">Save status</button></AccountActionForm>
          </article>)}<Link className="mt-5 inline-block underline" href="/plan">Open full checklist and lease findings</Link>
        </section>
        <section className={card}><h2 className="font-display text-3xl">Your documents</h2>{!view.documents.length ? <div className="mt-4"><LeaseUpload moveId={move.id} /></div> : <ul className="mt-4 space-y-3">{view.documents.map(d => <li key={d.id}><Link className="underline" href="/account/documents">{d.name ?? "Lease document"}</Link><p className="text-sm text-muted">{d.page_count ?? "Unknown"} pages · Uploaded {d.uploaded_at.slice(0,10)}</p></li>)}</ul>}</section>
        <section className={card}><h2 className="font-display text-3xl">Your listings</h2>{!view.listings.length ? <p className="my-4 text-muted">No listings yet. Your inventory has {view.items.length} items.</p> : <ul className="my-4 space-y-2">{view.listings.map(l => <li key={l.id}><Link href={`/muse#listing-${l.id}`} className="underline">{l.title}</Link> · {l.status} ({l.mode})</li>)}</ul>}<Link className="underline" href="/muse">Add items and prepare listings</Link></section>
        <RenterChat configured={isConfigured()} initial={view.chat.filter((m): m is { role: "user" | "assistant"; content: string } => m.role === "user" || m.role === "assistant")} />
      </div>
      <aside className="grid gap-6 content-start">
        <section className={card}><h2 className="font-display text-3xl">Security deposit</h2><p className="mt-3 text-3xl">{move.deposit_cents == null ? "Not added" : `$${(move.deposit_cents / 100).toLocaleString()}`}</p><p className="mt-3 text-sm text-muted">{fees ? `$${fees.toLocaleString()} in potential fees identified in lease findings. Review the original clauses; this is not a confirmed deduction.` : "No quantified fees identified yet. Completing tasks does not guarantee a deposit refund."}</p></section>
        <section className={card}><h2 className="font-display text-3xl">Needs your review</h2>{!view.approvals.length && <p className="mt-4 text-muted">No actions waiting. Prepare a listing to see its review card here.</p>}{view.approvals.map(a => <Link className="mt-4 block underline" key={a.id} href={a.kind === "landlord_call" ? "/calls" : `/muse#action-${a.id}`}>{a.title}</Link>)}</section>
        <section className={card}><h2 className="font-display text-3xl">Account activity</h2>{!view.activity.length && <p className="mt-4 text-muted">No action activity yet. Saving your move does not send messages or publish listings.</p>}<ul className="mt-4 space-y-4">{view.activity.map((a, i) => <li key={i}><Link href={a.link} className="underline">{a.summary}</Link><p className="text-xs text-muted">{a.at.slice(0, 10)}{a.actor === "muse" ? " · Reported by Muse, not verified" : ""}</p></li>)}</ul></section>
      </aside>
    </div>
  </>;
}
export default function DashboardPage() { return <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6"><Suspense fallback={<p>Loading your saved move…</p>}><Dashboard /></Suspense></main>; }
