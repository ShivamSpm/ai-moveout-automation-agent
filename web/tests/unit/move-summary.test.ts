import { describe, it, expect } from "vitest";
import { daysUntil, todayInTimezone, leaseFees, renterContext } from "@/lib/move-summary";
import type { MoveView } from "@/server/move-view";
const view = { move: { address_private: "PRIVATE ADDRESS", landlord_email: "private@example.test", move_out_date: "2026-11-30", timezone: "America/Los_Angeles" }, tasks: [], findings: [{ rule: "key_return", value: { feeUsd: 150 }, confidence: "medium", page: 2, quote: "Return keys." }], approvals: [], activity: [], items: [], listings: [] } as unknown as MoveView;
describe("saved move summary", () => {
  it("uses the renter's calendar date across UTC midnight", () => {
    expect(todayInTimezone("America/Los_Angeles", new Date("2026-10-25T01:00:00Z"))).toBe("2026-10-24");
    expect(daysUntil("2026-11-30", "2026-10-24")).toBe(37);
  });
  it("counts only finite nonnegative extracted fees", () => {
    expect(leaseFees(view.findings)).toBe(150);
    expect(leaseFees([...view.findings, { ...view.findings[0], value: { feeUsd: 900 }, confidence: "unresolved" }, { ...view.findings[0], value: { feeUsd: "fake" } }])).toBe(150);
  });
  it("keeps page evidence and omits private move fields from chat context", () => {
    const context = renterContext(view);
    expect(context).toContain('"page":2'); expect(context).toContain("Return keys.");
    expect(context).not.toContain("PRIVATE ADDRESS"); expect(context).not.toContain("private@example.test");
  });
  it("bounds large contexts without emitting truncated JSON", () => {
    const large = { ...view, tasks: Array.from({ length: 30 }, (_, i) => ({ id: String(i), title: "t".repeat(1000), source: "s".repeat(1000), status: "todo", due_date: null, page: 2 })), findings: Array.from({ length: 20 }, () => ({ ...view.findings[0], quote: "q".repeat(4000) })) } as unknown as MoveView;
    const context = renterContext(large);
    expect(context.length).toBeLessThanOrEqual(18000);
    expect(() => JSON.parse(context)).not.toThrow();
    expect(JSON.parse(context).findings[0].page).toBe(2);
  });

});
