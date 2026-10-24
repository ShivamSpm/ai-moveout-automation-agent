import Link from "next/link";
import type { CallStatus, ChecklistItem } from "@/server/domain/landlord-call";

// One landlord call's outcome: status, summary, the top-3 checklist and the
// transcript. No hooks, so /calls (client), /move and the dashboard share it.

export interface CallViewData {
  id: string;
  status: CallStatus;
  createdAt: string;
  summary: string | null;
  transcript: string | null;
  checklist: ChecklistItem[];
  error: string | null;
}

export const FINAL: CallStatus[] = ["completed", "no_answer", "voicemail", "failed"];

const STATUS_TEXT: Record<CallStatus, string> = {
  requested: "Placing the call…",
  in_progress: "Calling your landlord…",
  completed: "Call finished",
  no_answer: "No answer",
  voicemail: "Left a voicemail",
  failed: "The call failed",
};

const LANE_TEXT: Record<string, string> = { landlord: "Landlord", cleaning: "Cleaning", moving: "Moving", admin: "Admin" };

export const callTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });

export function CallResult({ call, heading = "h2", openTranscript = false, planLink = true }: {
  call: CallViewData;
  heading?: "h2" | "h3";
  openTranscript?: boolean;
  planLink?: boolean;
}) {
  const Title = heading;
  return (
    <section className="box-label rounded-3xl p-6 sm:p-7" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title className="font-display text-3xl">{STATUS_TEXT[call.status]}</Title>
        {!FINAL.includes(call.status) && <span className="live-dot h-3 w-3 rounded-full bg-tape" aria-hidden />}
      </div>
      <p className="mt-1 text-sm text-muted">{callTime(call.createdAt)}</p>
      {call.summary && <p className="mt-4 leading-relaxed">{call.summary}</p>}
      {call.error && <p className="mt-4 rounded-xl bg-sun/20 p-3 text-sm">{call.error}</p>}

      {call.checklist.length > 0 && (
        <>
          <h3 className="mt-6 font-display text-2xl">Your landlord&rsquo;s top 3 before move-out</h3>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-card">
            {call.checklist.map((item, i) => (
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
          {planLink && (
            <p className="mt-3 text-sm text-muted">
              Saved to your plan.{" "}
              <Link href="/plan" className="font-semibold text-tape underline">
                Open the plan
              </Link>
            </p>
          )}
        </>
      )}
      {call.status === "completed" && call.checklist.length === 0 && !call.error && (
        <p className="mt-4 text-sm text-muted">The landlord didn&rsquo;t give any checklist items on this call.</p>
      )}

      {call.transcript && (
        <details className="mt-6" open={openTranscript}>
          <summary className="cursor-pointer py-2 text-sm font-medium">Transcript</summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-paper p-4 text-sm leading-relaxed">{call.transcript}</pre>
        </details>
      )}
    </section>
  );
}
