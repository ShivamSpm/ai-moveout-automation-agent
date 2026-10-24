import Link from "next/link";
import { AccountActionForm } from "./account-action-form";
import { setTaskStatus } from "@/app/plan/actions";
import type { MoveView } from "@/server/move-view";
import { urgency, type Lane } from "@/lib/schedule";

export function SavedChecklist({ tasks, editable, today, moveOutDate }: {
  tasks: MoveView["tasks"]; editable: boolean; today?: string; moveOutDate?: string | null;
}) {
  const lanes = [...new Set(tasks.map(t => t.lane))];
  return <>{lanes.map(lane => <section key={lane} className="mt-5">
    <h3 className="font-display text-2xl capitalize">{lane}</h3>
    {tasks.filter(t => t.lane === lane).map(t => <article key={t.id} className="mt-3 border-t border-line pt-4">
      <p className="text-xs uppercase text-muted">{t.status}{!editable ? " · Shared household task · Read only" : ""}</p>
      <h4 className="font-semibold">{t.title}</h4><p className="text-sm text-muted">{t.detail}</p>
      <p className="my-2 text-sm">{t.due_date ?? "Date to confirm"} · {t.source ?? "Source not recorded"}{t.page ? ` · Page ${t.page}` : ""}
        {t.due_date && moveOutDate && today && t.status === "todo" ? ` · ${urgency({ id: t.id, title: t.title, detail: t.detail ?? "", lane: t.lane as Lane, source: t.source ?? "", due: new Date(`${t.due_date}T00:00:00Z`) }, new Date(`${today}T00:00:00Z`), new Date(`${moveOutDate}T00:00:00Z`)).replaceAll("-", " ")}` : ""}
      </p>
      {editable && <AccountActionForm action={setTaskStatus}><input type="hidden" name="id" value={t.id} /><label>Status <select className="field" name="status" defaultValue={t.status}><option value="todo">To do</option><option value="done">Done</option><option value="skipped">Skipped</option></select></label><button className="underline">Save status</button></AccountActionForm>}
    </article>)}
  </section>)}<Link className="mt-5 inline-block underline" href="/plan">Open full checklist and lease findings</Link></>;
}
