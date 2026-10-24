import { describe, expect, it } from "vitest";
import { slidingWindow } from "@/server/rate-limit";

describe("slidingWindow", () => {
  it("allows up to the limit per key, then reports when to retry", () => {
    const limit = slidingWindow(2, 60_000);
    expect(limit.check("a", 0)).toEqual({ allowed: true });
    expect(limit.check("a", 1_000)).toEqual({ allowed: true });
    expect(limit.check("a", 2_000)).toEqual({ allowed: false, retryAfterSeconds: 58 });
    expect(limit.check("b", 2_000)).toEqual({ allowed: true });
  });

  it("frees capacity as old hits leave the window", () => {
    const limit = slidingWindow(1, 60_000);
    expect(limit.check("a", 0).allowed).toBe(true);
    expect(limit.check("a", 59_999).allowed).toBe(false);
    expect(limit.check("a", 60_000).allowed).toBe(true);
  });

  it("keeps memory bounded by evicting the least recently used key", () => {
    const limit = slidingWindow(1, 60_000, 2);
    limit.check("a", 0);
    limit.check("b", 0);
    limit.check("c", 0); // evicts "a"
    expect(limit.check("a", 1).allowed).toBe(true);
    expect(limit.check("c", 1).allowed).toBe(false);
  });
});
