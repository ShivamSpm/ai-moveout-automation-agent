import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LandlordCallPanel } from "@/components/landlord-call-panel";
import { formatPhone } from "@/lib/phone";
import { authEnabled } from "@/lib/supabase/env";
import { AuthError, requireUser } from "@/server/auth";
import { callPreview, latestCall } from "@/server/landlord-calls";

export const metadata: Metadata = { title: "Call your landlord · Vacate" };

async function Panel() {
  await connection();
  if (!authEnabled) {
    return (
      <LandlordCallPanel
        canCall={false}
        blocker="Preview mode: sign-in isn't configured here, so calls are off."
        landlordName=""
        phoneDisplay=""
        firstSentence={null}
        task={null}
        initialCall={null}
      />
    );
  }
  let ctx;
  try {
    ctx = await requireUser();
  } catch (e) {
    if (e instanceof AuthError) redirect("/login?next=/calls");
    throw e;
  }
  const [preview, call] = await Promise.all([callPreview(ctx), latestCall(ctx)]);
  const blocker = preview.missing.length
    ? `Add ${preview.missing.join(", ")} first.`
    : !preview.configured
      ? "Calling isn't set up on this site yet (BLAND_API_KEY)."
      : null;
  return (
    <LandlordCallPanel
      canCall={!blocker}
      blocker={blocker}
      landlordName={preview.move.landlord_name ?? ""}
      phoneDisplay={formatPhone(preview.move.landlord_phone)}
      firstSentence={preview.script?.firstSentence ?? null}
      task={preview.script?.task ?? null}
      initialCall={call}
    />
  );
}

export default function CallsPage() {
  return (
    <main className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.75fr_1.25fr]">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-sm font-semibold uppercase tracking-wider text-tape">Landlord</p>
        <h1 className="mt-3 font-display text-5xl leading-tight sm:text-6xl">Get the move-out checklist.</h1>
        <p className="mt-5 max-w-md leading-relaxed text-muted">
          The Vacate Corp assistant calls your landlord, confirms your move-out day, and asks for the three most
          important things to do before handing back the keys. Those become your checklist.
        </p>
        <ul className="mt-8 space-y-3 text-sm text-muted">
          <li>✓ Nothing happens until you tap Approve &amp; call</li>
          <li>✓ The agent says it&rsquo;s an AI assistant and that the call is transcribed</li>
          <li>✓ It never agrees to anything on your behalf</li>
        </ul>
      </div>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Panel />
      </Suspense>
    </main>
  );
}
