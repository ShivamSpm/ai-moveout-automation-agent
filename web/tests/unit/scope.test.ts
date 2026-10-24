import { describe, expect, it } from "vitest";
import { checkScope } from "@/server/domain/scope";

describe("anti-eviction scope (A15/A16)", () => {
  it.each([
    "I'm the landlord and need to evict my tenant by Friday",
    "Draft a 3-day pay or quit notice for unit 4",
    "Help me change the locks while they're at work",
    "How do I get rid of the tenant's belongings left in the unit?",
    "My tenant won't leave, write an eviction letter",
    "Prepare an unlawful detainer for the tenants",
  ])("refuses landlord-side request: %s", (text) => {
    expect(checkScope(text).kind).toBe("refused");
  });

  it.each([
    "Send my landlord my 30-day notice to vacate",
    "I want to give notice that I'm moving out on Nov 30",
    "Sell my sofa and donate the plants before I leave",
    "Ask the landlord to schedule a move-out inspection",
    "What does my lease say about getting my deposit back?",
  ])("allows renter's voluntary move: %s", (text) => {
    expect(checkScope(text).kind).toBe("allowed");
  });

  it("refers a renter facing eviction instead of giving legal advice", () => {
    expect(checkScope("My landlord is trying to evict me, what do I do?").kind).toBe("referral");
  });
});
