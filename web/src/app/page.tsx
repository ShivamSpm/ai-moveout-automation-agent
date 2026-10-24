import { Suspense } from "react";
import { AccountGoodbye } from "@/components/account-goodbye";
import Image from "next/image";
import Link from "next/link";

const flow = [
  { label: "You", sub: "lease + landlord email" },
  { label: "Email", sub: "agent writes, you approve" },
  { label: "Landlord", sub: "sends move-out docs" },
  { label: "Checklist", sub: "dated, clause by clause" },
];

const fanOut = [
  { label: "Rents the U-Haul", art: "/art/lane-moving.jpg" },
  { label: "Contacts movers + cleaners", art: "/art/lane-cleaning.jpg" },
  { label: "Sells or donates your stuff", art: "/art/lane-selling.jpg" },
];

const lanes = [
  {
    title: "Talks to your landlord",
    body: "Sends your notice, requests the pre-move-out inspection and reads their move-out guide. Follows up when they go quiet.",
    photo: "/art/photo-landlord.jpg",
  },
  {
    title: "Gets it inspection-ready",
    body: "Turns every lease clause into a dated task, then books cleaners and a handyman before the walkthrough.",
    photo: "/art/photo-cleaning.jpg",
  },
  {
    title: "Books the move",
    body: "Sizes the truck from what you're keeping, collects mover quotes and handles SF's parking-sign rules.",
    photo: "/art/photo-moving.jpg",
  },
  {
    title: "Sells or donates the rest",
    body: "Writes listings from your photos for Craigslist, Buy Nothing and Marketplace, and negotiates with buyers.",
    photo: "/art/photo-selling.jpg",
  },
];

const compare: Array<[string, boolean, boolean, boolean]> = [
  ["Emails your landlord and tracks replies", true, false, false],
  ["Builds a checklist from your actual lease", true, false, true],
  ["Books cleaners, movers and the truck", true, false, false],
  ["Lists, negotiates and sells your stuff", true, false, false],
  ["Watches the 21-day deposit deadline", true, false, false],
  ["You approve everything before it goes out", true, true, true],
];

const rules = [
  ["Pre-move-out inspection", "You can ask for an inspection before you leave. The landlord must list what they'd deduct for, so you can fix it first.", "CA Civil Code §1950.5(f)"],
  ["21 days to return it", "Your landlord has 21 days after move-out to return the deposit or send itemized deductions.", "CA Civil Code §1950.5(g)"],
  ["Photos or it didn't happen", "Landlords now need before-and-after photos to justify deductions. Vacate keeps your own.", "CA AB 2801"],
  ["Parking for the truck", "Apply 5+ business days ahead; no-parking signs go up 72 hours before move day.", "SFMTA temporary signage"],
];

const stack = ["Bland · voice calls", "Muse · vision", "OpenRouter · negotiation", "Supabase", "Vercel", "Apify"];

function Check({ on }: { on: boolean }) {
  return on ? (
    <span className="tape mx-auto grid h-7 w-7 place-items-center rounded-full text-sm" aria-label="Yes">
      ✓
    </span>
  ) : (
    <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-line text-sm text-muted" aria-label="No">
      –
    </span>
  );
}

