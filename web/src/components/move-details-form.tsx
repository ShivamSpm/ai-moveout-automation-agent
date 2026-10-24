"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { saveMoveDetails } from "@/app/move/actions";
import { MoveOutCalendar } from "@/components/move-out-calendar";
import type { MoveDetailsState } from "@/lib/move-details-schema";

export interface MoveDetailsInitial {
  renterName: string;
  moveOutDate: string;
  address: string;
  zip: string;
  bedrooms: string;
  bathrooms: string;
  sqft: string;
  landlordName: string;
  landlordPhone: string;
  landlordEmail: string;
}

const field =
  "mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3 text-ink placeholder:text-muted/70 focus:border-tape focus:outline-none focus:ring-4 focus:ring-tape/20";

export function MoveDetailsForm({ initial, canSave }: { initial: MoveDetailsInitial; canSave: boolean }) {
  const [state, action, pending] = useActionState<MoveDetailsState, FormData>(saveMoveDetails, { status: "idle" });
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-6" noValidate>
      <Section step="1" title="About you">
        <Input name="renterName" label="Your name" defaultValue={initial.renterName} autoComplete="name" errors={errors} />
      </Section>

      <Section step="2" title="Your move-out day">
        <MoveOutCalendar name="moveOutDate" defaultValue={initial.moveOutDate || undefined} />
        <FieldError errors={errors.moveOutDate} />
      </Section>

      <Section step="3" title="Your landlord" hint="The agent contacts them to confirm the date and get the move-out checklist.">
        <Input name="landlordName" label="Landlord or property manager" defaultValue={initial.landlordName} errors={errors} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="landlordPhone" label="Phone" type="tel" placeholder="(415) 555-0134" defaultValue={initial.landlordPhone} autoComplete="off" errors={errors} />
          <Input name="landlordEmail" label="Email (optional)" type="email" defaultValue={initial.landlordEmail} autoComplete="off" errors={errors} />
        </div>
      </Section>

      <Section step="4" title="Your apartment" hint="Cleaning and moving quotes are based on its size.">
        <Input name="address" label="Address you're leaving" defaultValue={initial.address} autoComplete="street-address" errors={errors} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Input name="zip" label="ZIP" inputMode="numeric" maxLength={5} defaultValue={initial.zip} autoComplete="postal-code" errors={errors} />
          <Select name="bedrooms" label="Bedrooms" defaultValue={initial.bedrooms} options={[["0", "Studio"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5+"]]} errors={errors} />
          <Select name="bathrooms" label="Bathrooms" defaultValue={initial.bathrooms} options={["1", "1.5", "2", "2.5", "3", "3.5", "4"].map((v) => [v, v])} errors={errors} />
          <Input name="sqft" label="Sq ft (optional)" inputMode="numeric" placeholder="747" defaultValue={initial.sqft} errors={errors} />
        </div>
      </Section>

      <div className="box-label sticky bottom-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4">
        <p className="text-sm text-muted" aria-live="polite">
          {state.status === "saved" ? (
            <span className="font-semibold text-leaf">✓ Saved. Your plan now counts back from this date.</span>
          ) : state.message ? (
            <span className="text-stamp">{state.message}</span>
          ) : canSave ? (
            "Only you can see these details."
          ) : (
            "Preview mode: sign-in isn't configured here, so saving is off."
          )}
        </p>
        <div className="flex gap-2">
          {state.status === "saved" && (
            <Link href="/dashboard" className="rounded-xl border border-line px-5 py-3 font-semibold transition hover:bg-paper">
              Go to dashboard
            </Link>
          )}
          <button
            type="submit"
            disabled={pending || !canSave}
            className="tape rounded-xl px-6 py-3 font-semibold transition hover:brightness-110 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save move details"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Section({ step, title, hint, children }: { step: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="box-label rounded-3xl p-6 sm:p-7">
      <div className="flex items-baseline gap-3">
        <span className="tape grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold">{step}</span>
        <div>
          <h2 className="font-display text-2xl">{title}</h2>
          {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
        </div>
      </div>
      <div className="mt-5 grid gap-4">{children}</div>
    </section>
  );
}

type Errors = Record<string, string[] | undefined>;

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? <p className="mt-1.5 text-sm text-stamp">{errors[0]}</p> : null;
}

function Input({ name, label, errors, ...rest }: { name: string; label: string; errors: Errors } & React.InputHTMLAttributes<HTMLInputElement>) {
  const invalid = Boolean(errors[name]?.length);
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input name={name} className={`${field} ${invalid ? "border-stamp" : ""}`} aria-invalid={invalid} {...rest} />
      <FieldError errors={errors[name]} />
    </label>
  );
}

function Select({ name, label, options, defaultValue, errors }: { name: string; label: string; options: string[][]; defaultValue: string; errors: Errors }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select name={name} defaultValue={defaultValue} className={field}>
        <option value="" disabled>
          Choose
        </option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      <FieldError errors={errors[name]} />
    </label>
  );
}
