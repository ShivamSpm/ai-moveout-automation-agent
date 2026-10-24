"use client";
import { useRef, useState, type FormEvent } from "react";
import { CHAT_MESSAGE_FIELD, CHAT_PHOTO_FIELD, type AgentEvent, type ChatResponse } from "@/contracts/agent-events";
import { ACCEPTED_PHOTO_MIME_TYPES, MAX_PHOTO_BYTES } from "@/contracts/inventory";
import { EventCards } from "@/components/chat/event-cards";
type Message = { role: "user" | "assistant"; content: string; events?: AgentEvent[] };
export function RenterChat({ initial, configured }: { initial: Message[]; configured: boolean }) {
  const [messages, setMessages] = useState<Message[]>(initial);
  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  function clearPhoto() { setPhoto(null); if (fileRef.current) fileRef.current.value = ""; }
  function pickPhoto(file: File | undefined) {
    if (!file) return clearPhoto();
    if (!(ACCEPTED_PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) { clearPhoto(); return setError("Attach a JPEG, PNG or WebP photo."); }
    if (file.size > MAX_PHOTO_BYTES) { clearPhoto(); return setError("That photo is too large. Use one under 3.7 MB."); }
    setError(""); setPhoto(file);
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    const content = input.trim();
    setBusy(true); setError("");
    try {
      let init: RequestInit;
      if (photo) {
        const form = new FormData();
        form.append(CHAT_MESSAGE_FIELD, content);
        form.append(CHAT_PHOTO_FIELD, photo);
        init = { method: "POST", body: form };
      } else {
        init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content }] }) };
      }
      const response = await fetch("/api/chat", init);
      if (!response.ok) {
        throw new Error(response.status === 401 ? "Your session expired. Sign in again." : response.status === 429 ? `Please retry in ${response.headers.get("Retry-After") ?? "60"} seconds.` : response.status === 503 ? "Chat isn't configured yet. Your move and documents are still available." : response.status === 413 || response.status === 415 ? "That photo could not be used. Try a smaller JPEG, PNG or WebP." : "Chat could not complete this reply. Please try again.");
      }
      const data = (await response.json()) as Partial<ChatResponse>;
      const events = Array.isArray(data.events) ? data.events : [];
      const userContent = photo ? `${content}\n[Photo: ${photo.name}]` : content;
      setMessages(old => [...old, { role: "user", content: userContent }, { role: "assistant", content: data.reply ?? "", events }]); setInput(""); clearPhoto();
      if (data.warning) setError(data.warning);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not connect. Please retry."); }
    finally { setBusy(false); }
  }
  const disabled = busy || !configured;
  return <section className="box-label rounded-3xl p-6" id="chat"><h2 className="font-display text-3xl">Your moving assistant</h2><p className="mt-2 text-sm text-muted">Ask about your checklist and lease findings, attach a room photo for an inventory, or get simulated cleaning and moving quotes. Nothing is booked or paid until you approve, and bookings here are simulated.</p>
    {!configured && <p className="my-4" role="status">Chat isn’t configured yet. You can still upload your lease, review your plan, and prepare listings.</p>}
    <div className="mt-4 max-h-[32rem] overflow-y-auto space-y-4" aria-live="polite">{messages.map((m, i) => <div key={i} className="space-y-3"><article className="rounded-xl border border-line p-3"><p className="text-xs uppercase text-muted">{m.role === "user" ? "You" : "Vacate"}</p><p className="mt-1 whitespace-pre-wrap break-words">{m.content}</p></article>{m.events && <EventCards events={m.events} />}</div>)}
      {busy && <p className="text-sm text-muted" role="status">Thinking… this can take up to a minute.</p>}</div>
    <form onSubmit={send} className="mt-4 grid gap-3"><label htmlFor="chat-input">Message</label><textarea id="chat-input" className="field" value={input} onChange={e => setInput(e.target.value)} maxLength={10000} disabled={disabled} placeholder="What should I do next for my move?" />
      <div className="flex flex-wrap items-center gap-3"><label htmlFor="chat-photo" className="text-sm">Room photo (optional)</label><input id="chat-photo" ref={fileRef} type="file" accept={ACCEPTED_PHOTO_MIME_TYPES.join(",")} disabled={disabled} onChange={e => pickPhoto(e.target.files?.[0])} className="text-sm" />
        {photo && <span className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs"><span className="max-w-48 truncate">{photo.name}</span><button type="button" onClick={clearPhoto} disabled={busy} aria-label={`Remove photo ${photo.name}`} className="text-muted">×</button></span>}</div>
      <button className="tape rounded-xl px-4 py-3 disabled:opacity-50" disabled={disabled || !input.trim()}>{busy ? "Thinking…" : "Send message"}</button></form>
    {error && <p className="mt-3 text-stamp" role="alert">{error}</p>}
  </section>;
}
