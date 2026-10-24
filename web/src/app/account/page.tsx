import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { accountPageUser } from "@/server/account-page";
import { AccountActionForm } from "@/components/account-action-form";
import { HouseholdInviteForm } from "@/components/household-invite-form";
import { householdAction, deleteAccount } from "./actions";
async function Account() {
  await connection();
  const ctx = await accountPageUser("/account");
  const [households, members, moves] = await Promise.all([ctx.db.from("households").select("*"), ctx.db.from("household_members").select("*"), ctx.db.from("moves").select("id,title,household_id,move_out_date")]);
  if (households.error) throw households.error;
  if (members.error) throw members.error;
  if (moves.error) throw moves.error;
  return <div className="grid gap-8">
    <section><h2 className="box-label">Profile</h2><p>{ctx.user.email}</p></section>
    <section className="grid gap-5"><h2 className="font-display text-3xl">Household</h2>
      <p>Invite family or a caregiver to read shared documents and their checklist. Membership gives no authority over your account, belongings, messages or actions. Your private address field is hidden; a shared lease may itself contain your address.</p>
      <AccountActionForm action={householdAction}><input type="hidden" name="action" value="create" /><label>Household name <input className="field" name="name" required maxLength={100} /></label><button className="tape">Create household</button></AccountActionForm>
      {households.data.map(h => <article className="border p-5 grid gap-4" key={h.id}>
        <h3 className="font-display text-2xl">{h.name}{h.owner_id === ctx.user.id ? " · You own this household" : " · Member"}</h3>
        {h.owner_id === ctx.user.id && <HouseholdInviteForm householdId={h.id} />}
        {members.data.filter(m => m.household_id === h.id).map(m => <div key={m.id} className="border-t pt-3">
          <p>{m.invited_email} · {m.status === "invited" ? m.expires_at && new Date(m.expires_at) <= new Date() ? "expired" : "pending" : m.status}</p>
          {m.status !== "revoked" && <AccountActionForm action={householdAction}><input type="hidden" name="action" value="revoke" /><input type="hidden" name="memberId" value={m.id} /><button className="underline">{h.owner_id === ctx.user.id ? "Revoke" : "Leave household"}</button></AccountActionForm>}
        </div>)}
        {h.owner_id === ctx.user.id && moves.data.map(move => <AccountActionForm action={householdAction} key={move.id}><input type="hidden" name="action" value="attach" /><input type="hidden" name="householdId" value={h.id} /><input type="hidden" name="moveId" value={move.id} /><button className="underline" disabled={move.household_id === h.id}>{move.household_id === h.id ? `${move.title} is attached` : `Share ${move.title} with this household`}</button></AccountActionForm>)}
      </article>)}
    </section>
    <section className="grid gap-4"><h2 className="font-display text-3xl">Move-out date</h2>{moves.data.map(move => <AccountActionForm action={householdAction} key={move.id}><input name="action" type="hidden" value="date" /><input name="moveId" type="hidden" value={move.id} /><label>{move.title} <input className="field" name="date" type="date" required defaultValue={move.move_out_date ?? ""} /></label><button className="underline">Save date</button></AccountActionForm>)}</section>
    <section className="grid gap-4"><h2 className="font-display text-3xl">Data and deletion</h2>
      <Link className="underline" href="/account/documents">View, download or delete your files</Link>
      <p>Files have no automatic expiry yet. Closing your account removes your original files and application data, then deletes your sign-in. Remove other active household members first. Copies already sent elsewhere, such as a Facebook listing posted through Muse or an email already sent, are not deleted.</p>
      <p>You must have a session token issued within the last 10 minutes. If prompted, <Link className="underline" href="/login?next=/account">sign in again</Link> and retry.</p>
      <AccountActionForm action={deleteAccount} confirm="Permanently close your account and delete your files and data?"><label>Type DELETE MY ACCOUNT <input className="field" name="phrase" required autoComplete="off" /></label><button className="tape text-red-700">Close my account</button></AccountActionForm>
    </section>
  </div>;
}
export default function AccountPage() {
  return <main className="mx-auto max-w-4xl px-6 py-10"><nav className="mb-6 flex flex-wrap gap-x-4 [&>a]:py-3"><Link href="/account/documents">Documents</Link><Link href="/plan">Plan</Link></nav><h1 className="font-display text-5xl mb-8">Your account</h1><Suspense fallback={<p>Loading account…</p>}><Account /></Suspense></main>;
}
