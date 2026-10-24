"use client";

import { useState } from "react";
import type { AgentEvent } from "@/contracts/agent-events";
import type { BookingResult, CleaningQuote, FindCleaningQuotesResult } from "@/contracts/cleaning";
import type { ProposedInventory } from "@/contracts/inventory";
import type { FindMovingQuotesResult, MovingQuote } from "@/contracts/moving";
import { reasonLabel, resaleRange, slotTime, usd } from "./format";

const card = "rounded-xl border border-line p-3 text-sm";
const SIM_NOTE = "Simulated: no real booking or payment";

export function EventCards({ events }: { events: AgentEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="ml-4 space-y-3">
      {events.map((event, i) => (
        <EventCard key={i} event={event} />
      ))}
    </div>
  );
}

function EventCard({ event }: { event: AgentEvent }) {
  switch (event.type) {
    case "inventory":
      return <InventoryCard inventory={event.data} />;
    case "cleaning_quotes":
      return <QuotesCard service="cleaning" result={event.data} />;
    case "moving_quotes":
      return <QuotesCard service="moving" result={event.data} />;
    case "booking_proposal":
      return <ProposalCard service={event.service} proposal={event.data} />;
    case "tool_error":
      return (
        <p className="text-xs text-muted" role="note">
          Warning: {event.tool} did not complete. {event.message}
        </p>
      );
    default:
      return null;
  }
}

function InventoryCard({ inventory }: { inventory: ProposedInventory }) {
  return (
    <section className={card} aria-label="Photo inventory">
      <p className="text-xs uppercase text-muted">Inventory · {inventory.roomType}</p>
      {!inventory.items.length && <p className="mt-2 text-muted">No items identified in this photo.</p>}
      <ul className="mt-2 space-y-1">
        {inventory.items.map((item, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{item.name}</span>
            <span className="text-muted">
              ×{item.quantity} · {item.size_class} · {item.condition} · resale {resaleRange(item.estimated_resale_usd)}
            </span>
            <span className="rounded-full border border-line px-2 text-[10px] uppercase">{item.status}</span>
          </li>
        ))}
      </ul>
      {inventory.warnings.map((w, i) => (
        <p key={i} className="mt-1 text-xs text-muted">{w}</p>
      ))}
    </section>
  );
}

type QuotesProps =
  | { service: "cleaning"; result: FindCleaningQuotesResult }
  | { service: "moving"; result: FindMovingQuotesResult };

function QuotesCard({ service, result }: QuotesProps) {
  const matches: (CleaningQuote | MovingQuote)[] = result.matches;
  return (
    <section className={card} aria-label={`${service} quotes`}>
      <p className="text-xs uppercase text-muted">
        {service === "cleaning" ? "Cleaning" : "Moving"} quotes · catalog: {result.catalogSource}
      </p>
      <p className="mt-1 text-xs text-muted">{result.disclaimer}</p>
      {!matches.length && (
        <p className="mt-2 text-muted">No matching companies.{result.reasons.length ? ` ${result.reasons.join(" ")}` : ""}</p>
      )}
      <ul className="mt-2 space-y-2">
        {matches.map((q) => (
          <li key={q.quoteId} className="rounded-lg border border-line p-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{q.providerName}</span>
              <span>
                {usd(q.priceUsd.totalUsd)} <span className="text-xs text-muted">estimate</span>
              </span>
            </div>
            {"estimate" in q && (
              <p className="text-xs text-muted">
                Crew of {q.estimate.crewSize} · about {q.estimate.laborHours + q.estimate.driveHours} hours
              </p>
            )}
            <ul className="mt-1 text-xs text-muted">
              {q.slots.slice(0, 3).map((s) => (
                <li key={s.slotId}>{slotTime(s.start, s.end)}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {result.excluded.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted">{result.excluded.length} companies excluded</summary>
          <ul className="mt-1 space-y-1 text-xs">
            {result.excluded.map((x) => (
              <li key={x.provider.id}>
                <span className="font-medium">{x.provider.displayName}</span>:{" "}
                <span className="text-muted">{x.reasons.map((r) => reasonLabel(r.code)).join(", ")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

type ProposalProps = Extract<AgentEvent, { type: "booking_proposal" }>;
type ProposalCardProps = { service: ProposalProps["service"]; proposal: ProposalProps["data"] };

function ProposalCard({ service, proposal }: ProposalCardProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [error, setError] = useState("");
  const confirmed = result?.status === "simulated_confirmed";

  async function approve() {
    if (busy || confirmed) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/${service}/bookings/${encodeURIComponent(proposal.id)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey }),
      });
      const body = (await response.json().catch(() => null)) as { result?: BookingResult; error?: { message?: string } } | null;
      if (!response.ok || !body?.result) {
        throw new Error(body?.error?.message ?? (response.status === 401 ? "Sign in again to approve." : "Approval failed. Please retry."));
      }
      setResult(body.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={card} aria-label={`${service} booking proposal`}>
      <p className="text-xs uppercase text-muted">Booking proposal · {service}</p>
      <p className="mt-1 font-medium">{proposal.quote.providerName}</p>
      <p className="text-muted">{slotTime(proposal.slot.start, proposal.slot.end)}</p>
      <p>
        {usd(proposal.quote.priceUsd.totalUsd)} <span className="text-xs text-muted">estimate</span>
      </p>
      <p className="mt-1 text-xs uppercase text-muted">Status: {result ? result.status.replace(/_/g, " ") : "pending review"}</p>
      <button
        type="button"
        onClick={approve}
        disabled={busy || confirmed}
        aria-label={`Approve simulated ${service} booking with ${proposal.quote.providerName}`}
        className="tape mt-2 rounded-xl px-4 py-2 disabled:opacity-50"
      >
        {busy ? "Approving…" : confirmed ? "Approved" : "Approve"}
      </button>
      <div aria-live="polite">
        {result?.status === "simulated_confirmed" && (
          <p className="mt-2">
            Confirmed (simulated): <span className="font-mono">{result.confirmationCode}</span>
          </p>
        )}
        {result?.status === "rejected" && (
          <p className="mt-2 text-stamp">
            Rejected ({reasonLabel(result.reason)}): {result.message}
          </p>
        )}
        {error && <p className="mt-2 text-stamp" role="alert">{error}</p>}
      </div>
      <p className="mt-2 text-xs text-muted">{SIM_NOTE}</p>
    </section>
  );
}
