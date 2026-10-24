"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { placeLandlordCall, type PlaceCallState } from "@/app/calls/actions";
import { CallResult, FINAL, type CallViewData } from "@/components/call-result";

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
              It confirms your move-out day, asks for the three most important things to do before you leave, and
              never agrees to fees, dates or repairs for you. Calls are capped at 3 minutes and aren&rsquo;t recorded;
              the transcript is saved here.
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

      {shown && <CallResult call={shown} />}
    </div>
  );
}
