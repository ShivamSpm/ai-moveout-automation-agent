"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Account {
  name: string;
  avatar?: string;
}

// Runs in the browser so the nav (and every page) stays in the static shell.
export function UserMenu({ authEnabled }: { authEnabled: boolean }) {
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    if (!authEnabled) return;
    const supabase = createClient();
    const toAccount = (meta: Record<string, string> | undefined, email?: string): Account => ({
      name: meta?.full_name ?? meta?.name ?? email ?? "Account",
      avatar: meta?.avatar_url ?? meta?.picture,
    });
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setAccount(toAccount(data.user.user_metadata, data.user.email));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccount(session?.user ? toAccount(session.user.user_metadata, session.user.email) : null);
    });
    return () => sub.subscription.unsubscribe();
  }, [authEnabled]);

  if (!authEnabled) return null;

  if (!account) {
    return (
      <Link href="/login" className="hidden rounded-xl px-4 py-2.5 text-sm font-medium transition hover:bg-paper sm:block">
        Log in
      </Link>
    );
  }

  return (
    <form action="/auth/signout" method="post" className="flex items-center gap-2">
      {account.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- Google avatar URL, any host
        <img src={account.avatar} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="tape grid h-8 w-8 place-items-center rounded-full text-sm font-semibold">
          {account.name.charAt(0).toUpperCase()}
        </span>
      )}
      <button type="submit" className="hidden rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-paper hover:text-ink sm:block">
        Log out
      </button>
    </form>
  );
}
