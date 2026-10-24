import type { Metadata } from "next";
import Link from "next/link";
import { ItemArt } from "@/components/item-art";
import { items } from "@/lib/demo";
import { usd } from "@/lib/format";

export const metadata: Metadata = { title: "Items · Vacate" };

const statusStyle = {
  listed: { label: "Listed", className: "bg-sky text-white" },
  pending: { label: "Offer pending", className: "bg-sun text-tape-ink" },
  sold: { label: "Sold", className: "bg-leaf text-white" },
  giveaway: { label: "Free", className: "bg-stamp text-white" },
};

export default function Items() {
  const listedValue = items.filter((i) => i.status !== "giveaway").reduce((s, i) => s + i.ask, 0);
  const sold = items.filter((i) => i.status === "sold").reduce((s, i) => s + i.ask, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="mb-6 rounded-xl border border-line bg-sun p-4 text-tape-ink">Example move · fictional data and simulated actions. <a className="underline" href="/start">Start your own move</a></p>
      <header className="rise flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="inline-flex rounded-full border border-line bg-card px-3 py-1 text-sm font-medium">Selling · {items.length} items</span>
          <h1 className="mt-4 max-w-3xl font-display text-6xl leading-[0.95] sm:text-7xl">
            Everything that <span className="marker">isn&rsquo;t</span> coming with you.
          </h1>
        </div>
        <dl className="flex gap-8 font-mono text-sm">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-muted">Listed</dt>
            <dd className="mt-1 font-display text-4xl">{usd(listedValue)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-muted">Sold</dt>
            <dd className="mt-1 font-display text-4xl text-leaf">{usd(sold)}</dd>
          </div>
        </dl>
      </header>

      <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => {
          const status = statusStyle[item.status];
          return (
            <li key={item.id} className="rise" style={{ animationDelay: `${i * 60}ms` }}>
              <Link href={`/demo/items/${item.id}`} className="group block">
                <div className="transition group-hover:-translate-y-1">
                  <ItemArt item={item} />
                </div>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold leading-snug group-hover:underline">{item.name}</h2>
                    <p className="mt-0.5 text-sm text-muted">{item.condition}</p>
                  </div>
                  <span className="font-display text-3xl leading-none">
                    {item.ask ? usd(item.ask) : "Free"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={`rounded-full px-2.5 py-0.5 font-medium ${status.className}`}>{status.label}</span>
                  {item.where.map((w) => (
                    <span key={w} className="rounded-full border border-line px-2.5 py-0.5 text-muted">
                      {w}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
