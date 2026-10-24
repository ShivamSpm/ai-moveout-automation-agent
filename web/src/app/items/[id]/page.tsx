import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ItemArt } from "@/components/item-art";
import { OfferChat } from "@/components/offer-chat";
import { getItem, move } from "@/lib/demo";
import { usd } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/items/[id]">): Promise<Metadata> {
  const { id } = await params;
  const item = getItem(id);
  return { title: item ? `${item.name} · Vacate` : "Item · Vacate" };
}

export default function ItemPage({ params }: PageProps<"/items/[id]">) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/items" className="font-mono text-xs uppercase tracking-[0.2em] text-muted hover:text-ink">
        ← All items
      </Link>
      <Suspense fallback={<ItemSkeleton />}>
        <ItemDetail params={params} />
      </Suspense>
    </main>
  );
}

function ItemSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="aspect-[4/3] animate-pulse rounded-3xl bg-line" />
      <div className="h-[520px] animate-pulse rounded-3xl bg-line" />
    </div>
  );
}

async function ItemDetail({ params }: { params: PageProps<"/items/[id]">["params"] }) {
  const { id } = await params;
  const item = getItem(id);
  if (!item) notFound();

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rise">
        <ItemArt item={item} size="lg" />
        <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
              {item.category} · {move.neighborhood}, SF
            </p>
            <h1 className="mt-2 font-display text-5xl leading-none tracking-tight">{item.name}</h1>
            <p className="mt-2 text-muted">{item.condition}</p>
          </div>
          <p className="font-display text-6xl leading-none">{item.ask ? usd(item.ask) : "Free"}</p>
        </div>
        <p className="mt-6 max-w-xl leading-relaxed">{item.blurb}</p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            ["Pickup", "Mission, public meetup"],
            ["Posted to", item.where.join(", ")],
            ["Seller", `${move.tenant}, moving Nov 30`],
          ].map(([k, v]) => (
            <div key={k} className="box-label rounded-2xl p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">{k}</p>
              <p className="mt-1 text-sm">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rise lg:sticky lg:top-6 lg:self-start" style={{ animationDelay: "120ms" }}>
        {item.status === "sold" ? (
          <div className="box-label grid h-[320px] place-items-center rounded-3xl text-center">
            <div>
              <span className="stamp inline-block px-4 py-2 font-mono text-xl font-bold uppercase text-leaf">
                Sold
              </span>
              <p className="mt-6 text-muted">This one found a new home.</p>
            </div>
          </div>
        ) : (
          <OfferChat itemName={item.name} ask={item.ask} floor={item.floor} sellerName={move.tenant} />
        )}
        <p className="mt-3 text-center text-xs text-muted">
          Never send payment in advance. Meet in a public place.
        </p>
      </div>
    </div>
  );
}
