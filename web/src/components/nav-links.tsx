"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { isActiveLink } from "@/lib/nav";

export interface NavLink {
  href: string;
  label: string;
}

const wide = "relative py-1 transition after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:rounded-full";
const tall = "flex min-h-12 items-center rounded-xl px-4 text-base transition";

function Links({ links, pathname, phone, onPick }: { links: NavLink[]; pathname: string | null; phone?: boolean; onPick?: () => void }) {
  return links.map((link) => {
    const active = isActiveLink(pathname, link.href);
    const look = phone
      ? `${tall} ${active ? "bg-paper font-semibold text-ink shadow-[inset_3px_0_0_var(--tape)]" : "hover:bg-paper"}`
      : `${wide} ${active ? "font-semibold text-ink after:bg-tape" : "text-ink/80 hover:text-ink after:bg-transparent"}`;
    const item = (
      <Link key={link.href} href={link.href} onClick={onPick} aria-current={active ? "page" : undefined} className={look}>
        {link.label}
      </Link>
    );
    return phone ? <li key={link.href}>{item}</li> : item;
  });
}

function Current(props: { links: NavLink[]; phone?: boolean; onPick?: () => void }) {
  return <Links {...props} pathname={usePathname()} />;
}

// The page shell is prerendered, so the highlight fills in once the path is known.
export function NavLinks(props: { links: NavLink[]; phone?: boolean; onPick?: () => void }) {
  return (
    <Suspense fallback={<Links {...props} pathname={null} />}>
      <Current {...props} />
    </Suspense>
  );
}
