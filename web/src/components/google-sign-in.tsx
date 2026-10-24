"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignIn({ enabled }: { enabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const next = new URLSearchParams(window.location.search).get("next") ?? "/dashboard";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setError(error.message);
      setPending(false);
    }
  }

  if (!enabled) {
    return (
      <p className="rounded-xl bg-sand p-4 text-sm text-muted">
        Login isn&rsquo;t configured on this deployment yet. Add the Supabase URL and publishable key
        to the environment to turn it on.
      </p>
    );
  }

  return (
    <div>
      <button
        onClick={signIn}
        disabled={pending}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-card px-5 py-3.5 font-semibold transition hover:bg-paper disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.2v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.2a12 12 0 0 0 0 10.8l4.1-3.1z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.2 6.6l4.1 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
        </svg>
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className="mt-3 text-sm text-stamp">{error}</p>}
    </div>
  );
}
