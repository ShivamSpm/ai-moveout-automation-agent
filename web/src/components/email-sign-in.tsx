import { signIn } from "@/app/login/actions";

// Email and password sign-in, alongside Google. Needed wherever the Google
// provider isn't configured (local Supabase) and for test accounts.
const field =
  "mt-1.5 w-full rounded-xl border-2 border-line bg-paper px-3 py-2.5 text-ink focus:border-edge focus:outline-none focus:ring-4 focus:ring-tape/50";

export async function EmailSignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = typeof next === "string" ? next : "/muse";
  const message = typeof error === "string" && error !== "1" ? error : null;
  return (
    <form action={signIn} className="mt-6 grid gap-3 border-t border-dashed border-line pt-6">
      <input type="hidden" name="next" value={nextPath} />
      <label className="block text-sm font-medium">
        Email
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input name="password" type="password" required minLength={8} autoComplete="current-password" className={field} />
      </label>
      {message && <p className="rounded-xl bg-stamp/10 p-3 text-sm text-stamp">{message}</p>}
      <div className="flex gap-2">
        <button name="mode" value="signin" className="tape flex-1 rounded-xl px-5 py-2.5 text-sm font-semibold">
          Sign in with email
        </button>
        <button name="mode" value="signup" className="rounded-xl border-2 border-line px-5 py-2.5 text-sm font-semibold">
          Create account
        </button>
      </div>
    </form>
  );
}
