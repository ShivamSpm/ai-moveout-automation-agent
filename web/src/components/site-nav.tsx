import Link from "next/link";
import { UserMenu } from "@/components/user-menu";
import { authEnabled } from "@/lib/supabase/env";

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="tape grid h-8 w-8 place-items-center rounded-lg font-display text-lg italic leading-none"
      >
        v
      </span>
      <span className="font-display text-2xl leading-none">Vacate</span>
    </span>
  );
}

const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/move", label: "My move" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/items", label: "Selling" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between rounded-2xl border border-line bg-card/95 pl-5 pr-2.5 shadow-[0_10px_30px_-18px_rgba(16,24,27,0.35)] backdrop-blur">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="Vacate home">
            <Logo />
          </Link>
          <div className="hidden items-center gap-6 text-sm md:flex">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="text-ink/80 transition hover:text-ink">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <UserMenu authEnabled={authEnabled} />
          <Link
            href="/start"
            className="tape rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:brightness-110"
          >
            Start my move-out
          </Link>
        </div>
      </nav>
    </header>
  );
}
