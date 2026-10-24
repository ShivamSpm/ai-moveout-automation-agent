import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ServicesPicker } from "@/components/services-picker";
import { accountPageUser } from "@/server/account-page";
import { cleaningOptions } from "@/server/services";

export const metadata: Metadata = { title: "Cleaners & movers · Vacate" };

async function Options() {
  await connection();
  const ctx = await accountPageUser("/services");
  const options = await cleaningOptions(ctx);
  if (!options.ok) {
    return (
      <div className="box-label mt-8 rounded-3xl p-6">
        <p className="font-semibold">To compare companies, add {options.missing.join(", ")}.</p>
        <Link href="/move" className="mt-3 inline-block font-semibold text-tape underline">Go to My move</Link>
      </div>
    );
  }
  return <ServicesPicker moveOutDate={options.moveOutDate} zip={options.zip} result={options.result} />;
}

export default function ServicesPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wider text-tape">Services</p>
      <h1 className="mt-3 max-w-3xl font-display text-5xl leading-tight sm:text-6xl">Cleaners and movers, picked for your move-out day.</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        The agent compares companies near you on price and on whether they can finish before you hand back the keys.
        You choose and approve; nothing is booked without you.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">The agent is comparing companies near you…</p>}>
        <Options />
      </Suspense>
    </main>
  );
}
