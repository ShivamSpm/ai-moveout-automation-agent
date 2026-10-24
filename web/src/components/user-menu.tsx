"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NavLinks, type NavLink } from "@/components/nav-links";

interface Account {
  name: string;
  email?: string;
  avatar?: string;
}


// Runs in the browser so the nav (and every page) stays in the static shell.
function useAccount(authEnabled: boolean) {
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    if (!authEnabled) return;
    const supabase = createClient();
    const toAccount = (meta: Record<string, string> | undefined, email?: string): Account => ({
      name: meta?.full_name ?? meta?.name ?? email ?? "Account",
      email,
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

  return account;
}

function Avatar({ account }: { account: Account }) {
  return account.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element -- Google avatar URL, any host
    <img src={account.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full" referrerPolicy="no-referrer" />
  ) : (
    <span className="tape grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold">
      {account.name.charAt(0).toUpperCase()}
    </span>
  );
}

// Right side of the nav: inline account + Start on wide screens, a menu on phones.
export function UserMenu({ authEnabled, links }: { authEnabled: boolean; links: NavLink[] }) {
  const account = useAccount(authEnabled);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Wide screens */}
      <div className="hidden items-center gap-1 whitespace-nowrap xl:flex">
        {authEnabled &&
          (account ? (
            <form action="/auth/signout" method="post" className="flex items-center gap-2">
              <Avatar account={account} />
              <button type="submit" className="rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-paper hover:text-ink">
                Log out
              </button>
            </form>
          ) : (
            <Link href="/login" className="rounded-xl px-4 py-2.5 text-sm font-medium transition hover:bg-paper">
              Log in
            </Link>
          ))}
        <Link href="/start" className="tape rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:brightness-110">
          Start my move-out
        </Link>
      </div>

      {/* Phones */}
      <div className="flex items-center gap-1.5 xl:hidden">
        <Link href="/start" className="tape rounded-xl px-4 py-2.5 text-sm font-semibold">
          Start
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="grid h-11 w-11 place-items-center rounded-xl transition hover:bg-paper"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full mt-2 rounded-2xl border border-line bg-card p-2 shadow-[0_20px_40px_-20px_rgba(16,24,27,0.45)] xl:hidden"
        >
          <nav aria-label="Main">
            <ul>
              <NavLinks links={links} phone onPick={() => setOpen(false)} />
            </ul>
          </nav>
          {authEnabled && (
            <div className="mt-2 border-t border-line pt-2">
              {account ? (
                <form action="/auth/signout" method="post" className="flex items-center gap-3 px-4 py-2">
                  <Avatar account={account} />
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{account.email ?? account.name}</span>
                  <button type="submit" className="min-h-11 rounded-xl px-3 text-sm font-medium transition hover:bg-paper">
                    Log out
                  </button>
                </form>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center rounded-xl px-4 text-base font-medium transition hover:bg-paper"
                >
                  Log in
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
