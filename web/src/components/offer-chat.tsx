"use client";

import { useRef, useState, type FormEvent } from "react";

// Rule-based stand-in for the negotiating agent. It never reveals or goes
// below the seller's minimum, and every deal waits for the seller's OK.
// Swap respond() for an OpenRouter call once the API route exists.

interface Message {
  from: "buyer" | "agent";
  text: string;
}

const round5 = (n: number) => Math.round(n / 5) * 5;

export function OfferChat({
  itemName,
  ask,
  floor,
  sellerName,
}: {
  itemName: string;
  ask: number;
  floor: number;
  sellerName: string;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      from: "agent",
      text: `Hi! I'm the agent handling ${sellerName}'s ${itemName}. It's still available. Ask me anything or make an offer.`,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [lastCounter, setLastCounter] = useState<number | null>(null);
  const [deal, setDeal] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  function respond(text: string): string {
    const match = text.replace(/,/g, "").match(/\$?\s*(\d{2,5})/);
    const lower = text.toLowerCase();

    if (!match) {
      if (/(available|still)/.test(lower)) return "Yes, still available. Pickup is in the Mission, near 24th St BART.";
      if (/(pick ?up|where|when|deliver)/.test(lower))
        return "Pickup only, weekends work best. I'll suggest a public meeting spot once we agree on a price.";
      if (/(condition|damage|scratch|stain)/.test(lower))
        return "It's in the condition listed, and the photos are recent. No pets, no smoke.";
      return `Happy to help. The asking price is $${ask}. What would you like to offer?`;
    }

    const offer = Number(match[1]);
    const target = lastCounter ?? ask;

    if (offer >= target) {
      setDeal(offer);
      return `Deal at $${offer}. I've sent it to ${sellerName} to confirm, and you'll get a pickup time by email. First option: Saturday 11am, meeting at the 24th St BART plaza.`;
    }
    if (offer < floor) {
      const counter = round5(floor + (ask - floor) * 0.45);
      setLastCounter(counter);
      return `That's lower than ${sellerName} can do. Could you do $${counter}?`;
    }
    const counter = round5((offer + target) / 2);
    if (counter - offer <= 10) {
      setDeal(offer);
      return `You've got it at $${offer}. Sending to ${sellerName} for a final OK now.`;
    }
    setLastCounter(counter);
    return `Thanks for the offer. Can you meet me at $${counter}? That includes pickup help getting it downstairs.`;
  }

  function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || deal) return;
    const reply = respond(text);
    setMessages((prev) => [...prev, { from: "buyer", text }, { from: "agent", text: reply }]);
    setDraft("");
    requestAnimationFrame(() =>
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }),
    );
  }

  return (
    <section className="flex h-[520px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate text-white shadow-[0_18px_40px_-24px_rgba(16,24,27,0.35)]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="font-display text-2xl leading-none">Make an offer</p>
          <p className="font-mono text-[11px] text-white/50">Answered by Vacate&rsquo;s agent · seller approves every deal</p>
        </div>
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-white/60">
          <span className="live-dot h-2 w-2 rounded-full bg-leaf" /> Online
        </span>
      </div>

      <ol ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-5" aria-live="polite">
        {messages.map((m, i) => (
          <li key={i} className={`flex ${m.from === "buyer" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.from === "buyer" ? "rounded-br-sm bg-tape text-tape-ink" : "rounded-bl-sm bg-white/10"
              }`}
            >
              {m.text}
            </p>
          </li>
        ))}
        {deal && (
          <li className="flex justify-center pt-2">
            <span className="stamp px-3 py-1 font-mono text-xs font-bold uppercase text-leaf">
              Pending seller OK · ${deal}
            </span>
          </li>
        )}
      </ol>

      <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-3">
        <label htmlFor="offer" className="sr-only">
          Message the seller&rsquo;s agent
        </label>
        <input
          id="offer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!!deal}
          placeholder={deal ? "Offer sent to seller" : `Try "would you take $${round5(ask * 0.7)}?"`}
          className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-tape"
        />
        <button
          type="submit"
          disabled={!!deal}
          className="rounded-full bg-tape px-5 py-2.5 text-sm font-semibold text-tape-ink transition hover:brightness-105 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}
