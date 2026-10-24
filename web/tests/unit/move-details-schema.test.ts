import { describe, expect, it } from "vitest";
import { moveDetailsSchema } from "@/lib/move-details-schema";

const form = {
  deposit: "3950", city: "Example City", region: "CA",
  renterName: "Example Renter",
  moveOutDate: "2026-11-30",
  address: "100 Example Street, Apt 3",
  zip: "94110",
  bedrooms: "1",
  bathrooms: "1.5",
  sqft: "747",
  landlordName: "Example Manager",
  landlordPhone: "(415) 555-0134",
  landlordEmail: "manager@example.test",
};

describe("move details validation", () => {
  it("parses form strings into numbers and preserves the contact email", () => {
    const parsed = moveDetailsSchema.parse(form);
    expect(parsed).toMatchObject({ bedrooms: 1, bathrooms: 1.5, sqft: 747, zip: "94110" });
    expect(parsed.landlordEmail).toBe("manager@example.test");
  });

  it("allows a studio and an unknown square footage", () => {
    const parsed = moveDetailsSchema.parse({ ...form, bedrooms: "0", sqft: "" });
    expect(parsed.bedrooms).toBe(0);
    expect(parsed.sqft).toBeUndefined();
  });

  it.each([
    { zip: "9411" },
    { zip: "94110-1234" },
    { bathrooms: "1.25" },
    { bathrooms: "0" },
    { bedrooms: "11" },
    { sqft: "50" },
    { landlordPhone: "call me" },
    { landlordPhone: "123" },
    { landlordEmail: "not-an-email" },
    { moveOutDate: "2026-02-30" },
    { renterName: "  " },
  ])("rejects %j", (patch) => {
    expect(moveDetailsSchema.safeParse({ ...form, ...patch }).success).toBe(false);
  });

  it.each(["+1 415 555 0134", "415-555-0134", "415.555.0134"])("accepts phone %s", (landlordPhone) => {
    expect(moveDetailsSchema.safeParse({ ...form, landlordPhone }).success).toBe(true);
  });
});
