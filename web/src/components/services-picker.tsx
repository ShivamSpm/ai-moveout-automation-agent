"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { selectServiceAction } from "@/app/services/actions";
import type { SavedSelection, ServiceKind, ServiceSection } from "@/server/services";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const TITLE: Record<ServiceKind, string> = { cleaning: "Cleaning company", moving: "Moving company" };
const SHOWN = 3;

export function ServicesPicker({
  moveOutDate,
  sections,
  saved,
}: {
  moveOutDate: string | null;
  sections: ServiceSection[];
  saved: SavedSelection[];
}) {
  return (
    <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-10">
      {sections.map((section) => (
        <Section
          key={section.kind}
          section={section}
          moveOutDate={moveOutDate}
          initial={saved.find((s) => s.kind === section.kind) ?? null}
        />
      ))}
    </div>
  );
}

function Section({ section, moveOutDate, initial }: { section: ServiceSection; moveOutDate: string | null; initial: SavedSelection | null }) {
  const [selection, setSelection] = useState<SavedSelection | null>(initial);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const options = section.options.slice(0, SHOWN);
  const pick = options[0];
  const cheaperSkipped = pick
    ? section.skipped.filter((s) => s.totalUsd !== null && s.totalUsd < pick.totalUsd).sort((a, b) => a.totalUsd! - b.totalUsd!)[0]
    : undefined;

  function choose(providerId: string, totalUsd: number) {
    setError(null);
    setSavingId(providerId);
    startTransition(async () => {
      const result = await selectServiceAction({ kind: section.kind, providerId, totalUsd });
      setSavingId(null);
      if (!result.ok) return setError(result.message);
      setSelection(result.saved);
      setJustSaved(providerId);
      setTimeout(() => setJustSaved((id) => (id === providerId ? null : id)), 2200);
    });
  }

  return (
    <section aria-labelledby={`${section.kind}-title`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={`${section.kind}-title`} className="font-display text-4xl">{TITLE[section.kind]}</h2>
        {selection && (
          <p className="rounded-full bg-leaf/15 px-3 py-1 text-sm font-medium text-leaf">
            ✓ Saved: {selection.providerName} · {usd(selection.totalUsd)}
          </p>
        )}
      </div>

      {section.missing.length > 0 ? (
        <div className="box-label mt-4 rounded-3xl p-6">
          <p>To compare companies, add {section.missing.join(", ")}.</p>
          <Link href="/move" className="mt-3 inline-block font-semibold text-tape underline">Go to My move</Link>
        </div>
      ) : options.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-sun/20 p-5">
          <p className="font-semibold">No company can make it before your move-out day.</p>
          <ul className="mt-2 list-disc pl-5 text-sm">{section.emptyReasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            {pick && <>The agent picks <strong className="text-ink">{pick.providerName}</strong>: the cheapest that finishes before your move-out day. </>}
            {cheaperSkipped && <>Skipped {cheaperSkipped.name} ({usd(cheaperSkipped.totalUsd!)}): {cheaperSkipped.why}.</>}
          </p>
          {section.assumptions.length > 0 && (
            <p className="mt-1 text-xs text-muted">Estimate assumes: {section.assumptions.join(" · ")}.</p>
          )}

          <ul className="mt-5 grid gap-4 md:grid-cols-3">
            {options.map((o, i) => {
              const isSelected = selection?.providerId === o.providerId;
              const isSaving = savingId === o.providerId;
              const pop = justSaved === o.providerId;
              return (
                <li key={o.providerId}>
                  <article
                    className={`relative flex h-full flex-col rounded-3xl border bg-card p-5 transition ${
                      isSelected ? "border-tape ring-2 ring-tape/30" : "border-line"
                    } ${pop ? "saved-pop" : ""}`}
                  >
                    {i === 0 && <span className="tape absolute -top-3 left-5 rounded-md px-2 py-0.5 text-xs font-semibold">Agent&rsquo;s pick</span>}
                    <p className="mt-1 text-lg font-semibold leading-snug">{o.providerName}</p>
                    <p className="mt-1 text-sm text-muted">★ {o.rating} ({o.reviewCount} reviews, simulated)</p>
                    <p className="mt-4 font-display text-4xl">{usd(o.totalUsd)}</p>
                    <p className="text-xs text-muted">estimate</p>
                    {o.firstSlot && <p className="mt-3 text-sm">First opening <strong>{when(o.firstSlot)}</strong></p>}
                    <ul className="mt-3 flex-1 space-y-1 text-xs text-muted">
                      {o.highlights.map((h) => <li key={h}>· {h}</li>)}
                    </ul>
                    <button
                      type="button"
                      onClick={() => choose(o.providerId, o.totalUsd)}
                      disabled={isSaving || Boolean(savingId)}
                      aria-pressed={isSelected}
                      className={`mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition ${
                        isSelected ? "bg-leaf text-white" : "tape hover:brightness-110"
                      } disabled:opacity-70`}
                    >
                      {isSaving ? (
                        <><span className="live-dot h-2 w-2 rounded-full bg-current" /> Saving…</>
                      ) : isSelected ? (
                        <><span className={pop ? "saved-check" : ""}>✓</span> Selected</>
                      ) : (
                        "Select"
                      )}
                    </button>
                    {isSelected && selection?.confirmationCode && (
                      <p className="mt-2 text-center font-mono text-xs text-muted">{selection.confirmationCode} · simulated</p>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
          {error && <p role="alert" className="mt-3 rounded-xl bg-stamp/10 p-3 text-sm text-stamp">{error}</p>}
          <p className="mt-3 text-xs text-muted">{section.disclaimer}</p>
          {section.skipped.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer py-2 text-sm font-medium">Why {section.skipped.length} other companies were ruled out</summary>
              <ul className="mt-1 divide-y divide-line rounded-2xl border border-line bg-card text-sm">
                {section.skipped.map((s) => (
                  <li key={s.name} className="flex flex-wrap justify-between gap-2 p-3">
                    <span className="font-medium">{s.name}{s.totalUsd !== null && ` · ${usd(s.totalUsd)}`}</span>
                    <span className="text-muted">{s.why}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
