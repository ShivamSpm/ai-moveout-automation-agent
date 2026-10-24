import { describe, expect, it } from "vitest";
import { isActiveLink } from "@/lib/nav";

describe("isActiveLink", () => {
  it("highlights the link for the current page and its subpages", () => {
    expect(isActiveLink("/calls", "/calls")).toBe(true);
    expect(isActiveLink("/account/documents", "/account/documents")).toBe(true);
    expect(isActiveLink("/items/abc", "/items")).toBe(true);
  });

  it("treats /start as My move", () => {
    expect(isActiveLink("/start", "/move")).toBe(true);
    expect(isActiveLink("/move", "/move")).toBe(true);
  });

  it("doesn't match other pages or prefixes of other words", () => {
    expect(isActiveLink("/dashboard", "/calls")).toBe(false);
    expect(isActiveLink("/selling", "/sell")).toBe(false);
    expect(isActiveLink(null, "/calls")).toBe(false);
  });
});
