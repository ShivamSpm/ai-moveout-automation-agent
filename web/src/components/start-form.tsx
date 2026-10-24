"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveStart } from "@/app/start/actions";
import { startDraftSchema, type StartDraft, type StartState } from "@/lib/start-schema";
import { OAuthButton } from "./google-sign-in";

const draftKey = "vacate.start.v1";
const emptyDraft: StartDraft = { email: "", address: "", moveOutDate: "", deposit: "", landlordName: "", landlordEmail: "" };
const steps = ["Your account is ready", "Your move details are saved", "Lease review comes in a later step", "Opening your dashboard…"];
const field = "mt-2 w-full rounded-2xl border-2 border-line bg-paper px-4 py-3 text-ink placeholder:text-muted/70 focus:border-edge focus:outline-none focus:ring-4 focus:ring-tape/50";

export function StartForm({ signedInEmail, initial, providers, resume }: {
  signedInEmail?: string; initial?: StartDraft; providers: { google: boolean; azure: boolean }; resume: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<StartDraft>(initial ?? emptyDraft);
  const [state, action, pending] = useActionState<StartState, FormData>(async (previous, form) => {
    const result = await saveStart(previous, form);
    if (result.status === "confirm_email") storeDraft();
    if (result.status === "existing_account") setSignIn(true);
    if (passwordRef.current) passwordRef.current.value = "";
    if (result.status === "success") {
      try { sessionStorage.removeItem(draftKey); } catch { /* Storage may be unavailable. */ }
      setStep(0);
    }
    return result;
  }, { status: "idle" });
  const [signIn, setSignIn] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [storageError, setStorageError] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  function storeDraft() {
    try { sessionStorage.setItem(draftKey, JSON.stringify(startDraftSchema.parse(values))); }
    catch { setStorageError(true); }
  }

  useEffect(() => {
    if (!resume || !signedInEmail) return;
    const frame = requestAnimationFrame(() => {
      try {
        const saved = sessionStorage.getItem(draftKey);
        if (saved) {
          const parsed = startDraftSchema.safeParse(JSON.parse(saved));
          if (parsed.success) setValues(parsed.data);
        }
      } catch { setStorageError(true); }
    });
    return () => cancelAnimationFrame(frame);
  }, [resume, signedInEmail]);

  useEffect(() => {
    if (state.status !== "success") return;
    const timers = steps.map((_, i) => setTimeout(() => setStep(i), i * 900));
    timers.push(setTimeout(() => { router.push("/dashboard"); router.refresh(); }, steps.length * 900 + 300));
    return () => timers.forEach(clearTimeout);
  }, [state, router]);

  function input(name: keyof StartDraft) {
    return { name, value: values[name], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValues((old) => ({ ...old, [name]: event.target.value })),
      "aria-invalid": Boolean(state.fieldErrors?.[name]?.length), "aria-describedby": `${name}-error` };
  }
  function errors(name: string) {
    return <span id={`${name}-error`} className="mt-1 block text-sm text-stamp">{state.fieldErrors?.[name]?.join(" ")}</span>;
  }

  if (step !== null) return (
    <div className="box-label rise grid min-h-[480px] place-items-center rounded-3xl p-8" role="status">
      <div className="w-full max-w-sm"><p className="font-display text-3xl">Your move is ready</p>
        <ol className="mt-6 space-y-4">{steps.map((label, i) => (
          <li key={label} className={`flex items-center gap-3 transition ${i > step ? "opacity-25" : ""}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${i < step ? "bg-leaf" : i === step ? "live-dot bg-tape" : "bg-line"}`} />{label}
          </li>
        ))}</ol>
      </div>
    </div>
  );

  return (
    <div className="box-label rise rounded-3xl p-6 sm:p-8" style={{ animationDelay: "120ms" }}>
      {signedInEmail && <div className="mb-5 flex flex-wrap gap-2"><span>Signed in as {signedInEmail}</span>
        <form action="/auth/signout" method="post"><button className="underline">Sign out</button></form>
      </div>}
      <form action={(form) => { form.delete("lease"); action(form); }} className="grid gap-5">
        <fieldset disabled={pending} className="contents">
          {!signedInEmail && <section className="grid gap-4" aria-label="You">
            <h2 className="font-display text-2xl">You</h2>
            {(providers.google || providers.azure) && <>
              {providers.google && <OAuthButton provider="google" nextPath="/start?resume=1" beforeRedirect={storeDraft} />}
              {providers.azure && <OAuthButton provider="azure" nextPath="/start?resume=1" beforeRedirect={storeDraft} />}
              <p className="text-center text-sm text-muted">or use your email</p>
            </>}
            <input type="hidden" name="intent" value={signIn ? "signin" : "signup"} />
            <label><span className="text-sm font-medium">Your email</span>
              <input {...input("email")} type="email" autoComplete="email" required className={field} />{errors("email")}
            </label>
            <label><span className="text-sm font-medium">{signIn ? "Your password" : "Create a password"}</span>
              <input ref={passwordRef} name="password" type="password" minLength={8} autoComplete={signIn ? "current-password" : "new-password"} required className={field} aria-invalid={Boolean(state.fieldErrors?.password?.length)} aria-describedby="password-error" />{errors("password")}
            </label>
            <button type="button" className="text-left text-sm underline" onClick={() => setSignIn(!signIn)}>{signIn ? "Create an account instead" : "Sign in instead"}</button>
          </section>}
          {resume && signedInEmail && <p role="status">Re-attach your lease PDF</p>}
          {state.status === "confirm_email" && <p role="status">Check {state.email} to confirm your account, then come back here; {storageError ? "your browser could not save your details. Keep this tab open." : "your details are saved in this browser."}</p>}
          {storageError && <p role="alert">Browser storage is unavailable. You may need to re-enter your details after signing in.</p>}
          {state.message && <p role="alert" className="text-sm text-stamp">{state.message}</p>}
          <label className="block"><span className="text-sm font-medium">Address you&rsquo;re leaving</span>
            <input {...input("address")} required maxLength={200} placeholder="Street address and apartment" className={field} />{errors("address")}
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label><span className="text-sm font-medium">Move-out date</span><input {...input("moveOutDate")} required type="date" className={field} />{errors("moveOutDate")}</label>
            <label><span className="text-sm font-medium">Security deposit</span><input {...input("deposit")} required inputMode="decimal" placeholder="$3,950" className={field} />{errors("deposit")}</label>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label><span className="text-sm font-medium">Landlord or manager</span><input {...input("landlordName")} required maxLength={100} placeholder="Landlord or manager name" className={field} />{errors("landlordName")}</label>
            <label><span className="text-sm font-medium">Their email</span><input {...input("landlordEmail")} required type="email" placeholder="landlord@example.test" className={field} />{errors("landlordEmail")}</label>
          </div>
          <label className="block cursor-pointer"><span className="text-sm font-medium">Your lease (PDF)</span>
            <span className="mt-2 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line px-6 py-10 text-center transition hover:border-ink">
              <span className="tape rounded-full border border-line px-4 py-1 text-sm font-bold">{fileName ? "Selected" : "Choose lease"}</span>
              <span className="mt-3 text-sm text-muted">{fileName ?? "Click to choose a file"}</span>
            </span>
            <input name="lease" type="file" accept="application/pdf" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
          </label>
          <p className="text-sm text-muted">Your lease will be read in a later step. It is not uploaded here.</p>
        </fieldset>
        <button disabled={pending} type="submit" className="tape mt-2 rounded-xl px-6 py-4 font-semibold transition hover:brightness-110 disabled:opacity-60">
          {pending ? "Saving your move…" : signIn && !signedInEmail ? "Sign in and save move" : "Start the agent"}
        </button>
        <p className="text-center text-xs text-muted">You&rsquo;ll review the first email to your landlord before it goes out.</p>
      </form>
    </div>
  );
}
