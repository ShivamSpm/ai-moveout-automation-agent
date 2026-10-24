import type { Metadata } from "next";
import Link from "next/link";
import { ApprovalQueue } from "@/components/approval-queue";
import { MoveBoard, type PlanRow } from "@/components/move-board";
import { activity, approvals, doneAtStart, leaseRules, move, plan, TODAY } from "@/lib/demo";
import { laneMeta, longDate, shortDate } from "@/lib/format";
import { daysBetween, urgency } from "@/lib/schedule";

export const metadata: Metadata = { title: "Dashboard · Vacate" };

export default function Dashboard() {
  const daysLeft = daysBetween(TODAY, move.moveOut);

  const rows: PlanRow[] = plan.map((task) => ({
    id: task.id,
    lane: task.lane,
    title: task.title,
    detail: task.detail,
    dueLabel: shortDate(task.due),
    daysOut: daysBetween(TODAY, task.due),
    urgency: urgency(task, TODAY, move.moveOut),
    source: task.source,
    riskUsd: task.riskUsd,
    riskLabel: task.riskLabel,
    agent: task.agent,
  }));

  const nextUp = rows.find((r) => r.daysOut >= 0 && !doneAtStart.includes(r.id));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="rise grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="flex flex-wrap gap-2 text-sm font-medium">
            <span className="rounded-full border border-line bg-card px-3 py-1">{move.neighborhood}, San Francisco</span>
            <span className="rounded-full border border-line bg-card px-3 py-1">
              Keys back {longDate(move.moveOut)}
            </span>
          </div>
          <h1 className="mt-5 font-display text-5xl leading-[0.95] sm:text-7xl">{move.address}</h1>
          <p className="mt-4 text-muted">
            Landlord <span className="font-semibold text-ink">{move.landlord.name}</span> ·{" "}
            {move.landlord.company} · agent inbox{" "}
            <span className="rounded-md bg-card px-1.5 py-0.5 font-mono text-sm text-ink">{move.agentEmail}</span>
          </p>
        </div>
        <div className="flex items-center gap-5">
          <div className="tape grid h-36 w-36 shrink-0 place-items-center rounded-full border border-line text-center shadow-[0_18px_40px_-24px_rgba(16,24,27,0.35)]">
            <div>
              <p className="font-display text-6xl leading-none">{daysLeft}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider">days to keys</p>
            </div>
          </div>
          {nextUp && (
            <div className="box-label hidden max-w-[230px] rounded-3xl p-4 sm:block">
              <p className="text-xs font-bold uppercase tracking-wider text-stamp">Next deadline</p>
              <p className="mt-1 font-semibold leading-snug">{nextUp.title}</p>
              <p className="mt-2 inline-block rounded-full bg-sun px-2.5 py-0.5 text-xs font-semibold text-tape-ink">
                {nextUp.dueLabel} · in {nextUp.daysOut} days
              </p>
            </div>
          )}
        </div>
      </header>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <MoveBoard rows={rows} deposit={move.deposit} initiallyDone={doneAtStart} />

        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
          <Link href="/cleanup" className="pop group block rounded-3xl bg-card p-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-tape">Next step</p>
            <p className="mt-2 font-display text-3xl">Choose your cleaners</p>
            <p className="mt-1 text-sm text-muted">
              The agent compared cleaning companies near you on price and your Nov 28 deadline.
            </p>
            <span className="mt-4 inline-block text-sm font-semibold text-tape group-hover:underline">See the options →</span>
          </Link>
          <ApprovalQueue approvals={approvals} />

          <section className="box-label rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-3xl">Agent activity</h2>
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
                <span className="live-dot h-2 w-2 rounded-full bg-stamp" /> Live
              </span>
            </div>
            <ol className="mt-5 space-y-4">
              {activity.map((entry) => (
                <li key={entry.text} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 text-sm">
                  <span className="font-mono text-[11px] text-muted">{entry.at}</span>
                  <span className="border-l-2 pl-3" style={{ borderColor: laneMeta[entry.lane].color }}>
                    {entry.text}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="box-label rounded-3xl p-6">
            <h2 className="font-display text-3xl">From your lease</h2>
            <p className="mt-1 text-sm text-muted">What the agent pulled out, with the clause it came from.</p>
            <dl className="mt-5 space-y-3 text-sm">
              {[
                ["Notice to vacate", `${leaseRules.noticeDays} days, in writing`, leaseRules.noticeClause],
                ["Carpets", "Professional cleaning, keep receipt", leaseRules.carpetCleaning?.clause],
                ["Walls", "Patch holes, touch-up paint", leaseRules.wallRepair?.clause],
                ["Keys + fobs", "$150 fee if not returned", leaseRules.keyReturn.clause],
              ].map(([label, value, clause]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-dashed border-line pb-3 last:border-0">
                  <div>
                    <dt className="font-medium">{label}</dt>
                    <dd className="text-muted">{value}</dd>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-muted">{clause}</span>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
}
