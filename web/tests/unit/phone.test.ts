import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, toE164 } from "@/lib/phone";
import { landlordPhoneSchema } from "@/lib/move-fields";

describe("phone mask and normalization", () => {
  it.each([
    ["4", "(4"],
    ["415", "(415"],
    ["4155", "(415) 5"],
    ["4155550", "(415) 555-0"],
    ["4155550134", "(415) 555-0134"],
    ["415abc555xyz0134", "(415) 555-0134"],
    ["1 415 555 0134", "(415) 555-0134"],
    ["41555501349999", "(415) 555-0134"],
    ["", ""],
  ])("masks %s as %s", (typed, shown) => expect(maskPhone(typed)).toBe(shown));

  it("keeps only the number when saving", () => {
    expect(landlordPhoneSchema.parse("Dana (415) 555-0134 ext")).toBe("+14155550134");
    expect(landlordPhoneSchema.safeParse("call me").success).toBe(false);
    expect(landlordPhoneSchema.safeParse("555-0134").success).toBe(false);
  });

  it("round-trips the saved number back into the mask", () => {
    expect(maskPhone("+14155550134")).toBe("(415) 555-0134");
    expect(formatPhone(toE164("415.555.0134"))).toBe("(415) 555-0134");
  });
});
