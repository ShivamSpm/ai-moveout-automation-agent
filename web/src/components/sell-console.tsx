"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { Database } from "@/server/db/database.types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
type ListingRow = Row<"listings"> & { items: Pick<Row<"items">, "id" | "name" | "ask_cents" | "floor_cents" | "status"> };

export interface SellState {
  move: { moveOutDate: string | null; timezone: string; areaLabel: string | null };
  cutoff: string | null;
  pastCutoff: boolean;
  telegram: { configured: boolean };
  listings: ListingRow[];
  conversations: Row<"conversations">[];
  messages: Pick<Row<"messages">, "conversation_id" | "direction" | "body" | "source" | "created_at">[];
  actions: Row<"actions">[];
}

interface DealPayload {
  conversationId: string;
  itemId: string;
  buyerLabel: string;
  priceCents: number;
  pickupStart: string;
}

const card = "box-label rounded-3xl p-6";
const input = "w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm focus:border-edge focus:outline-none";
const btn = "tape rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40";
const ghost = "rounded-xl border-2 border-line px-4 py-2 text-sm font-semibold disabled:opacity-40";

const usd = (cents: number | null | undefined) => (cents === null || cents === undefined ? "—" : `$${(cents / 100).toFixed(0)}`);

async function post(url: string, body: BodyInit, json = true) {
  const res = await fetch(url, { method: "POST", body, headers: json ? { "content-type": "application/json" } : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

const dealStatus: Record<string, string> = {
  negotiating: "Negotiating",
  awaiting_seller: "Waiting for you",
  confirmed: "Deal confirmed",
  closed: "Closed",
};

export function SellConsole({ initial }: { initial: SellState }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", description: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = async () => setState(await post("/api/sell/ops", JSON.stringify({ op: "state" })));

  // Buyer chats arrive through Telegram, so keep the page current while it is open.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void refresh().catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function choosePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhoto(file);
    if (!file) return;
    setSuggesting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("photo", file);
      const suggestion = await post("/api/sell/describe", form, false);
      setDraft((d) => ({ title: d.title || suggestion.title, description: d.description || suggestion.description }));
    } catch (err) {
      setError(`No suggestion from the photo: ${err instanceof Error ? err.message : err}. Type a title and description instead.`);
    } finally {
      setSuggesting(false);
    }
  }

  function addItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (!photo) return setError("Add a photo of the item");
    f.set("photo", photo);
    void run(async () => {
      await post("/api/sell/items", f, false);
      form.reset();
      setPhoto(null);
      setDraft({ title: "", description: "" });
    });
  }

  const deals = state.actions.filter((a) => a.kind === "pickup.confirm" && a.status === "pending_review");
  const publishAction = (listingId: string) =>
    state.actions.find((a) => a.kind === "listing.publish" && (a.payload as { listingId?: string }).listingId === listingId);
  const local = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { timeZone: state.move.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="grid gap-6">
      {error && <p className="rounded-xl bg-stamp/10 px-4 py-3 text-sm text-stamp">{error}</p>}
      {!state.telegram.configured && (
        <p className="rounded-xl bg-sun/40 px-4 py-3 text-sm">
          Telegram isn&apos;t configured on this deployment yet, so listings can be drafted but not posted. See web/README.md.
        </p>
      )}
      {!state.move.moveOutDate ? (
        <p className="rounded-xl bg-sun/40 px-4 py-3 text-sm">
          Set your move-out date on <a href="/start" className="underline">/start</a> first. Pickups end the day before it.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Pickups must happen by <span className="font-semibold text-ink">{state.cutoff && local(state.cutoff)}</span>, the day before you move out.
          Prices step down toward your minimum as that gets closer.
        </p>
      )}

      {deals.length > 0 && (
        <section className={`${card} ring-2 ring-sun`}>
          <h2 className="font-display text-3xl">Deals waiting for you</h2>
          <ul className="mt-4 grid gap-4">
            {deals.map((a) => {
              const deal = a.payload as unknown as DealPayload;
              return (
                <li key={a.id} className="rounded-2xl bg-paper p-4 ring-1 ring-line">
                  <p className="font-semibold">{a.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {deal.buyerLabel} · {usd(deal.priceCents)} · pickup {local(deal.pickupStart)}
                  </p>
                  <form
                    className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const address = String(new FormData(e.currentTarget).get("address") ?? "");
                      void run(() => post("/api/sell/ops", JSON.stringify({ op: "confirm_deal", actionId: a.id, address })));
                    }}
                  >
                    <input name="address" required minLength={5} placeholder="Meetup address to send this buyer" className={input} />
                    <button disabled={busy} className={btn}>Approve</button>
                    <button
                      type="button"
                      disabled={busy}
                      className={ghost}
                      onClick={() => void run(() => post("/api/sell/ops", JSON.stringify({ op: "decline_deal", actionId: a.id })))}
                    >
                      Decline
                    </button>
                  </form>
                  <p className="mt-2 text-xs text-muted">Approve sends this buyer the confirmation and address, and tells other buyers it sold.</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className={card}>
        <h2 className="font-display text-3xl">Add an item</h2>
        <p className="mt-1 text-sm text-muted">One photo per item. The agent suggests a title and description from it; edit them as you like.</p>
        <form onSubmit={addItem} className="mt-4 grid gap-3">
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} className="text-sm" />
          {suggesting && <p className="text-sm text-muted">Looking at your photo…</p>}
          <input
            name="title"
            required
            maxLength={80}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Title, e.g. 27-inch Dell monitor"
            className={input}
          />
          <textarea
            name="description"
            required
            maxLength={1000}
            rows={3}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Description and features, e.g. 144 Hz, 27 inch, includes stand"
            className={input}
          />
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input name="askUsd" type="number" required min={1} step="1" placeholder="Asking price ($)" className={input} />
            <input name="floorUsd" type="number" required min={0} step="1" placeholder="Minimum price ($), never shown" className={input} />
            <button disabled={busy || suggesting || !state.move.moveOutDate} className={btn}>Save draft</button>
          </div>
        </form>
      </section>

      <section className={card}>
        <h2 className="font-display text-3xl">Your listings</h2>
        <ul className="mt-4 grid gap-4">
          {state.listings.length === 0 && <li className="text-sm text-muted">No items yet.</li>}
          {state.listings.map((listing) => {
            const action = publishAction(listing.id);
            const convs = state.conversations.filter((c) => c.listing_id === listing.id);
            const unsold = listing.status === "published" && listing.items.status === "listed";
            return (
              <li key={listing.id} className="rounded-2xl bg-paper p-4 ring-1 ring-line">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{listing.title}</p>
                  <span className="rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold ring-1 ring-line">
                    {listing.items.status === "reserved" ? "Sold, pickup arranged" : listing.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  Now {usd(listing.price_cents)} · asked {usd(listing.items.ask_cents)} · your minimum {usd(listing.items.floor_cents)}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-ink/80">{listing.body}</p>
                {listing.external_url && (
                  <a href={listing.external_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline">
                    View the channel post
                  </a>
                )}
                {action?.error && <p className="mt-2 text-sm text-stamp">{action.error}</p>}
                {action?.status === "pending_review" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={busy || !state.telegram.configured}
                      className={btn}
                      onClick={() => void run(() => post("/api/sell/ops", JSON.stringify({ op: "publish", actionId: action.id, payloadHash: action.payload_hash })))}
                    >
                      Approve &amp; post to Telegram
                    </button>
                    <button disabled={busy} className={ghost} onClick={() => void run(() => post("/api/sell/ops", JSON.stringify({ op: "discard_listing", actionId: action.id })))}>
                      Discard
                    </button>
                  </div>
                )}
                {unsold && state.pastCutoff && (
                  <p className="mt-3 rounded-xl bg-stamp/10 px-3 py-2 text-sm text-stamp">No good buyer was found before your pickup deadline.</p>
                )}
                {convs.length > 0 && (
                  <ul className="mt-3 divide-y divide-dashed divide-line border-t border-dashed border-line">
                    {convs.map((c) => (
                      <li key={c.id} className="py-2 text-sm">
                        <button className="flex w-full justify-between gap-2 text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
                          <span className="font-medium">{c.buyer_label}</span>
                          <span className="text-muted">
                            {dealStatus[c.deal_status] ?? c.deal_status}
                            {c.offer_cents !== null ? ` · ${usd(c.offer_cents)}` : ""}
                          </span>
                        </button>
                        {open === c.id && (
                          <ol className="mt-2 grid gap-1">
                            {state.messages
                              .filter((m) => m.conversation_id === c.id)
                              .map((m, i) => (
                                <li key={i} className={m.direction === "inbound" ? "text-ink" : "text-muted"}>
                                  <span className="font-semibold">{m.direction === "inbound" ? c.buyer_label : "Agent"}:</span> {m.body}
                                </li>
                              ))}
                          </ol>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
