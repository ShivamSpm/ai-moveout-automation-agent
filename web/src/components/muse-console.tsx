"use client";

import { useState, type FormEvent } from "react";
import type { Database } from "@/server/db/database.types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
type TokenRow = Pick<Row<"connector_tokens">, "id" | "label" | "token_hint" | "created_at" | "last_used_at" | "revoked_at">;

export interface MuseState {
  move: Row<"moves">;
  items: Row<"items">[];
  listings: Row<"listings">[];
  actions: Row<"actions">[];
  conversations: Row<"conversations">[];
  messages: Row<"messages">[];
  reservations: Row<"reservations">[];
  connectorTokens: TokenRow[];
}

const usd = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "—" : cents === 0 ? "Free" : `$${(cents / 100).toFixed(0)}`;

// Plain-language status, keeping "reported by Muse" distinct from verified.
function actionLabel(a: Row<"actions">): { text: string; tone: string } {
  switch (a.status) {
    case "pending_review":
      return { text: "Draft · needs your OK", tone: "bg-sun text-tape-ink" };
    case "approved":
      return { text: "Approved · waiting for Muse", tone: "bg-sky/30 text-ink" };
    case "executing":
      return { text: "Muse is on it", tone: "bg-lilac/40 text-ink" };
    case "succeeded":
      return { text: "Done by Muse · reported", tone: "bg-leaf/30 text-ink" };
    case "failed":
      return { text: "Muse reported a failure", tone: "bg-stamp/15 text-stamp" };
    case "unknown":
      return { text: "Outcome unknown · check Facebook", tone: "bg-stamp/15 text-stamp" };
    default:
      return { text: "Cancelled", tone: "bg-line text-muted" };
  }
}

const card = "box-label rounded-3xl p-6";
const input = "w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm focus:border-edge focus:outline-none";
const btn = "tape rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40";
const ghost = "rounded-xl border-2 border-line px-4 py-2 text-sm font-semibold disabled:opacity-40";

