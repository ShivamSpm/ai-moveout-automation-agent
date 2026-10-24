import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SellConsole } from "@/components/sell-console";
import { AuthError, requireUser } from "@/server/auth";
import { sellingState } from "@/server/selling/telegram-sales";

export const metadata: Metadata = { title: "Sell on Telegram · Vacate" };

async function Workspace() {
  await connection();
  let ctx;
  try {
    ctx = await requireUser();
  } catch (e) {
    if (e instanceof AuthError) redirect("/login?next=/sell");
    throw e;
  }
  const state = await sellingState(ctx);
  return <SellConsole initial={JSON.parse(JSON.stringify(state))} />;
}

export default function SellPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl leading-[0.95] sm:text-6xl">Sell on Telegram</h1>
      <p className="mt-4 max-w-2xl text-muted">
        You approve each listing before it&apos;s posted to the sale channel. The agent chats with buyers, never goes below your
        minimum, and asks you before any deal is confirmed. Payment happens in person at pickup.
      </p>
      <div className="mt-8">
        <Suspense fallback={<p className="text-muted">Loading your listings…</p>}>
          <Workspace />
        </Suspense>
      </div>
    </main>
  );
}
