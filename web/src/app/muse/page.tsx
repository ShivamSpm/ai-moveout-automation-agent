import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { MuseConsole } from "@/components/muse-console";
import { AuthError, requireUser } from "@/server/auth";
import { env } from "@/server/env";
import { marketplaceState } from "@/server/marketplace";
import { signOut } from "../login/actions";

export const metadata: Metadata = { title: "Facebook via Muse · Vacate" };

async function Workspace() {
  await connection();
  let ctx;
  try {
    ctx = await requireUser();
  } catch (e) {
    if (e instanceof AuthError) redirect("/login?next=/muse");
    throw e;
  }
  const state = await marketplaceState(ctx);
  const base = env.appUrl();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>Signed in as {ctx.user.email}</span>
        <form action={signOut}>
          <button className="underline">Sign out</button>
        </form>
      </div>
      <MuseConsole
        initial={JSON.parse(JSON.stringify(state))}
        endpoints={{
          agentCard: `${base}/.well-known/agent-card.json`,
          a2a: `${base}/api/a2a`,
          mcp: `${base}/api/mcp`,
        }}
      />
    </>
  );
}

export default function MusePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl leading-[0.95] sm:text-6xl">Sell on Facebook, through your Muse</h1>
      <p className="mt-4 max-w-2xl text-muted">
        You approve each listing and message here. Your own Muse agent, signed in to your Facebook account, posts it
        with its own approval prompt and reports back. Vacate never posts as you by itself.
      </p>
      <div className="mt-8 grid gap-6">
        <Suspense fallback={<p className="text-muted">Loading your move…</p>}>
          <Workspace />
        </Suspense>
      </div>
    </main>
  );
}
