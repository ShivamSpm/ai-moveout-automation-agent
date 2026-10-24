import type { Metadata } from "next";
import { Suspense } from "react";
import { signIn } from "./actions";

export const metadata: Metadata = { title: "Sign in · Vacate" };

const field =
  "mt-2 w-full rounded-2xl border-2 border-line bg-paper px-4 py-3 text-ink focus:border-edge focus:outline-none focus:ring-4 focus:ring-tape/50";

async function LoginForm({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <form action={signIn} className="box-label grid gap-5 rounded-3xl p-6 sm:p-8">
      <input type="hidden" name="next" value={next ?? "/muse"} />
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <input name="password" type="password" required minLength={8} autoComplete="current-password" className={field} />
      </label>
      {error && <p className="rounded-xl bg-stamp/10 px-4 py-3 text-sm text-stamp">{error}</p>}
      <div className="flex gap-3">
        <button name="mode" value="signin" className="tape flex-1 rounded-xl px-6 py-3 font-semibold">
          Sign in
        </button>
        <button name="mode" value="signup" className="rounded-xl border-2 border-line px-6 py-3 font-semibold">
          Create account
        </button>
      </div>
    </form>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-5xl">Sign in</h1>
      <p className="mt-2 text-muted">Your move, items and approvals are private to your account.</p>
      <div className="mt-8">
        <Suspense>
          <LoginForm searchParams={searchParams as Promise<{ error?: string; next?: string }>} />
        </Suspense>
      </div>
    </main>
  );
}
