import Link from "next/link";
import type { ToolContext } from "@/server/auth";
import { FINAL, callTime } from "@/components/call-result";
import { callHistory } from "@/server/landlord-calls";

// Dashboard cards: the latest landlord call's top-3 checklist and the cleaning
// and moving companies the renter picked on /services. Server component.

const card = "box-label rounded-3xl p-6";
const usd = (n: number) => Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const LABEL: Record<string, string> = { cleaning: "Cleaning", moving: "Moving" };

export async function LandlordAndServices({ ctx, moveId }: { ctx: ToolContext; moveId: string }) {
  const [calls, picks] = await Promise.all([
    callHistory(ctx),
    ctx.db.from("service_selections").select("kind, provider_name, total_usd, slot_start, confirmation_code").eq("move_id", moveId),
  ]);
  if (picks.error) throw picks.error;
  const latest = calls[0];
  const done = calls.find((c) => c.status === "completed");
  const items = done?.checklist ?? [];
  const chosen = (kind: string) => (picks.data ?? []).find((p) => p.kind === kind);

  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <section className={card}>
        <h2 className="font-display text-3xl">Your landlord&rsquo;s top 3</h2>
        {latest && !FINAL.includes(latest.status) && (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-paper p-3 text-sm">
            <span className="live-dot h-2.5 w-2.5 rounded-full bg-tape" aria-hidden /> Calling your landlord now.{" "}
            <Link href="/calls" className="font-semibold underline">Follow the call</Link>
          </p>
        )}
        {done ? (
          <>
            {items.length ? (
              <ol className="mt-4 space-y-3">
                {items.slice(0, 3).map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="tape grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold">{i + 1}</span>
                    <span>
                      <strong>{item.title}</strong>
                      {item.detail && <span className="block text-sm text-muted">{item.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-muted">Your landlord didn&rsquo;t give checklist items on the call.</p>
            )}
            {done.summary && <p className="mt-4 text-sm leading-relaxed">{done.summary}</p>}
            {done.transcript && (
              <details className="mt-4">
                <summary className="cursor-pointer py-1 text-sm font-medium">Transcript</summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-paper p-4 text-sm leading-relaxed">{done.transcript}</pre>
              </details>
            )}
            <p className="mt-4 text-sm text-muted">
              From your landlord call on {callTime(done.createdAt)}.{" "}
              <Link href="/calls" className="underline">See the call</Link>
            </p>
          </>
        ) : latest && FINAL.includes(latest.status) ? (
          <>
            <p className="mt-4 text-muted">
              Your last call ({callTime(latest.createdAt)}) ended without a checklist
              {latest.status === "no_answer" ? ": no answer" : latest.status === "voicemail" ? ": it reached voicemail" : ""}.
            </p>
            <Link href="/calls" className="tape mt-4 inline-block rounded-xl px-4 py-2.5 font-semibold">Call again</Link>
          </>
        ) : !latest ? (
          <>
            <p className="mt-4 text-muted">No checklist from your landlord yet.</p>
            <Link href="/calls" className="tape mt-4 inline-block rounded-xl px-4 py-2.5 font-semibold">Call your landlord</Link>
          </>
        ) : null}
      </section>

      <section className={card}>
        <h2 className="font-display text-3xl">Your cleaners &amp; movers</h2>
        <ul className="mt-4 space-y-3">
          {(["cleaning", "moving"] as const).map((kind) => {
            const pick = chosen(kind);
            return (
              <li key={kind} className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
                <span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-tape">{LABEL[kind]}</span>
                  <strong className="block">{pick ? pick.provider_name : "Not chosen yet"}</strong>
                  {pick?.slot_start && (
                    <span className="text-sm text-muted">
                      {new Date(pick.slot_start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric" })}
                      {pick.confirmation_code && ` · ${pick.confirmation_code}`}
                    </span>
                  )}
                </span>
                {pick ? <span className="font-display text-2xl">{usd(pick.total_usd)}</span> : null}
              </li>
            );
          })}
        </ul>
        <Link href="/services" className="mt-4 inline-block font-semibold text-tape underline">
          {chosen("cleaning") && chosen("moving") ? "Change your picks" : "Choose cleaners & movers"}
        </Link>
      </section>
    </div>
  );
}
