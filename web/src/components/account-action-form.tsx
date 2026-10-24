"use client";
import { useState, type ReactNode } from "react";
export type ActionResult = { message?: string; error?: string; url?: string };
export function AccountActionForm({ action, children, confirm }: {
  action: (data: FormData) => Promise<ActionResult>; children: ReactNode; confirm?: string;
}) {
  const [result, setResult] = useState<ActionResult>({});
  const [busy, setBusy] = useState(false);
  return <form className="grid gap-2" action={async data => {
    if (confirm && !window.confirm(confirm)) return;
    if (confirm) data.set("confirmed", "yes");
    setBusy(true); setResult({});
    try { setResult(await action(data)); } catch { setResult({ error: "Could not finish. Please try again." }); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy} className="flex flex-wrap items-center gap-3">{children}</fieldset>
    {busy && <p role="status">Working…</p>}
    {result.error && <p role="alert" className="text-red-700">{result.error}</p>}
    {result.message && <p role="status" className="text-sm">{result.message}</p>}
    {result.url && <a className="underline break-all" href={result.url} target="_blank" rel="noreferrer">Open file</a>}
  </form>;
}