export default function Home() {
  return (
    <main className="overflow-x-clip">
      <Suspense fallback={null}><AccountGoodbye /></Suspense>
      {/* Hero: full-bleed photo under the floating nav */}
      <section className="relative -mt-[76px] flex min-h-[680px] items-center bg-slate pt-[76px] text-white sm:min-h-[740px]">
        <Image
          src="/art/photo-hero.jpg"
          alt="A renter packing boxes in a bright San Francisco apartment"
          fill
          sizes="100vw"
          className="object-cover"
          loading="eager"
          fetchPriority="high"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#0b1214]/90 via-[#0b1214]/60 to-[#0b1214]/10" />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="rise max-w-xl">
            <p className="text-sm font-medium tracking-wide text-white/75">For renters moving out in San Francisco</p>
            <h1 className="mt-4 font-display text-5xl leading-[1.02] sm:text-7xl">
              Move out on autopilot. Get your <em className="text-[#7fd6cf]">deposit</em> back.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/85">
              Vacate emails your landlord, builds your checklist from the lease, books the movers and
              sells what you&rsquo;re not keeping. You approve every step.
            </p>
            <form action="/start" className="mt-8 flex max-w-md gap-2 rounded-2xl bg-white p-2 shadow-2xl">
              <label htmlFor="hero-date" className="flex min-w-0 flex-1 flex-col justify-center rounded-xl px-3">
                <span className="text-[11px] font-medium text-[#5f6c71]">Move-out date</span>
                <input
                  id="hero-date"
                  name="moveOut"
                  type="date"
                  defaultValue="2026-11-30"
                  className="min-h-8 w-full bg-transparent text-[#1d2b31] focus:outline-none"
                />
              </label>
              <button type="submit" className="rounded-xl bg-[#0b7a79] px-5 py-3 font-semibold text-white transition hover:brightness-110">
                Get started
              </button>
            </form>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
              {["You approve every message", "Cites California tenant law", "Free during beta"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="text-[#7fd6cf]">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* The workflow, as sketched on the team board */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-24 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-tape">How it works</p>
        <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight sm:text-5xl">
          One email to your landlord starts everything.
        </h2>
        <ol className="mt-12 grid gap-3 md:grid-cols-4">
          {flow.map((step, i) => (
            <li key={step.label} className="relative rounded-2xl border border-line bg-card p-5">
              <span className="font-mono text-xs text-muted">0{i + 1}</span>
              <p className="mt-6 font-display text-2xl">{step.label}</p>
              <p className="mt-1 text-sm text-muted">{step.sub}</p>
              {i < flow.length - 1 && (
                <span aria-hidden className="absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-line bg-paper text-xs text-muted md:grid">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-3 rounded-2xl bg-slate p-5 text-white sm:p-6">
          <p className="text-sm text-white/70">Then the agent takes it from there:</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {fanOut.map((f) => (
              <li key={f.label} className="flex items-center gap-3 rounded-xl bg-white/[0.07] p-3">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">
                  <Image src={f.art} alt="" fill sizes="48px" className="object-cover" />
                </span>
                <span className="font-medium">{f.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Lanes: two-column list with photo thumbnails */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <h2 className="max-w-2xl font-display text-4xl leading-tight sm:text-5xl">
          Handled end to end, from the first email to the last box.
        </h2>
        <div className="mt-12 grid gap-x-16 md:grid-cols-2">
          {lanes.map((lane) => (
            <article key={lane.title} className="flex items-start gap-6 border-t border-line py-8">
              <div className="flex-1">
                <h3 className="text-xl font-semibold">{lane.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{lane.body}</p>
              </div>
              <div className="relative aspect-[4/3] w-36 shrink-0 overflow-hidden rounded-xl bg-sand sm:w-44">
                <Image src={lane.photo} alt="" fill sizes="176px" className="object-cover" />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Product preview on a sand band */}
      <section className="bg-sand">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-4xl leading-tight sm:text-5xl">Your whole move-out, in one place.</h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
              Every deadline counted back from move-out day, the money at stake on each task, and a
              short list of things waiting for your OK.
            </p>
            <Link href="/dashboard" className="tape mt-8 inline-block rounded-xl px-6 py-3.5 font-semibold transition hover:brightness-110">
              See the live demo
            </Link>
          </div>
          <div className="box-label rounded-3xl p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted">1847 Guerrero St · Apt 3</p>
                <p className="mt-1 font-display text-6xl leading-none">37 days</p>
                <p className="mt-2 text-sm text-muted">until keys go back · Nov 30</p>
              </div>
              <span className="stamp px-2.5 py-0.5 text-xs font-semibold text-leaf">On track</span>
            </div>
            <div className="mt-6">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Deposit protected</span>
                <span className="font-mono">$2,010 <span className="text-muted">/ $3,200</span></span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line">
                <div className="h-full w-[63%] rounded-full bg-tape" />
              </div>
            </div>
            <ul className="mt-6 divide-y divide-line border-y border-line text-sm">
              {[
                ["Send notice + request inspection", "Landlord"],
                ["Book Fogline Cleaning · Nov 27 · $420", "Cleaning"],
                ["Accept $190 for the Kivik sofa", "Selling"],
              ].map(([t, lane]) => (
                <li key={t} className="flex items-center justify-between gap-4 py-3">
                  <span>{t}</span>
                  <span className="shrink-0 rounded-md bg-lilac px-2 py-0.5 text-xs font-medium text-ink">{lane}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted">
              <span className="live-dot h-2 w-2 rounded-full bg-stamp" /> 3 approvals waiting
            </p>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">Vacate vs. doing it yourself</h2>
          <p className="mt-4 max-w-sm text-muted">
            A chatbot can tell you what to do. Vacate does it, on deadline, and keeps the receipts.
          </p>
          <Link href="/start" className="tape mt-8 inline-block rounded-xl px-6 py-3.5 font-semibold transition hover:brightness-110">
            Start my move-out
          </Link>
        </div>
        <div className="overflow-x-auto rounded-3xl bg-sand/70">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-6 py-5 font-medium">Features</th>
                <th className="px-3 py-5 text-center font-semibold text-tape">Vacate</th>
                <th className="px-3 py-5 text-center font-medium">DIY</th>
                <th className="px-3 py-5 text-center font-medium">Chatbot</th>
              </tr>
            </thead>
            <tbody>
              {compare.map(([label, a, b, c]) => (
                <tr key={label} className="border-t border-line">
                  <td className="px-6 py-4">{label}</td>
                  <td className="px-3 py-4"><Check on={a} /></td>
                  <td className="px-3 py-4"><Check on={b} /></td>
                  <td className="px-3 py-4"><Check on={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* The rules it works from, on a dark slate band */}
      <section className="bg-slate text-white">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="font-display text-4xl leading-tight sm:text-5xl">Built on the rules that protect your deposit.</h2>
              <p className="mt-4 max-w-sm text-white/70">
                Every task links back to the lease clause or law it comes from, so you can check it yourself.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {rules.map(([title, body, cite]) => (
                <div key={title} className="rounded-2xl bg-white/[0.06] p-6 ring-1 ring-white/10">
                  <p className="font-semibold">{title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{body}</p>
                  <p className="mt-4 font-mono text-xs text-[#7fd6cf]">{cite}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-16 border-t border-white/10 pt-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Built with</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {stack.map((s) => (
                <li key={s} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm text-white/80 ring-1 ring-white/10">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-4 py-24 sm:px-6">
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 overflow-hidden rounded-3xl bg-tape px-6 py-14 text-tape-ink sm:px-12 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-display text-4xl leading-tight sm:text-6xl">Moving out soon?</h2>
            <p className="mt-4 max-w-md text-lg opacity-85">
              Upload your lease and add your landlord&rsquo;s email. That&rsquo;s the whole setup.
            </p>
            <Link href="/start" className="mt-8 inline-block rounded-xl bg-white px-6 py-3.5 font-semibold text-[#0b7a79] transition hover:bg-white/90">
              Start my move-out
            </Link>
          </div>
          <div className="float relative mx-auto h-48 w-48 overflow-hidden rounded-full bg-white sm:h-56 sm:w-56">
            <Image src="/art/hero.jpg" alt="" fill sizes="224px" className="scale-110 object-cover" />
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-line pt-8 text-sm text-muted">
          <p>Coming next: move-in planning and tenant-rights help.</p>
          <p className="text-xs">Vacate isn&rsquo;t a law firm and doesn&rsquo;t give legal advice.</p>
        </div>
      </section>
    </main>
  );
}
