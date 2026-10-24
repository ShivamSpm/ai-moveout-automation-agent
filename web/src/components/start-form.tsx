"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// Front end only for now: submitting plays the setup steps and opens the demo
// dashboard. Wire it to a server action that writes the move to Supabase and
// sends the lease to OpenRouter.

const steps = [
  "Reading your lease…",
  "Finding the notice, cleaning and key clauses…",
  "Drafting the email to your landlord…",
  "Building your plan backward from move-out day…",
];

const field =
  "mt-2 w-full rounded-2xl border-2 border-line bg-paper px-4 py-3 text-ink placeholder:text-muted/70 focus:border-edge focus:outline-none focus:ring-4 focus:ring-tape/50";

export function StartForm() {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setStep(0);
    steps.forEach((_, i) => setTimeout(() => setStep(i), i * 900));
    setTimeout(() => router.push("/dashboard"), steps.length * 900 + 300);
  }

  if (step !== null) {
    return (
      <div className="box-label rise grid min-h-[480px] place-items-center rounded-3xl p-8">
        <div className="w-full max-w-sm">
          <p className="font-display text-3xl">Agent is on it…</p>
          <ol className="mt-6 space-y-4">
            {steps.map((label, i) => (
              <li
                key={label}
                className={`flex items-center gap-3 transition ${i > step ? "opacity-25" : ""}`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${i < step ? "bg-leaf" : i === step ? "live-dot bg-tape" : "bg-line"}`}
                />
                {label}
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="box-label rise grid gap-5 rounded-3xl p-6 sm:p-8" style={{ animationDelay: "120ms" }}>
      <label className="block">
        <span className="text-sm font-medium">Address you&rsquo;re leaving</span>
        <input required defaultValue="1847 Guerrero St, Apt 3" className={field} />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Move-out date</span>
          <input required type="date" defaultValue="2026-11-30" className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Security deposit</span>
          <input required inputMode="numeric" defaultValue="$3,200" className={field} />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Landlord or manager</span>
          <input required defaultValue="Dana Ruiz" className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Their email</span>
          <input required type="email" defaultValue="dana@bayline-pm.example" className={field} />
        </label>
      </div>

      <label className="block cursor-pointer">
        <span className="text-sm font-medium">Your lease (PDF)</span>
        <span className="mt-2 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line px-6 py-10 text-center transition hover:border-ink">
          <span className="tape rounded-full border border-line px-4 py-1 text-sm font-bold">
            {fileName ? "Attached" : "Drop lease here"}
          </span>
          <span className="mt-3 text-sm text-muted">{fileName ?? "or click to choose a file"}</span>
        </span>
        <input
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </label>

      <button
        type="submit"
        className="tape mt-2 rounded-xl px-6 py-4 font-semibold transition hover:brightness-110"
      >
        Start the agent
      </button>
      <p className="text-center text-xs text-muted">
        You&rsquo;ll review the first email to your landlord before it goes out.
      </p>
    </form>
  );
}
