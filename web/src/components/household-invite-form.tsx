"use client";
import { useState } from "react";
import { householdAction } from "@/app/account/actions";
export function HouseholdInviteForm({ householdId }: { householdId: string }) {
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <form className="grid gap-3" action={async data => {
    setBusy(true); setLink("");
    try {
      const result = await householdAction(data);
      setMessage(result.error ?? result.message ?? "");
      if (result.invitePath) setLink(new URL(result.invitePath, window.location.origin).href);
    } catch { setMessage("Invitation failed. Please try again."); }
    finally { setBusy(false); }
  }}>
    <input type="hidden" name="action" value="invite" /><input type="hidden" name="householdId" value={householdId} />
    <label>Invite by email <input className="field" type="email" name="email" required placeholder="helper@example.test" /></label>
    <button className="tape w-fit" disabled={busy}>Create invite link</button>
    <p role="status">{message}</p>
    {link && <><input className="field" readOnly value={link} aria-label="One-time invitation link" /><button type="button" className="underline w-fit" onClick={async () => {
      try { await navigator.clipboard.writeText(link); setMessage("Copied. Share this link with the invited person."); }
      catch { setMessage("Select and copy the invitation link above."); }
    }}>Copy invite link</button></>}
  </form>;
}
