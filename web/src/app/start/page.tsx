import { addressFields } from "@/lib/move-fields";
import { maskPhone } from "@/lib/phone";
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthError, requireUser } from "@/server/auth";
import { enabledAuthProviders } from "@/server/auth-providers";
import { StartForm } from "@/components/start-form";
import { CallResult } from "@/components/call-result";
import { latestCall } from "@/server/landlord-calls";
import Link from "next/link";

export const metadata: Metadata = { title: "Start a move · Vacate" };

async function Intake({ searchParams }: PageProps<"/start">) {
  await connection();
  let ctx;
  try { ctx = await requireUser(); } catch (error) { if (!(error instanceof AuthError)) throw error; }
  const providers = await enabledAuthProviders();
  const { resume } = await searchParams;
  let initial;
  let call: Awaited<ReturnType<typeof latestCall>> = null;
  if (ctx) {
    const { data: move, error } = await ctx.db.from("moves").select("*").eq("owner_id", ctx.user.id).order("created_at").limit(1).maybeSingle();
    if (error) throw error;
    if (move) initial = { email: ctx.user.email ?? "", ...addressFields(move), renterName: move.renter_name ?? "", landlordPhone: maskPhone(move.landlord_phone ?? ""), bedrooms: move.bedrooms == null ? "" : String(move.bedrooms), bathrooms: move.bathrooms == null ? "" : String(move.bathrooms), sqft: move.sqft == null ? "" : String(move.sqft), moveOutDate: move.move_out_date ?? "", deposit: move.deposit_cents == null ? "" : (move.deposit_cents / 100).toFixed(2), propertyManagementCompany: move.property_management_company ?? "", landlordName: move.landlord_name ?? "", landlordEmail: move.landlord_email ?? "" };
    if (move) call = await latestCall(ctx);
  }
  const form = <StartForm signedIn={Boolean(ctx)} signedInEmail={ctx?.user.email} initial={initial} providers={providers} resume={resume === "1"} />;
  if (!call) return form;
  return (
    <div className="grid content-start gap-6">
      {form}
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-tape">Your landlord call</p>
        <div className="mt-3"><CallResult call={call} /></div>
        <Link href="/calls" className="mt-3 inline-block font-semibold text-tape underline">Open the call page</Link>
      </div>
    </div>
  );
}

export default function Start(props: PageProps<"/start">) {
  return (
    <main className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rise">
        <span className="inline-flex rounded-full border border-line bg-card px-3 py-1 text-sm font-medium">Setup takes 2 minutes</span>
        <h1 className="mt-5 font-display text-6xl leading-[0.92] sm:text-7xl">
          Where are you <span className="marker">leaving?</span>
        </h1>
        <p className="mt-6 max-w-md leading-relaxed text-muted">
          Save your move and upload your lease to build a checklist with page references. Then prepare contact with your property manager and listings for the items you want to sell. You review every outgoing action.
        </p>
        <ol className="mt-10 space-y-4 font-medium">
          {["Save move details", "Upload and review lease", "Contact property manager", "Add items to sell"].map((step, i) => (
            <li key={step} className="flex items-center gap-4">
              <span className="tape grid h-9 w-9 place-items-center rounded-full border border-line font-display text-base">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
      <Suspense fallback={<p>Loading your move…</p>}><Intake {...props} /></Suspense>
    </main>
  );
}
