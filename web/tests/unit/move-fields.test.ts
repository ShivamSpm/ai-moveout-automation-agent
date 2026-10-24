import { expect, it } from "vitest";
import { addressFields, fullAddress } from "@/lib/move-fields";
import { startSchema } from "@/lib/start-schema";
import { moveDetailsSchema } from "@/lib/move-details-schema";
it("uses identical move fields for onboarding and editing without requiring a phone or apartment size", () => {
  const input = { renterName: "Example Renter", address: "100 Test Street", addressLine2: "Unit 4", city: "Example City", region: "CA", zip: "94110", moveOutDate: "2026-11-30", deposit: "3950", propertyManagementCompany: "Example Management", landlordName: "Example Manager", landlordEmail: "manager@example.test", landlordPhone: "", bedrooms: "", bathrooms: "", sqft: "" };
  const { intent, ...start } = startSchema(true).parse(input);
  expect(intent).toBe('signup'); expect(start).toEqual(moveDetailsSchema.parse(input));
  expect(fullAddress(start)).toBe("100 Test Street, Unit 4, Example City, CA 94110");
});
it("prefills a legacy complete address without writing guessed values", () => {
  expect(addressFields({ address_private: "100 Test Street, Example City, CA 94110", address_line1: null, address_line2: null, city: null, region: null, zip: null })).toEqual({ address: "100 Test Street", addressLine2: "", city: "Example City", region: "CA", zip: "94110" });
});
it("preserves an ambiguous legacy address in full for renter correction", () => {
  expect(addressFields({ address_private: "100 Test Street, near the park", address_line1: null, address_line2: null, city: null, region: null, zip: null }).address).toBe("100 Test Street, near the park");
});
