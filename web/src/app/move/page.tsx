import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { MoveDetailsForm, type MoveDetailsInitial } from "@/components/move-details-form";
import { authEnabled } from "@/lib/supabase/env";
import { AuthError, requireUser } from "@/server/auth";
import { currentMove } from "@/server/marketplace";

export const metadata: Metadata = { title: "Your move · Vacate" };

const empty: MoveDetailsInitial = {
  renterName: "",
  moveOutDate: "",
  address: "",
  zip: "",
  bedrooms: "",
  bathrooms: "",
  sqft: "",
  landlordName: "",
  landlordPhone: "",
  landlordEmail: "",
};

async function Details() {
  await connection();
  // Without Supabase settings (local preview) show the form with saving off.
  if (!authEnabled) return <MoveDetailsForm initial={empty} canSave={false} />;

  let ctx;
  try {
    ctx = await requireUser();
  } catch (e) {
    if (e instanceof AuthError) redirect("/login?next=/move");
    throw e;
  }
  const move = await currentMove(ctx);
  const text = (v: string | number | null) => (v == null ? "" : String(v));
  const initial: MoveDetailsInitial = {
    renterName: text(move.renter_name) || text(ctx.user.user_metadata?.full_name ?? null),
    moveOutDate: text(move.move_out_date),
    address: text(move.address_private),
    zip: text(move.zip),
    bedrooms: text(move.bedrooms),
    bathrooms: move.bathrooms == null ? "" : String(Number(move.bathrooms)),
    sqft: text(move.sqft),
    landlordName: text(move.landlord_name),
    landlordPhone: text(move.landlord_phone),
    landlordEmail: text(move.landlord_email),
  };
  return <MoveDetailsForm initial={initial} canSave />;
}

export default function MovePage() {
  return (
    <main className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.75fr_1.25fr]">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-sm font-semibold uppercase tracking-wider text-tape">Your move</p>
        <h1 className="mt-3 font-display text-5xl leading-tight sm:text-6xl">Tell the agent about your move.</h1>
        <p className="mt-5 max-w-md leading-relaxed text-muted">
          Your move-out day sets every deadline. Your landlord&rsquo;s contact lets the agent confirm the date
          and get the checklist. Your apartment size is what cleaners and movers quote on.
        </p>
        <ul className="mt-8 space-y-3 text-sm text-muted">
          <li>✓ Private to you</li>
          <li>✓ Nothing is sent to your landlord until you approve it</li>
          <li>✓ Change it any time</li>
        </ul>
      </div>
      <Suspense fallback={<p className="text-muted">Loading your move…</p>}>
        <Details />
      </Suspense>
    </main>
  );
}
