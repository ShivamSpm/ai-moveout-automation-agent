"use client";

import { useEffect, useState } from "react";
import type { BookingResult, Quote, ServiceSearchResult } from "@/contracts/services";

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const diyTasks = [
  "Deep clean kitchen: inside oven, fridge, cabinets",
  "Bathroom: tub, tile grout, mirror, fixtures",
  "Wipe baseboards, doors and light switches",
  "Patch nail holes before the walkthrough",
  "Vacuum and mop every floor",
];

export function ServicePicker({
  result,
  live,
  problem,
}: {
  result: ServiceSearchResult;
  live: boolean;
  problem?: string;
}) {
  const steps = [
    `Searching cleaning companies near ${result.location}`,
    `Found ${result.quotes.length} companies${result.source === "apify" ? " on Google Maps" : ""}`,
    `Getting quotes for a ${result.home.bedrooms}-bedroom, ${result.home.sqft} sq ft apartment`,
    `Comparing on your ${day(result.deadline)} deadline${result.budget_usd ? ` and ${usd(result.budget_usd)} budget` : ""}`,
  ];
  const [step, setStep] = useState(0);
  const [selectedId, setSelectedId] = useState(result.recommended_id);
  const [diy, setDiy] = useState(false);
  const [booking, setBooking] = useState<"idle" | "pending" | "error">("idle");
  const [booked, setBooked] = useState<BookingResult | null>(null);

  const searching = step < steps.length;
  useEffect(() => {
    if (!searching) return;
    const timer = setTimeout(() => setStep((s) => s + 1), 900);
    return () => clearTimeout(timer);
  }, [searching, step]);

  const selected = result.quotes.find((q) => q.provider.id === selectedId) ?? null;
  const recommended = result.quotes.find((q) => q.provider.id === result.recommended_id) ?? null;

  async function book(quote: Quote) {
    setBooking("pending");
    try {
      const response = await fetch("/api/services/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: result.kind,
          provider_id: quote.provider.id,
          price_usd: quote.price_usd,
          date: quote.earliest_date,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setBooked(await response.json());
      setBooking("idle");
    } catch {
      setBooking("error");
    }
  }

  return (
    <div className="mt-10">
      {problem && <p className="mb-4 rounded-xl bg-sun/20 p-3 text-sm">{problem}</p>}

      <ol className="box-label rounded-3xl p-6" aria-live="polite">
        {steps.map((label, i) => (
          <li key={label} className={`flex items-center gap-3 py-1.5 transition ${i > step ? "opacity-30" : ""}`}>
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${
                i < step ? "tape" : i === step ? "live-dot bg-tape/30" : "bg-line"
              }`}
            >
              {i < step ? "✓" : ""}
            </span>
            {label}
          </li>
        ))}
        <li className="mt-3 flex flex-wrap gap-2 border-t border-line pt-4 text-xs">
          <span className="rounded-md bg-lilac px-2 py-1">
            {result.source === "apify" ? "Companies: Google Maps via Apify" : "Companies: demo data"}
          </span>
          <span className="rounded-md bg-lilac px-2 py-1">Quotes: simulated</span>
          <span className="rounded-md bg-lilac px-2 py-1">{live ? "Live agent" : "Agent offline: demo"}</span>
        </li>
      </ol>

      {!searching && (
        <div className="rise mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section>
            {recommended && (
              <div className="rounded-3xl bg-lilac p-6">
                <p className="text-sm font-semibold uppercase tracking-wider text-tape">The agent&rsquo;s pick</p>
                <p className="mt-2 font-display text-3xl">{recommended.provider.name}</p>
                <p className="mt-2 leading-relaxed">{result.explanation}</p>
              </div>
            )}

            <h2 className="mt-10 font-display text-3xl">All quotes</h2>
            <ul className="mt-4 space-y-3">
              {result.quotes.map((q) => {
                const ok = q.before_deadline && q.within_budget;
                const isSelected = q.provider.id === selectedId && !diy;
                return (
                  <li key={q.provider.id}>
                    <label
                      className={`block cursor-pointer rounded-2xl border bg-card p-5 transition ${
                        isSelected ? "border-tape ring-2 ring-tape/30" : "border-line hover:border-edge"
                      } ${ok ? "" : "opacity-75"}`}
                    >
                      <div className="flex items-start gap-4">
                        <input
                          type="radio"
                          name="quote"
                          className="mt-1.5 accent-[var(--tape)]"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedId(q.provider.id);
                            setDiy(false);
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-lg font-semibold">
                              {q.provider.name}
                              {q.provider.id === result.recommended_id && (
                                <span className="tape ml-2 rounded-md px-2 py-0.5 align-middle text-xs font-semibold">
                                  Agent&rsquo;s pick
                                </span>
                              )}
                            </p>
                            <p className="font-display text-3xl">{usd(q.price_usd)}</p>
                          </div>
                          <p className="mt-1 text-sm text-muted">
                            {q.provider.rating !== null && `★ ${q.provider.rating}`}
                            {q.provider.review_count !== null && ` (${q.provider.review_count} reviews)`}
                            {q.provider.neighborhood && ` · ${q.provider.neighborhood}`}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                            <span className={`rounded-full px-2.5 py-1 ${q.before_deadline ? "bg-leaf/15 text-leaf" : "bg-stamp/15 text-stamp"}`}>
                              {q.before_deadline ? "✓" : "✕"} Can come {day(q.earliest_date)}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 ${q.within_budget ? "bg-leaf/15 text-leaf" : "bg-stamp/15 text-stamp"}`}>
                              {q.within_budget ? "✓ Within budget" : "✕ Over budget"}
                            </span>
                            {q.simulated && <span className="rounded-full border border-line px-2.5 py-1 text-muted">Simulated quote</span>}
                          </div>
                          <p className="mt-3 text-sm">{q.note}</p>
                          <p className="mt-2 text-xs text-muted">Includes: {q.includes.join(" · ")}</p>
                          {(q.provider.website || q.provider.maps_url) && (
                            <a
                              href={q.provider.website ?? q.provider.maps_url ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block text-xs text-tape underline"
                            >
                              {q.provider.website ? "Website" : "Google Maps"} ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>

            <button
              onClick={() => setDiy(true)}
              className={`mt-3 w-full rounded-2xl border border-dashed p-5 text-left transition ${diy ? "border-tape bg-card" : "border-line hover:border-edge"}`}
            >
              <p className="font-semibold">I&rsquo;ll clean it myself</p>
              <p className="text-sm text-muted">Save the money; the agent gives you a room-by-room list.</p>
            </button>
          </section>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="box-label rounded-3xl p-6">
              {booked ? (
                <div>
                  <span className="stamp inline-block px-2.5 py-0.5 text-xs font-semibold text-leaf">
                    {booked.status === "simulated" ? "Simulated booking" : booked.status === "booked" ? "Booked" : "Requested"}
                  </span>
                  <p className="mt-3 font-display text-3xl">{selected?.provider.name}</p>
                  <p className="mt-1 text-muted">
                    {selected && `${day(selected.earliest_date)} · ${usd(selected.price_usd)}`}
                  </p>
                  <p className="mt-4 rounded-xl bg-paper p-3 font-mono text-sm">Order {booked.order_ref}</p>
                  <p className="mt-3 text-sm text-muted">{booked.message}</p>
                  {booked.provider_website && (
                    <a href={booked.provider_website} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-tape underline">
                      Open the company&rsquo;s site ↗
                    </a>
                  )}
                </div>
              ) : diy ? (
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-tape">Do it yourself</p>
                  <ul className="mt-4 space-y-2 text-sm">
                    {diyTasks.map((t) => (
                      <li key={t} className="flex gap-2">
                        <span className="text-tape">☐</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 rounded-xl bg-sun/20 p-3 text-sm">
                    Your lease (§12.3) asks for <strong>professional</strong> carpet cleaning with a receipt, so
                    you&rsquo;d still need a carpet service.
                  </p>
                </div>
              ) : selected ? (
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-tape">Your choice</p>
                  <p className="mt-2 font-display text-3xl">{selected.provider.name}</p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between"><dt className="text-muted">Price</dt><dd className="font-semibold">{usd(selected.price_usd)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Date</dt><dd className="font-semibold">{day(selected.earliest_date)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Deadline</dt><dd>{day(result.deadline)}</dd></div>
                  </dl>
                  {!selected.before_deadline && (
                    <p className="mt-4 rounded-xl bg-stamp/10 p-3 text-sm text-stamp">
                      They can&rsquo;t come before your deadline. The landlord may deduct for cleaning.
                    </p>
                  )}
                  <button
                    onClick={() => book(selected)}
                    disabled={booking === "pending"}
                    className="tape mt-5 w-full rounded-xl px-5 py-3.5 font-semibold transition hover:brightness-110 disabled:opacity-60"
                  >
                    {booking === "pending" ? "Booking…" : "Approve & book"}
                  </button>
                  {booking === "error" && <p className="mt-3 text-sm text-stamp">Booking failed. Try again.</p>}
                  <p className="mt-3 text-xs text-muted">Nothing is booked until you approve.</p>
                </div>
              ) : (
                <p className="text-muted">Pick a quote to continue.</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
