import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ServicePicker } from "@/components/service-picker";
import { searchCleaning } from "@/server/services";

export const metadata: Metadata = { title: "Cleaning · Vacate" };

export default function CleanupPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
        ← Dashboard
      </Link>
      <div className="mt-4 max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-tape">Move-out cleaning</p>
        <h1 className="mt-2 font-display text-5xl leading-tight sm:text-6xl">Get it inspection-ready.</h1>
        <p className="mt-4 text-lg text-muted">
          The agent looks for cleaning companies near you, compares their quotes, and picks the one that
          finishes before your deadline without going over budget. You approve before anything is booked.
        </p>
      </div>
      <Suspense fallback={<SearchingFallback />}>
        <CleaningResults />
      </Suspense>
    </main>
  );
}

async function CleaningResults() {
  const result = await searchCleaning();
  return <ServicePicker result={result.data} live={result.live} problem={result.problem} />;
}

function SearchingFallback() {
  return (
    <div className="box-label mt-10 flex items-center gap-3 rounded-3xl p-6 text-muted">
      <span className="live-dot h-2.5 w-2.5 rounded-full bg-tape" />
      The agent is searching for cleaning services near you…
    </div>
  );
}
