"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import Link from "next/link";
import { prepareUpload, registerDocument } from "@/app/account/documents/actions";
export function LeaseUpload({ moveId }: { moveId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <form className="grid gap-3" action={async data => {
    const file = data.get("lease");
    if (!(file instanceof File) || file.type !== "application/pdf" || !file.size || file.size > 20 * 1024 * 1024) {
      setMessage("Choose a PDF of at most 20 MB"); return;
    }
    setBusy(true); setMessage("Uploading original PDF…");
    try {
      const upload = await prepareUpload(moveId);
      const db = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
      const result = await db.storage.from("move-files").uploadToSignedUrl(upload.path, upload.token, file, { contentType: "application/pdf" });
      if (result.error) throw result.error;
      setMessage("Reading lease pages…");
      const registered = await registerDocument({ documentId: upload.documentId, moveId, name: file.name });
      setMessage(registered.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed. Please try again."); }
    finally { setBusy(false); }
  }}>
    <label className="box-label" htmlFor={`lease-${moveId}`}>Upload lease · PDF, up to 20 MB</label>
    <input id={`lease-${moveId}`} className="field" type="file" name="lease" accept="application/pdf,.pdf" required disabled={busy} />
    <button className="tape w-fit" disabled={busy}>{busy ? "Working…" : "Upload lease"}</button>
    <p className="text-sm text-muted">Original preserved. Shared with active household members by default. A hash records file integrity, not capture time.</p>
    <p role="status">{message}</p><Link className="underline" href="/plan">Review lease and checklist</Link>
  </form>;
}
