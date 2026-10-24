import "server-only";

// Per-key sliding-window limit kept in this server instance's memory. It stops
// one signed-in renter from hammering a paid endpoint; it is not a global
// quota (instances don't share it), so the provider key's own credit limit and
// the spend ledger remain the hard backstop.

export interface RateLimit {
  check(key: string, now?: number): { allowed: true } | { allowed: false; retryAfterSeconds: number };
}

export function slidingWindow(limit: number, windowMs: number, maxKeys = 10_000): RateLimit {
  const hits = new Map<string, number[]>();
  return {
    check(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterSeconds: Math.ceil((recent[0] + windowMs - now) / 1000) };
      }
      recent.push(now);
      hits.delete(key);
      hits.set(key, recent);
      // Drop the least recently used keys so memory stays bounded.
      while (hits.size > maxKeys) hits.delete(hits.keys().next().value!);
      return { allowed: true };
    },
  };
}
