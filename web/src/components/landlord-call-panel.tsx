"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { placeLandlordCall, type PlaceCallState } from "@/app/calls/actions";
import type { CallStatus, ChecklistItem } from "@/server/domain/landlord-call";

export interface CallViewData {
  id: string;
  status: CallStatus;
  createdAt: string;
  summary: string | null;
  transcript: string | null;
  checklist: ChecklistItem[];
  error: string | null;
}

const FINAL: CallStatus[] = ["completed", "no_answer", "voicemail", "failed"];

const STATUS_TEXT: Record<CallStatus, string> = {
  requested: "Placing the call…",
  in_progress: "Calling your landlord…",
  completed: "Call finished",
  no_answer: "No answer",
  voicemail: "Left a voicemail",
  failed: "The call failed",
};

const LANE_TEXT: Record<string, string> = { landlord: "Landlord", cleaning: "Cleaning", moving: "Moving", admin: "Admin" };

export function LandlordCallPanel({
  canCall,
  blocker,
  landlordName,
  phoneDisplay,
  firstSentence,
  task,
  initialCall,
}: {
  canCall: boolean;
  blocker: string | null;
  landlordName: string;
  phoneDisplay: string;
  firstSentence: string | null;
  task: string | null;
  initialCall: CallViewData | null;
}) {
  const [state, action, pending] = useActionState<PlaceCallState>(placeLandlordCall, { status: "idle" });
  const [call, setCall] = useState<CallViewData | null>(initialCall);
  const [showScript, setShowScript] = useState(false);
  const callId = state.status === "placed" ? state.callId : call?.id;
  const live = callId && (!call || call.id !== callId || !FINAL.includes(call.status));

  // Follow the call until it ends: the server checks Bland and saves the checklist once.
  useEffect(() => {
    if (!live) return;
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/landlord-calls/${callId}`, { cache: "no-store" }).catch(() => null);
      if (stop) return;
      if (res?.ok) {
        const next = (await res.json()) as CallViewData;
        setCall(next);
        if (FINAL.includes(next.status)) return;
      }
      timer = setTimeout(tick, 5000);
    };
    let timer = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [live, callId]);

  const shown = call && (!callId || call.id === callId) ? call : null;
  const inProgress = Boolean(live) || pending;

  return (
    <div className="grid gap-6">
      <section className="box-label rounded-3xl p-6 sm:p-7">
        <p className="text-sm font-semibold uppercase tracking-wider text-tape">Before you call</p>
        <h2 className="mt-2 font-display text-3xl">
          Call {landlordName || "your landlord"}
          {phoneDisplay && <span className="block text-lg text-muted">{phoneDisplay}</span>}
        </h2>
        {firstSentence ? (
          <>
            <p className="mt-4 text-sm text-muted">The agent opens with:</p>
            <blockquote className="mt-2 rounded-2xl bg-paper p-4 leading-relaxed">&ldquo;{firstSentence}&rdquo;</blockquote>
            <p className="mt-4 text-sm text-muted">
              It confirms your move-out day, asks for the move-out checklist and how to book the inspection, and never
              agrees to fees, dates or repairs for you. Calls are capped at 5 minutes and aren&rsquo;t recorded; the
              transcript is saved here.
            </p>
            <button type="button" onClick={() => setShowScript((s) => !s)} className="mt-3 py-2 text-sm text-tape underline">
              {showScript ? "Hide" : "Show"} the full instructions
            </button>
            {showScript && task && <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-paper p-4 text-sm leading-relaxed">{task}</pre>}
          </>
        ) : (
          <p className="mt-4 rounded-xl bg-sun/20 p-3 text-sm">
            {blocker}{" "}
            <Link href="/move" className="font-semibold underline">
              Go to My move
            </Link>
          </p>
        )}

        <form action={action} className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!canCall || inProgress}
            className="tape min-h-12 rounded-xl px-6 font-semibold transition hover:brightness-110 disabled:opacity-50"
          >
            {pending ? "Placing the call…" : inProgress ? "Call in progress" : "Approve & call"}
          </button>
          {!canCall && firstSentence && blocker && <span className="text-sm text-muted">{blocker}</span>}
        </form>
        {state.status === "error" && <p role="alert" className="mt-3 rounded-xl bg-stamp/10 p-3 text-sm text-stamp">{state.message}</p>}
      </section>

      {shown && (
        <section className="box-label rounded-3xl p-6 sm:p-7" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-3xl">{STATUS_TEXT[shown.status]}</h2>
            {!FINAL.includes(shown.status) && <span className="live-dot h-3 w-3 rounded-full bg-tape" aria-hidden />}
          </div>
          <p className="mt-1 text-sm text-muted">
            {new Date(shown.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </p>
          {shown.summary && <p className="mt-4 leading-relaxed">{shown.summary}</p>}
          {shown.error && <p className="mt-4 rounded-xl bg-sun/20 p-3 text-sm">{shown.error}</p>}

          {shown.checklist.length > 0 && (
            <>
              <h3 className="mt-6 font-display text-2xl">Move-out checklist from your landlord</h3>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
                {shown.checklist.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 p-4">
                    <span className="mt-0.5 text-tape" aria-hidden>☐</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.title}</p>
                      {item.detail && <p className="text-sm text-muted">{item.detail}</p>}
                    </div>
                    <span className="shrink-0 rounded-md bg-lilac px-2 py-0.5 text-xs">
                      {LANE_TEXT[item.lane] ?? item.lane}
                      {item.due_date ? ` · ${item.due_date}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted">
                Saved to your plan.{" "}
                <Link href="/plan" className="font-semibold text-tape underline">
                  Open the plan
                </Link>
              </p>
            </>
          )}
          {shown.status === "completed" && shown.checklist.length === 0 && !shown.error && (
            <p className="mt-4 text-sm text-muted">The landlord didn&rsquo;t give any checklist items on this call.</p>
          )}

          {shown.transcript && (
            <details className="mt-6">
              <summary className="cursor-pointer py-2 text-sm font-medium">Transcript</summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-paper p-4 text-sm leading-relaxed">{shown.transcript}</pre>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
