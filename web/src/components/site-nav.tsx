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
  { href: "/demo", label: "Example" },
  { href: "/move", label: "My move" },
  { href: "/account/documents", label: "Documents" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/items", label: "Selling" },
  { href: "/sell", label: "Sell on Telegram" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
      <div className="relative mx-auto max-w-6xl">
        <nav aria-label="Site" className="flex h-16 items-center justify-between rounded-2xl border border-line bg-card/95 pl-4 pr-2 sm:pl-5 sm:pr-2.5 shadow-[0_10px_30px_-18px_rgba(16,24,27,0.35)] backdrop-blur">
          <div className="flex items-center gap-6 xl:gap-8">
            <Link href="/" aria-label="Vacate home">
              <Logo />
            </Link>
            <div className="hidden items-center gap-5 whitespace-nowrap text-sm lg:flex">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="text-ink/80 transition hover:text-ink">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <UserMenu authEnabled={authEnabled} links={links} />
        </nav>
      </div>
    </header>
  );
}
