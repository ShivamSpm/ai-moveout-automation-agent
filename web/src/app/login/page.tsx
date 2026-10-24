import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { GoogleSignIn } from "@/components/google-sign-in";
import { authEnabled } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Log in · Vacate" };

export default function Login({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:items-center">
      <div className="relative hidden aspect-[4/5] overflow-hidden rounded-3xl lg:block">
        <Image src="/art/photo-hero.jpg" alt="" fill sizes="560px" className="object-cover object-right" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0b1214]/80 via-transparent to-transparent" />
        <p className="absolute bottom-8 left-8 right-8 font-display text-4xl leading-tight text-white">
          Move out on autopilot.
          <span className="mt-3 block font-sans text-base text-white/75">You approve. The agent handles the rest.</span>
        </p>
      </div>

      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-5xl leading-tight">Log in to Vacate</h1>
        <p className="mt-3 text-muted">
          Your plan, your landlord thread and the things you&rsquo;re selling, in one place.
        </p>
        <div className="box-label mt-8 rounded-3xl p-6">
          <Suspense fallback={null}>
            <CallbackError searchParams={searchParams} />
          </Suspense>
          <GoogleSignIn enabled={authEnabled} />
          <p className="mt-5 text-xs leading-relaxed text-muted">
            We only use your Google account to sign you in. Vacate never sends anything on your
            behalf without your approval.
          </p>
        </div>
      </div>
    </main>
  );
}

async function CallbackError({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p className="mb-4 rounded-xl bg-stamp/10 p-3 text-sm text-stamp">
      That sign-in didn&rsquo;t go through. Please try again.
    </p>
  );
}
