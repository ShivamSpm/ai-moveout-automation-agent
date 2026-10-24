import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { accountPageUser } from "@/server/account-page";
import { LeaseUpload } from "@/components/lease-upload";
import { AccountActionForm } from "@/components/account-action-form";
import { fileAction } from "./actions";
async function Files() {
  await connection();
  const ctx = await accountPageUser("/account/documents");
  const [documents, moves] = await Promise.all([
    ctx.db.from("documents").select("*").order("uploaded_at", { ascending: false }),
    ctx.db.from("moves").select("id,title").eq("owner_id", ctx.user.id),
  ]);
  if (documents.error) throw documents.error;
  if (moves.error) throw moves.error;
  return <div className="grid gap-8">
    {moves.data.map(move => <section className="border p-5" key={move.id}><h2 className="font-display text-2xl mb-4">{move.title}</h2><LeaseUpload moveId={move.id} /></section>)}
    {!moves.data.length && <p><Link className="underline" href="/start">Start a move</Link> to upload your lease.</p>}
    {[false, true].map(shared => <section key={String(shared)} className="grid gap-4">
      <h2 className="font-display text-3xl">{shared ? "Shared with me" : "Your files"}</h2>
      {documents.data.filter(d => (d.owner_id !== ctx.user.id) === shared).map(d => <article className="border p-5 grid gap-3" key={d.id}>
        <h3 className="font-display text-2xl">{d.original_name ?? "Untitled file"}</h3>
        <p className="text-sm">{d.kind} · {new Date(d.uploaded_at).toISOString()} · {d.byte_size.toLocaleString()} bytes · {d.page_count ?? "—"} pages · SHA-256 {d.sha256.slice(0, 12)}…</p>
        <p>{d.shared_with_household ? "Shared with household" : "Private to you"}{shared ? " · Read-only" : ""}</p>
        <div className="flex flex-wrap gap-4">{["view", "download"].map(action => <AccountActionForm action={fileAction} key={action}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="action" value={action} /><button className="underline capitalize">{action}</button></AccountActionForm>)}</div>
        {!shared && <>
          <AccountActionForm action={fileAction}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="action" value="share" /><input type="hidden" name="shared" value={String(!d.shared_with_household)} /><button className="underline">{d.shared_with_household ? "Stop sharing" : "Share with household"}</button></AccountActionForm>
          {d.kind === "lease" && <AccountActionForm action={fileAction}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="action" value="read" /><button className="underline">Re-read lease</button></AccountActionForm>}
          <AccountActionForm action={fileAction} confirm="Delete this original file, its findings and unfinished lease tasks? This cannot be undone."><input type="hidden" name="id" value={d.id} /><input type="hidden" name="action" value="delete" /><button className="underline text-red-700">Delete file</button></AccountActionForm>
        </>}
      </article>)}
      {!documents.data.some(d => (d.owner_id !== ctx.user.id) === shared) && <p className="text-muted">No files here yet.</p>}
    </section>)}
  </div>;
}
export default function DocumentsPage() {
  return <main className="mx-auto max-w-4xl px-6 py-10"><nav className="mb-6 flex flex-wrap gap-x-4 [&>a]:py-3"><Link href="/account">Account</Link><Link href="/plan">Plan</Link></nav><h1 className="font-display text-5xl mb-8">Your documents</h1><Suspense fallback={<p>Loading files…</p>}><Files /></Suspense></main>;
}
