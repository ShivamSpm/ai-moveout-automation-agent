"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bookCleaningAction, type BookState } from "@/app/services/actions";
import type { CleaningQuote, FindCleaningQuotesResult } from "@/contracts/cleaning";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const REASON_TEXT: Record<string, string> = {
  outside_service_area: "Doesn't serve your ZIP",
  carpet_not_offered: "No carpet cleaning",
  inside_appliances_not_offered: "Doesn't clean inside appliances",
  windows_not_offered: "No window cleaning",
  walls_not_offered: "No wall cleaning",
  pets_not_accepted: "No pets",
  insufficient_notice: "Needs more notice",
  no_availability: "Can't come before your move-out day",
  over_budget: "Over budget",
};

export function ServicesPicker({
  moveOutDate,
  zip,
  result,
}: {
  moveOutDate: string;
  zip: string;
  result: FindCleaningQuotesResult;
}) {
  const [tab, setTab] = useState<"cleaning" | "movers">("cleaning");
  const pick = result.matches[0] ?? null;
  const [selectedId, setSelectedId] = useState(pick?.providerId ?? null);
  const [slotStart, setSlotStart] = useState(pick?.slots[0]?.start ?? null);
  const [diy, setDiy] = useState(false);
  const [state, setState] = useState<BookState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const selected = result.matches.find((q) => q.providerId === selectedId) ?? null;
  // The cheapest company the agent ruled out, if it was cheaper than the pick: the "why not that one" line.
  const cheaperSkipped = result.excluded
    .filter((e) => e.quote && pick && e.quote.priceUsd.totalUsd < pick.priceUsd.totalUsd)
    .sort((a, b) => a.quote!.priceUsd.totalUsd - b.quote!.priceUsd.totalUsd)[0];

  function choose(q: CleaningQuote) {
    setSelectedId(q.providerId);
    setSlotStart(q.slots[0]?.start ?? null);
    setDiy(false);
    setState({ status: "idle" });
  }

  function book() {
    if (!selected || !slotStart) return;
    startTransition(async () => {
      setState(await bookCleaningAction({ providerId: selected.providerId, slotStart, totalUsd: selected.priceUsd.totalUsd }));
    });
  }

  return (
    <div className="mt-8">
      <div className="flex gap-2" role="tablist" aria-label="Service type">
        {(["cleaning", "movers"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-11 rounded-xl px-5 font-semibold transition ${tab === t ? "tape" : "border border-line bg-card hover:bg-paper"}`}
          >
            {t === "cleaning" ? "Cleaning" : "Movers"}
          </button>
        ))}
      </div>

      {tab === "movers" ? (
        <section className="box-label mt-6 rounded-3xl p-6 sm:p-8">
          <h2 className="font-display text-3xl">Moving companies</h2>
          <p className="mt-3 max-w-xl text-muted">
            The moving-company agent will list movers near ZIP {zip} here, with their price, the first day they can
            come before your {day(moveOutDate)} move-out, and its pick, the same way as cleaning.
          </p>
          <p className="mt-4 rounded-xl bg-sun/20 p-3 text-sm">Not connected yet: waiting for the moving-company agent.</p>
        </section>
      ) : (
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-md bg-lilac px-2 py-1">ZIP {zip}</span>
              <span className="rounded-md bg-lilac px-2 py-1">Done before {day(moveOutDate)}</span>
              <span className="rounded-md bg-lilac px-2 py-1">{result.matches.length} available · {result.excluded.length} ruled out</span>
            </div>
            <p className="mt-3 text-sm text-muted">{result.disclaimer}</p>
            {result.warnings.map((w) => (
              <p key={w} className="mt-2 rounded-xl bg-sun/20 p-3 text-sm">{w}</p>
            ))}

            {pick ? (
              <div className="mt-6 rounded-3xl bg-lilac p-6">
                <p className="text-sm font-semibold uppercase tracking-wider text-tape">The agent&rsquo;s pick</p>
                <p className="mt-2 font-display text-3xl">{pick.providerName}</p>
                <p className="mt-2 leading-relaxed">
                  Cheapest company that can finish before your move-out day: {usd(pick.priceUsd.totalUsd)}, first opening{" "}
                  {pick.slots[0] ? when(pick.slots[0].start) : "soon"}.
                  {cheaperSkipped && (
                    <>
                      {" "}Skipped {cheaperSkipped.provider.displayName} ({usd(cheaperSkipped.quote!.priceUsd.totalUsd)}):{" "}
                      {cheaperSkipped.reasons.map((r) => REASON_TEXT[r.code] ?? r.detail).join(", ").toLowerCase()}.
                    </>
                  )}
                </p>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl bg-sun/20 p-5">
                <p className="font-semibold">No cleaning company can make it before your move-out day.</p>
                <ul className="mt-2 list-disc pl-5 text-sm">{result.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}

            <h2 className="mt-10 font-display text-3xl">Available, cheapest first</h2>
            <ul className="mt-4 space-y-3">
              {result.matches.map((q) => {
                const isSel = q.providerId === selectedId && !diy;
                return (
                  <li key={q.quoteId}>
                    <div className={`rounded-2xl border bg-card p-5 transition ${isSel ? "border-tape ring-2 ring-tape/30" : "border-line"}`}>
                      <button type="button" onClick={() => choose(q)} className="block w-full text-left">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-lg font-semibold">
                            {q.providerName}
                            {q.providerId === pick?.providerId && (
                              <span className="tape ml-2 rounded-md px-2 py-0.5 align-middle text-xs font-semibold">Agent&rsquo;s pick</span>
                            )}
                          </p>
                          <p className="font-display text-3xl">{usd(q.priceUsd.totalUsd)}</p>
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          ★ {q.rating.stars} ({q.rating.reviewCount} reviews) · about {q.durationHours} h · estimate, simulated
                        </p>
                        <p className="mt-2 text-xs text-muted">Includes: {q.inclusions.join(" · ")}</p>
                      </button>
                      {isSel && q.slots.length > 0 && (
                        <fieldset className="mt-4">
                          <legend className="text-sm font-medium">Pick a time</legend>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {q.slots.slice(0, 4).map((s) => (
                              <label key={s.slotId} className={`min-h-11 cursor-pointer rounded-xl border px-3 py-2.5 text-sm ${slotStart === s.start ? "border-tape bg-lilac" : "border-line"}`}>
                                <input type="radio" name="slot" className="sr-only" checked={slotStart === s.start} onChange={() => setSlotStart(s.start)} />
                                {when(s.start)}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {result.excluded.length > 0 && (
              <details className="mt-6">
                <summary className="cursor-pointer py-2 font-medium">Why {result.excluded.length} other companies were ruled out</summary>
                <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card">
                  {result.excluded.map((e) => (
                    <li key={e.provider.id} className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm">
                      <span className="font-medium">{e.provider.displayName}{e.quote && ` · ${usd(e.quote.priceUsd.totalUsd)}`}</span>
                      <span className="text-muted">{e.reasons.map((r) => REASON_TEXT[r.code] ?? r.detail).join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <button
              type="button"
              onClick={() => { setDiy(true); setState({ status: "idle" }); }}
              className={`mt-6 w-full rounded-2xl border border-dashed p-5 text-left transition ${diy ? "border-tape bg-card" : "border-line hover:border-edge"}`}
            >
              <p className="font-semibold">I&rsquo;ll clean it myself</p>
              <p className="text-sm text-muted">Save the money; your checklist has the room-by-room tasks.</p>
            </button>
          </section>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="box-label rounded-3xl p-6" aria-live="polite">
              {state.status === "booked" ? (
                <div>
                  <span className="stamp inline-block px-2.5 py-0.5 text-xs font-semibold text-leaf">Simulated booking</span>
                  <p className="mt-3 font-display text-3xl">{state.providerName}</p>
                  <p className="mt-1 text-muted">{when(state.slotStart)} · {usd(state.totalUsd)}</p>
                  <p className="mt-4 rounded-xl bg-paper p-3 font-mono text-sm">{state.code}</p>
                  <p className="mt-3 text-sm text-muted">{state.disclaimer}</p>
                </div>
              ) : diy ? (
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-tape">Do it yourself</p>
                  <p className="mt-2 text-sm">Your cleaning tasks are on your checklist.</p>
                  <Link href="/plan" className="mt-4 inline-block font-semibold text-tape underline">Open the checklist</Link>
                </div>
              ) : selected ? (
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-tape">Your choice</p>
                  <p className="mt-2 font-display text-3xl">{selected.providerName}</p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-muted">Estimate</dt><dd className="font-semibold">{usd(selected.priceUsd.totalUsd)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted">Time</dt><dd className="text-right font-semibold">{slotStart ? when(slotStart) : "Pick a time"}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted">Move-out</dt><dd>{day(moveOutDate)}</dd></div>
                  </dl>
                  <p className="mt-3 text-xs text-muted">{selected.cancellation.summary}</p>
                  <button
                    type="button"
                    onClick={book}
                    disabled={pending || !slotStart}
                    className="tape mt-5 min-h-12 w-full rounded-xl px-5 font-semibold transition hover:brightness-110 disabled:opacity-50"
                  >
                    {pending ? "Booking…" : "Approve & book"}
                  </button>
                  {state.status === "error" && <p role="alert" className="mt-3 text-sm text-stamp">{state.message}</p>}
                  <p className="mt-3 text-xs text-muted">Simulated: no real company is contacted and nothing is charged.</p>
                </div>
              ) : (
                <p className="text-muted">Pick a company to continue.</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
