// Same-site redirect targets only. Parses rather than prefix-checks, and checks
// the normalized result: "/\\evil.example" and "/..//evil.example" both resolve
// to protocol-relative URLs in browsers.
export function safeNextPath(next: unknown, fallback: string): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.includes("\\")) return fallback;
  try {
    const url = new URL(next, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    const out = `${url.pathname}${url.search}${url.hash}`;
    return out.startsWith("/") && !out.startsWith("//") ? out : fallback;
  } catch {
    return fallback;
  }
}
