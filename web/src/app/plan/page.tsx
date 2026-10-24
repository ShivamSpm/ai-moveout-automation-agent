import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { accountPageUser } from "@/server/account-page";
import { AccountActionForm } from "@/components/account-action-form";
import { setTaskStatus } from "./actions";
async function Plan() {
  await connection();
  const ctx = await accountPageUser("/plan");
  const [moves, tasks, findings] = await Promise.all([ctx.db.rpc("household_moves"),
    ctx.db.from("tasks").select("*").order("due_date"), ctx.db.from("lease_findings").select("*").order("page")]);
  if (moves.error) throw moves.error;
  if (tasks.error) throw tasks.error;
  if (findings.error) throw findings.error;
  return <div className="grid gap-8">{moves.data.map(move => <section key={move.id} className="grid gap-5">
    <h2 className="font-display text-3xl">{move.title}{move.owner_id !== ctx.user.id ? " · Shared, read-only" : ""}</h2>
    {!move.move_out_date && <p>Add your move-out date to build the plan</p>}
    {["landlord", "cleaning", "moving", "selling", "admin"].map(lane => {
      const rows = tasks.data.filter(t => t.move_id === move.id && t.lane === lane);
      if (!rows.length) return null;
      return <section key={lane}><h3 className="box-label capitalize mb-3">{lane}</h3><ul className="grid gap-3">{rows.map(t => <li className="border p-4" key={t.id}>
        <h4 className="font-display text-xl">{t.title}</h4><p>{t.detail}</p><p className="text-sm my-2">{t.due_date ?? "Date needed"} · {t.source} · {t.status}</p>
        {t.owner_id === ctx.user.id && <AccountActionForm key={`${t.id}-${t.status}`} action={setTaskStatus}><input name="id" type="hidden" value={t.id} /><label>Status <select name="status" className="field" defaultValue={t.status}><option value="todo">To do</option><option value="done">Done</option><option value="skipped">Skipped</option></select></label><button className="underline">Save</button></AccountActionForm>}
      </li>)}</ul></section>;
    })}
    {!tasks.data.some(t => t.move_id === move.id) && <p>No checklist yet. Upload a readable lease and add your move-out date.</p>}
    <h3 className="font-display text-2xl">Lease findings</h3>
    <p className="text-muted">Pattern extraction can miss or misread clauses. Review each quote against the original lease.</p>
    {findings.data.filter(f => f.move_id === move.id).map(f => <article className="border-l-4 pl-4" key={f.id}>
      <h4 className="box-label">{f.rule_key.replaceAll("_", " ")}</h4>
      {f.confidence === "unresolved" ? <p>Not found in your lease</p> : <><blockquote>{f.quote}</blockquote><p className="text-sm">Lease p.{f.page} · {f.confidence} confidence · {f.extractor}</p></>}
    </article>)}
  </section>)}{!moves.data.length && <p>Start a move or accept a household invitation to see a plan.</p>}</div>;
}
export default function PlanPage() {
  return <main className="mx-auto max-w-4xl px-6 py-10"><nav className="flex gap-4 mb-8"><Link href="/account">Account</Link><Link href="/account/documents">Documents</Link></nav><h1 className="font-display text-5xl mb-8">Your move-out checklist</h1><Suspense fallback={<p>Loading plan…</p>}><Plan /></Suspense></main>;
}
