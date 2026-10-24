import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ServicesPicker } from "@/components/services-picker";
import { accountPageUser } from "@/server/account-page";
import { serviceOptions } from "@/server/services";

export const metadata: Metadata = { title: "Cleaners & movers · Vacate" };

async function Options() {
  await connection();
  const ctx = await accountPageUser("/services");
  const { moveOutDate, sections, saved } = await serviceOptions(ctx);
  return <ServicesPicker moveOutDate={moveOutDate} sections={sections} saved={saved} />;
}

export default function ServicesPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wider text-tape">Services</p>
      <h1 className="mt-3 max-w-3xl font-display text-5xl leading-tight sm:text-6xl">Pick your cleaners and movers.</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        The agent compares companies near you on price and on whether they can finish before you hand back the keys.
        Choose one of each; your choice is saved.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">The agent is comparing companies near you…</p>}>
        <Options />
      </Suspense>
    </main>
  );
}
