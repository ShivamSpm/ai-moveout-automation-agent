import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { userClient } from "@/server/supabase";

export const metadata: Metadata = { title: "Connect an assistant · Vacate" };

async function Consent({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id: id } = await searchParams;
  if (!id) return <p className="text-muted">Missing authorization request.</p>;
  const db = await userClient();
  const { data: user } = await db.auth.getUser();
  if (!user.user) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);
  const { data, error } = await db.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) return <p className="text-stamp">{error?.message ?? "Request not found or expired."}</p>;
  if ("redirect_url" in data) redirect(data.redirect_url);
  const client = data.client;
  return (
    <form action="/api/oauth/decision" method="post" className="box-label grid gap-5 rounded-3xl p-6 sm:p-8">
      <input type="hidden" name="authorization_id" value={id} />
      <p className="text-lg">
        <span className="font-semibold">{client?.name ?? "An assistant"}</span> wants to use Vacate as{" "}
        <span className="font-semibold">{user.user.email}</span>.
      </p>
      <ul className="space-y-2 text-sm text-muted">
        <li>It can read your move, items, listings and buyer messages.</li>
        <li>It can draft listings and replies. Sends, posts and pickups still need your approval of the exact text.</li>
        <li>Redirects to: <span className="font-mono text-xs">{data.redirect_uri}</span></li>
        <li>Scopes: <span className="font-mono text-xs">{data.scope || "default"}</span></li>
      </ul>
      <div className="flex gap-3">
        <button name="decision" value="approve" className="tape flex-1 rounded-xl px-6 py-3 font-semibold">Allow</button>
        <button name="decision" value="deny" className="rounded-xl border-2 border-line px-6 py-3 font-semibold">Deny</button>
      </div>
    </form>
  );
}

export default function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-display text-5xl">Connect an assistant</h1>
      <div className="mt-8">
        <Suspense>
          <Consent searchParams={searchParams as Promise<{ authorization_id?: string }>} />
        </Suspense>
      </div>
    </main>
  );
}
