"use client";

import { useMemo, useState } from "react";
import type { Lane, Urgency } from "@/lib/schedule";
import { laneMeta, usd } from "@/lib/format";

export interface PlanRow {
  id: string;
  lane: Lane;
  title: string;
  detail: string;
  dueLabel: string;
  daysOut: number;
  urgency: Urgency;
  source: string;
  riskUsd?: number;
  riskLabel?: string;
  agent?: string;
}

const filters: Array<Lane | "all"> = ["all", "landlord", "cleaning", "moving", "selling", "admin"];

const urgencyStyle: Record<Urgency, { label: string; className: string }> = {
  overdue: { label: "Overdue", className: "bg-stamp text-white" },
  "this-week": { label: "This week", className: "bg-sun text-tape-ink" },
  upcoming: { label: "Upcoming", className: "border border-line text-muted" },
  after: { label: "After move-out", className: "border border-dashed border-line text-muted" },
};

export function MoveBoard({
  rows,
  deposit,
  initiallyDone,
}: {
  rows: PlanRow[];
  deposit: number;
  initiallyDone: string[];
}) {
  const [done, setDone] = useState<Set<string>>(() => new Set(initiallyDone));
  const [filter, setFilter] = useState<Lane | "all">("all");

  const totalRisk = rows.reduce((sum, row) => sum + (row.riskUsd ?? 0), 0);
  const openRisk = rows.reduce(
    (sum, row) => sum + (done.has(row.id) ? 0 : (row.riskUsd ?? 0)),
    0,
  );
  const protectedUsd = deposit - openRisk;
  const pct = Math.round((protectedUsd / deposit) * 100);

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => row.lane === filter)),
    [rows, filter],
  );

  function toggle(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <section className="box-label rounded-3xl p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Deposit protected</p>
            <p className="mt-2 font-display text-6xl leading-none sm:text-7xl">
              {usd(protectedUsd)}
              <span className="ml-3 font-sans text-xl font-medium tracking-normal text-muted">of {usd(deposit)}</span>
            </p>
          </div>
          <div className="text-right text-sm text-muted">
            <p>
              <strong className="font-mono text-ink">{usd(openRisk)}</strong> still at risk across{" "}
              {rows.filter((r) => r.riskUsd && !done.has(r.id)).length} tasks
            </p>
            <p className="mt-1">Check off a task to protect that money.</p>
          </div>
        </div>
        <div className="mt-6 h-5 overflow-hidden rounded-full border border-line bg-paper">
          <div
            className="h-full rounded-r-full bg-leaf transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
          {rows
            .filter((row) => row.riskUsd)
            .map((row) => (
              <button
                key={row.id}
                onClick={() => toggle(row.id)}
                className={`rounded-full border-2 px-3 py-1 transition ${
                  done.has(row.id)
                    ? "border-leaf bg-leaf text-white"
                    : "border-edge bg-card hover:bg-paper"
                }`}
              >
                {done.has(row.id) ? "✓ " : ""}
                {row.riskLabel ?? row.title} · {usd(row.riskUsd!)}
              </button>
            ))}
          <span className="ml-auto font-mono font-normal text-muted">at stake {usd(totalRisk)}</span>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-5xl">The plan</h2>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by lane">
            {filters.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold transition ${
                  filter === f ? "border-edge bg-ink text-paper" : "border-line text-muted hover:border-edge hover:text-ink"
                }`}
              >
                {f === "all" ? "All" : laneMeta[f].label}
              </button>
            ))}
          </div>
        </div>

        <ol className="box-label mt-6 overflow-hidden rounded-3xl">
          {visible.map((row) => {
            const isDone = done.has(row.id);
            const u = urgencyStyle[row.urgency];
            return (
              <li
                key={row.id}
                className="grid grid-cols-[auto_1fr] gap-4 border-b border-line p-4 last:border-b-0 sm:grid-cols-[88px_auto_1fr_auto] sm:items-center sm:p-5"
              >
                <div className="hidden font-mono text-sm sm:block">
                  <div className="text-ink">{row.dueLabel}</div>
                  <div className="text-[11px] text-muted">
                    {row.daysOut === 0 ? "move-out" : row.daysOut > 0 ? `in ${row.daysOut}d` : `${-row.daysOut}d ago`}
                  </div>
                </div>
                <button
                  onClick={() => toggle(row.id)}
                  aria-pressed={isDone}
                  aria-label={isDone ? `Mark "${row.title}" not done` : `Mark "${row.title}" done`}
                  className={`mt-0.5 grid h-6 w-6 place-items-center rounded-md border-2 transition sm:mt-0 ${
                    isDone ? "border-leaf bg-leaf text-white" : "border-edge bg-paper hover:bg-tape"
                  }`}
                >
                  {isDone && (
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                      <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: laneMeta[row.lane].color }}
                      aria-hidden
                    />
                    <span className={`font-medium ${isDone ? "text-muted line-through" : ""}`}>
                      {row.title}
                    </span>
                    <span className="font-mono text-[11px] text-muted sm:hidden">· {row.dueLabel}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{row.detail}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-paper px-2.5 py-0.5 font-mono text-muted">
                      {row.source}
                    </span>
                    {row.agent && (
                      <span className="rounded-full bg-lilac/30 px-2.5 py-0.5 font-medium text-ink">
                        ✦ Agent: {row.agent}
                      </span>
                    )}
                  </div>
                </div>
                <div className="col-start-2 flex items-center gap-2 sm:col-start-auto sm:flex-col sm:items-end">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${isDone ? "bg-leaf/15 text-leaf" : u.className}`}>
                    {isDone ? "Done" : u.label}
                  </span>
                  {row.riskUsd ? (
                    <span className={`font-mono text-xs ${isDone ? "text-leaf" : "text-stamp"}`}>
                      {isDone ? "protected " : "at risk "}
                      {usd(row.riskUsd)}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
