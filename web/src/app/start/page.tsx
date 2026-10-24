import type { Metadata } from "next";
import { StartForm } from "@/components/start-form";

export const metadata: Metadata = { title: "Start a move · Vacate" };

export default function Start() {
  return (
    <main className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rise">
        <span className="inline-flex rounded-full border border-line bg-card px-3 py-1 text-sm font-medium">Setup takes 2 minutes</span>
        <h1 className="mt-5 font-display text-6xl leading-[0.92] sm:text-7xl">
          Where are you <span className="marker">leaving?</span>
        </h1>
        <p className="mt-6 max-w-md leading-relaxed text-muted">
          The agent reads your lease, emails your landlord for their move-out guide, and builds the
          plan backward from your move-out date. Nothing gets sent until you approve it.
        </p>
        <ol className="mt-10 space-y-4 font-medium">
          {["Read lease", "Email landlord", "Build the plan", "Start the four lanes"].map((step, i) => (
            <li key={step} className="flex items-center gap-4">
              <span className="tape grid h-9 w-9 place-items-center rounded-full border border-line font-display text-base">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
      <StartForm />
    </main>
  );
}
