// Which top-nav link is the current page. /start is the same page as My move.
export function isActiveLink(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/move") return pathname === "/move" || pathname === "/start";
  return pathname === href || pathname.startsWith(`${href}/`);
}
