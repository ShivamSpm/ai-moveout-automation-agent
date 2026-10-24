import { describe, expect, it } from "vitest";
import { disclosesAddress, draftListing, draftNoticeEmail, zonedIso } from "@/server/domain/drafts";

const move = {
  tenantName: "Alex Example",
  landlordName: "Pat Landlord",
  landlordEmail: "landlord@example.test",
  addressPrivate: "100 Example Street, Apt 2",
  areaLabel: "Mission District",
  moveOutDate: "2026-11-30",
  timezone: "America/Los_Angeles",
};

describe("drafts", () => {
  it("notice email cites the lease clause and claims no agreement", () => {
    const d = draftNoticeEmail(move, { noticeDays: 30, noticeClause: "Lease p.2", inspectionDate: "2026-11-16" });
    expect(d.to).toEqual(["landlord@example.test"]);
    expect(d.body).toContain("Lease p.2");
    expect(d.body).not.toMatch(/agreed|confirmed|entitled/i);
  });

  it("listing uses the general area, never the exact address (A09)", () => {
    const l = draftListing({ name: "Sofa", condition: "Good", description: null, askCents: 12000, disposition: "sell" }, move.areaLabel);
    expect(l.body).toContain("Mission District");
    expect(disclosesAddress(l.body, move.addressPrivate)).toBe(false);
    expect(disclosesAddress("Come to 100 Example St at 5", move.addressPrivate)).toBe(true);
  });

  it("uses the move's timezone offset for that date", () => {
    expect(zonedIso("2026-11-16", "10:00", "America/Los_Angeles")).toBe("2026-11-16T10:00:00-08:00");
    expect(zonedIso("2026-10-24", "10:00", "America/Los_Angeles")).toBe("2026-10-24T10:00:00-07:00");
  });
});
