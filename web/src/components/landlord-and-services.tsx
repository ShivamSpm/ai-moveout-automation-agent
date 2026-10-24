import Link from "next/link";
import type { ToolContext } from "@/server/auth";

// Dashboard cards: the latest landlord call's top-3 checklist and the cleaning
// and moving companies the renter picked on /services. Server component.

const card = "box-label rounded-3xl p-6";
const usd = (n: number) => Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const LABEL: Record<string, string> = { cleaning: "Cleaning", moving: "Moving" };

export async function LandlordAndServices({ ctx, moveId }: { ctx: ToolContext; moveId: string }) {
  const [call, picks] = await Promise.all([
    ctx.db
      .from("landlord_calls")
      .select("status, summary, checklist, created_at")
      .eq("move_id", moveId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.db.from("service_selections").select("kind, provider_name, total_usd, slot_start, confirmation_code").eq("move_id", moveId),
  ]);
  if (call.error) throw call.error;
  if (picks.error) throw picks.error;
  const items = Array.isArray(call.data?.checklist) ? (call.data.checklist as { title: string; detail?: string | null }[]) : [];
  const chosen = (kind: string) => (picks.data ?? []).find((p) => p.kind === kind);

  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <section className={card}>
        <h2 className="font-display text-3xl">Your landlord&rsquo;s top 3</h2>
        {items.length ? (
          <>
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
            <p className="mt-4 text-sm text-muted">
              From your landlord call on {new Date(call.data!.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.{" "}
              <Link href="/calls" className="underline">See the call</Link>
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-muted">No checklist from your landlord yet.</p>
            <Link href="/calls" className="tape mt-4 inline-block rounded-xl px-4 py-2.5 font-semibold">Call your landlord</Link>
          </>
        )}
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