export function MuseConsole({
  initial,
  endpoints,
}: {
  initial: MuseState;
  endpoints: { agentCard: string; a2a: string; mcp: string };
}) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  async function op(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/muse/ops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      const fresh = await fetch("/api/muse/ops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "state" }),
      }).then((r) => r.json());
      setState(fresh);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const listingFor = (itemId: string) => state.listings.filter((l) => l.item_id === itemId).at(-1);
  const actionForListing = (listingId: string) =>
    state.actions.find((a) => a.kind === "listing.publish" && (a.payload as { listingId?: string }).listingId === listingId);

  function addItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ask = f.get("ask") ? Number(f.get("ask")) : undefined;
    void op({ op: "add_item", name: f.get("name"), condition: f.get("condition") || undefined, askUsd: ask }).then(
      (added) => added && form.reset(),
    );
  }

  function saveArea(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void op({
      op: "update_move",
      areaLabel: f.get("area") || null,
      addressPrivate: f.get("address") || null,
    });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid content-start gap-6">
        {error && <p className="rounded-xl bg-stamp/10 px-4 py-3 text-sm text-stamp">{error}</p>}

        <section className={card}>
          <h2 className="font-display text-3xl">Pickup area</h2>
          <p className="mt-1 text-sm text-muted">
            Listings show only the general area. Your exact address stays private and is flagged if a message includes it.
          </p>
          <form onSubmit={saveArea} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input name="area" defaultValue={state.move.area_label ?? ""} placeholder="General area, e.g. Mission District" className={input} />
            <input name="address" defaultValue={state.move.address_private ?? ""} placeholder="Exact address (private)" className={input} />
            <button disabled={busy} className={ghost}>Save</button>
          </form>
        </section>

        <section className={card}>
          <h2 className="font-display text-3xl">Your things</h2>
          <form onSubmit={addItem} className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_100px_auto]">
            <input name="name" required placeholder="Item, e.g. IKEA Kivik sofa" className={input} />
            <input name="condition" placeholder="Condition" className={input} />
            <input name="ask" type="number" min={0} placeholder="$ ask" className={input} />
            <button disabled={busy} className={btn}>Add</button>
          </form>

          <ul className="mt-6 divide-y divide-dashed divide-line">
            {state.items.length === 0 && <li className="py-4 text-sm text-muted">No items yet.</li>}
            {state.items.map((item) => {
              const listing = listingFor(item.id);
              const confirmed = item.disposition_confirmed ? item.disposition : null;
              return (
                <li key={item.id} className="grid gap-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted">
                        {item.condition ?? "Condition not set"} · ask {usd(item.ask_cents)} · {item.status}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {(["keep", "sell", "donate"] as const).map((d) => (
                        <button
                          key={d}
                          disabled={busy || !!listing}
                          onClick={() => op({ op: "set_disposition", itemId: item.id, disposition: d })}
                          className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ring-line ${
                            confirmed === d ? "bg-ink text-paper" : "bg-paper"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(confirmed === "sell" || confirmed === "donate") && !listing && (
                    <button disabled={busy} onClick={() => op({ op: "prepare_listing", itemId: item.id })} className={`${ghost} justify-self-start`}>
                      Draft Facebook listing
                    </button>
                  )}

                  {state.listings.filter((l) => l.item_id === item.id).map((listing) => {
                    const action = actionForListing(listing.id);
                    const label = action ? actionLabel(action) : null;
                    if (!action || !label) return null;
                    return (
                      <div key={listing.id} id={`listing-${listing.id}`} className="rounded-2xl bg-paper p-4 ring-1 ring-line">
                        <div id={`action-${action.id}`} />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">{listing.title}</p>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${label.tone}`}>{label.text}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-line text-sm text-ink/80">{listing.body}</p>
                        <p className="mt-2 font-mono text-xs text-muted">
                          {usd(listing.price_cents)} · Facebook Marketplace via Muse · version {action.payload_hash.slice(0, 8)}
                        </p>
                        {listing.external_url && (
                          <a href={listing.external_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline">
                            Listing on Facebook (reported by Muse)
                          </a>
                        )}
                        {action.error && <p className="mt-2 text-sm text-stamp">{action.error}</p>}
                        {(action.status === "approved" || action.status === "executing" || action.status === "unknown") && (
                          <RelayPanel action={action} listing={listing} busy={busy} op={op} />
                        )}
                        {action.status === "pending_review" && (
                          <div className="mt-3 flex gap-2">
                            <button
                              disabled={busy}
                              onClick={() => op({ op: "approve", actionId: action.id, payloadHash: action.payload_hash })}
                              className={btn}
                            >
                              Approve this exact listing
                            </button>
                            <button disabled={busy} onClick={() => op({ op: "cancel", actionId: action.id })} className={ghost}>
                              Discard
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </section>

        <Conversations state={state} busy={busy} op={op} />
      </div>

      <aside className="grid content-start gap-6">
        <section className="rounded-[28px] border border-white/10 bg-slate p-6 text-white">
          <h2 className="font-display text-3xl">Connect your Muse</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-white/80">
            <li>Create a connector token (shown once).</li>
            <li>In Muse, add a custom connector for Vacate with the URL below and the token.</li>
            <li>Approve a listing here, then ask Muse to check Vacate for approved Marketplace work.</li>
          </ol>
          <dl className="mt-4 space-y-2 font-mono text-[11px] text-white/70">
            <div><dt className="text-white/40">MCP</dt><dd className="break-all">{endpoints.mcp}</dd></div>
            <div><dt className="text-white/40">A2A agent card</dt><dd className="break-all">{endpoints.agentCard}</dd></div>
          </dl>
          <button disabled={busy} onClick={() => op({ op: "create_token" }).then((d) => d?.token && setNewToken(d.token))} className={`${btn} mt-4`}>
            Create connector token
          </button>
          {newToken && (
            <p className="mt-3 break-all rounded-xl bg-white/10 p-3 font-mono text-xs">
              {newToken}
              <span className="mt-1 block font-sans text-white/50">Copy it now; it won&rsquo;t be shown again.</span>
            </p>
          )}
          <ul className="mt-4 space-y-1 text-xs text-white/60">
            {state.connectorTokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span>
                  {t.label} …{t.token_hint} · {t.revoked_at ? "revoked" : t.last_used_at ? `used ${new Date(t.last_used_at).toLocaleString()}` : "never used"}
                </span>
                {!t.revoked_at && (
                  <button disabled={busy} onClick={() => op({ op: "revoke_token", tokenId: t.id })} className="underline">
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <h2 className="font-display text-2xl">What&rsquo;s live</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><b className="text-ink">Here:</b> your items, approvals and the record of what Muse reports.</li>
            <li><b className="text-ink">Muse:</b> posting and messaging on your Facebook account, with its own approval prompt.</li>
            <li><b className="text-ink">Not verified by Vacate:</b> listing URLs and sent messages are as reported by Muse.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

function Conversations({
  state,
  busy,
  op,
}: {
  state: MuseState;
  busy: boolean;
  op: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  if (!state.conversations.length) {
    return (
      <section className={card}>
        <h2 className="font-display text-3xl">Buyers</h2>
        <p className="mt-2 text-sm text-muted">Buyer messages Muse relays from Facebook appear here for you to answer.</p>
      </section>
    );
  }
  return (
    <section className={card}>
      <h2 className="font-display text-3xl">Buyers</h2>
      <ul className="mt-4 grid gap-4">
        {state.conversations.map((c) => {
          const msgs = state.messages.filter((m) => m.conversation_id === c.id);
          const pending = state.actions.filter(
            (a) => (a.kind === "buyer.reply" || a.kind === "pickup.confirm") && (a.payload as { conversationId?: string }).conversationId === c.id,
          );
          const hold = state.reservations.find((r) => r.conversation_id === c.id && (r.status === "held" || r.status === "confirmed"));
          return (
            <li key={c.id} id={`conversation-${c.id}`} className="rounded-2xl bg-paper p-4 ring-1 ring-line">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{c.buyer_label}</p>
                <span className="font-mono text-[11px] text-muted">via {c.source === "muse" ? "Muse · Facebook" : c.source}{hold ? ` · item ${hold.status}` : ""}</span>
              </div>
              <ol className="mt-3 space-y-2 text-sm">
                {msgs.map((m) => (
                  <li key={m.id} className={m.direction === "inbound" ? "" : "text-right"}>
                    <span className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 ${m.direction === "inbound" ? "bg-card ring-1 ring-line" : "bg-tape text-tape-ink"}`}>
                      {m.body}
                    </span>
                  </li>
                ))}
              </ol>
              {pending.map((a) => {
                const label = actionLabel(a);
                const p = a.payload as { body?: string; message?: string; disclosesExactAddress?: boolean };
                return (
                  <div key={a.id} id={`action-${a.id}`} className="mt-3 rounded-xl bg-card p-3 text-sm ring-1 ring-line">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{a.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${label.tone}`}>{label.text}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-line">{p.body ?? p.message}</p>
                    {p.disclosesExactAddress && <p className="mt-1 text-xs font-semibold text-stamp">Shares your exact address with this buyer.</p>}
                    {a.status === "pending_review" && (
                      <button disabled={busy} onClick={() => op({ op: "approve", actionId: a.id, payloadHash: a.payload_hash })} className={`${btn} mt-2`}>
                        Approve this exact message
                      </button>
                    )}
                  </div>
                );
              })}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void op({ op: "draft_reply", conversationId: c.id, body: f.get("body") });
                  e.currentTarget.reset();
                }}
                className="mt-3 flex gap-2"
              >
                <input name="body" required placeholder="Draft a reply for review" className={input} />
                <button disabled={busy} className={ghost}>Draft</button>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Hand-off when Muse cannot reach this app (local development): copy the exact
// approved listing into Muse, let Muse post it, then record what Muse did.
function RelayPanel({
  action,
  listing,
  busy,
  op,
}: {
  action: Row<"actions">;
  listing: Row<"listings">;
  busy: boolean;
  op: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [copied, setCopied] = useState(false);
  const prompt = [
    "Please post this on Facebook Marketplace from my account.",
    "Use exactly this title, price and description. Don't add my address, phone number or any other details, and ask me before you publish.",
    "",
    `Title: ${listing.title}`,
    `Price: ${listing.price_cents === 0 ? "Free" : `$${(listing.price_cents / 100).toFixed(0)}`}`,
    listing.area_label ? `Location: ${listing.area_label}` : null,
    "Description:",
    listing.body,
    "",
    "I'll attach the photos. When it's live, send me the listing link.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  return (
    <div className="mt-3 rounded-xl bg-card p-3 ring-1 ring-line">
      <p className="text-sm font-semibold">Send it to your Muse</p>
      <p className="mt-1 text-xs text-muted">
        Manual relay: Muse can&rsquo;t reach this local app, so paste this into the Muse app yourself, add photos, and
        approve Muse&rsquo;s publish prompt. Then record the link Muse gives you.
      </p>
      <textarea readOnly value={prompt} rows={8} className={`${input} mt-2 font-mono text-xs`} />
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(prompt).then(() => setCopied(true))}
        className={`${ghost} mt-2`}
      >
        {copied ? "Copied" : "Copy for Muse"}
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void op({
            op: "record_relay",
            actionId: action.id,
            payloadHash: action.payload_hash,
            status: "succeeded",
            externalUrl: String(f.get("url") ?? "").trim(),
          });
        }}
        className="mt-3 flex flex-wrap gap-2"
      >
        <input name="url" required type="url" placeholder="https://www.facebook.com/marketplace/item/…" className={`${input} min-w-0 flex-1`} />
        <button disabled={busy} className={btn}>Muse posted it</button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            op({ op: "record_relay", actionId: action.id, payloadHash: action.payload_hash, status: "failed", note: "Muse did not post it" })
          }
          className={ghost}
        >
          Muse couldn&rsquo;t post it
        </button>
      </form>
    </div>
  );
}
