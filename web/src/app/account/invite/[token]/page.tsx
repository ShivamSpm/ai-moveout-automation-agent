import { Suspense } from "react";
import { connection } from "next/server";
import { accountPageUser } from "@/server/account-page";
import { AccountActionForm } from "@/components/account-action-form";
import { acceptInvitation } from "../../actions";
async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const ctx = await accountPageUser(`/account/invite/${encodeURIComponent(token)}`);
  return <div className="grid gap-5"><p>Signed in as {ctx.user.email}. Accept using the confirmed email address that was invited. Invitations expire after seven days.</p><p>Membership lets you read shared lease files and checklists. It does not authorize actions or access to the owner’s account.</p><AccountActionForm action={acceptInvitation}><input type="hidden" name="token" value={token} /><button className="tape">Accept invitation</button></AccountActionForm></div>;
}
export default function InvitePage(props: { params: Promise<{ token: string }> }) {
  return <main className="mx-auto max-w-3xl px-6 py-10"><h1 className="font-display text-5xl mb-8">Join a household</h1><Suspense fallback={<p>Loading invitation…</p>}><Invitation {...props} /></Suspense></main>;
}
