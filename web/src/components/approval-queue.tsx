"use client";

import { useState } from "react";
import type { Approval } from "@/lib/demo";
import { laneMeta } from "@/lib/format";

type Decision = "approved" | "skipped";

export function ApprovalQueue({ approvals }: { approvals: Approval[] }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [open, setOpen] = useState<string | null>(approvals[0]?.id ?? null);
  const waiting = approvals.filter((a) => !decisions[a.id]).length;

  function decide(id: string, decision: Decision) {
    setDecisions((prev) => ({ ...prev, [id]: decision }));
    const next = approvals.find((a) => a.id !== id && !decisions[a.id]);
    setOpen(next?.id ?? null);
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-slate p-6 text-white shadow-[0_18px_40px_-24px_rgba(16,24,27,0.35)] sm:p-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl">Needs your OK</h2>
        <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs">
          {waiting} waiting
        </span>
      </div>
      <p className="mt-1 text-sm text-white/60">Nothing leaves without your approval.</p>

      <ul className="mt-6 space-y-3">
        {approvals.map((a) => {
          const decision = decisions[a.id];
          const isOpen = open === a.id && !decision;
          return (
            <li key={a.id} className="rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
              <button
                onClick={() => setOpen(isOpen ? null : a.id)}
                disabled={!!decision}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 p-4 text-left"
              >
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: laneMeta[a.lane].color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${decision ? "text-white/50" : ""}`}>{a.title}</span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-white/50">
                    {laneMeta[a.lane].label} · {a.to}
                  </span>
                </span>
                {decision ? (
                  <span
                    className={`stamp shrink-0 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                      decision === "approved" ? "text-leaf" : "text-white/40"
                    }`}
                  >
                    {decision === "approved" ? "Simulated" : "Skipped"}
                  </span>
                ) : (
                  a.cost && <span className="shrink-0 font-mono text-sm text-tape">{a.cost}</span>
                )}
              </button>
              {isOpen && (
                <div className="px-4 pb-4">
                  <p className="rounded-xl bg-white/[0.06] p-3 text-sm leading-relaxed text-white/80">
                    {a.preview}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => decide(a.id, "approved")}
                      className="flex-1 rounded-full bg-tape px-4 py-2 text-sm font-semibold text-tape-ink transition hover:brightness-105"
                    >
                      Try approval
                    </button>
                    <button
                      onClick={() => decide(a.id, "skipped")}
                      className="rounded-full px-4 py-2 text-sm text-white/70 ring-1 ring-white/20 transition hover:text-white"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
