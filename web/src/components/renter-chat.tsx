"use client";
import { useState, type FormEvent } from "react";
type Message = { role: "user" | "assistant"; content: string };
export function RenterChat({ initial, configured }: { initial: Message[]; configured: boolean }) {
  const [messages, setMessages] = useState(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    const content = input.trim();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content }] }) });
      if (!response.ok) {
        throw new Error(response.status === 401 ? "Your session expired. Sign in again." : response.status === 429 ? `Please retry in ${response.headers.get("Retry-After") ?? "60"} seconds.` : response.status === 503 ? "Chat isn't configured yet. Your move and documents are still available." : "Chat could not complete this reply. Please try again.");
      }
      const data = await response.json();
      setMessages(old => [...old, { role: "user", content }, { role: "assistant", content: data.reply }]); setInput("");
      if (data.warning) setError(data.warning);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not connect. Please retry."); }
    finally { setBusy(false); }
  }
  return <section className="box-label rounded-3xl p-6" id="chat"><h2 className="font-display text-3xl">Your moving assistant</h2><p className="mt-2 text-sm text-muted">Ask about your saved checklist and lease findings, or draft a message to your property manager. Chat does not send, call, book, or post.</p>
    {!configured && <p className="my-4" role="status">Chat isn’t configured yet. You can still upload your lease, review your plan, and prepare listings.</p>}
    <div className="mt-4 max-h-96 overflow-y-auto space-y-4" aria-live="polite">{messages.map((m, i) => <article key={i} className="rounded-xl border border-line p-3"><p className="text-xs uppercase text-muted">{m.role === "user" ? "You" : "Vacate"}</p><p className="mt-1 whitespace-pre-wrap break-words">{m.content}</p></article>)}</div>
    <form onSubmit={send} className="mt-4 grid gap-3"><label htmlFor="chat-input">Message</label><textarea id="chat-input" className="field" value={input} onChange={e => setInput(e.target.value)} maxLength={10000} disabled={busy || !configured} placeholder="What should I do next for my move?" /><button className="tape rounded-xl px-4 py-3 disabled:opacity-50" disabled={!configured || busy || !input.trim()}>{busy ? "Thinking…" : "Send message"}</button></form>
    {error && <p className="mt-3 text-stamp" role="alert">{error}</p>}
  </section>;
}
