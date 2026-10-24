import { describe, expect, it } from "vitest";
import { reasonLabel, resaleRange, slotTime } from "@/components/chat/format";

describe("chat card formatting", () => {
  it("formats a slot in the given time zone", () => {
    expect(slotTime("2026-11-02T16:00:00Z", "2026-11-02T19:30:00Z", "America/Los_Angeles")).toBe("Mon, Nov 2, 8:00 AM to 11:30 AM");
  });
  it("does not throw on an unparseable slot", () => {
    expect(slotTime("nope", "nope")).toBe("Unknown time");
  });
  it("labels known reason codes and falls back for unknown ones", () => {
    expect(reasonLabel("over_budget")).toBe("Over budget");
    expect(reasonLabel("new_code_here")).toBe("new code here");
  });
  it("formats a resale range, a single value and a missing estimate", () => {
    expect(resaleRange({ low: 20, high: 60 })).toBe("$20 to $60");
    expect(resaleRange({ low: 15, high: 15 })).toBe("$15");
    expect(resaleRange(null)).toBe("No estimate");
  });
});
