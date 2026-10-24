import { describe, expect, it } from "vitest";
import { depositSchema, startDraftSchema, startSchema } from "@/lib/start-schema";
const move = { address: "100 Example Street", moveOutDate: "2026-11-30", deposit: "$3,950", landlordName: "Example Manager", landlordEmail: "renter@example.test" };
describe("start intake validation", () => {
  it.each(["$3,950", "3950", "3,950.00"])("parses %s as integer cents", (value) => expect(depositSchema.parse(value)).toBe(395000));
  it.each(["abc", "-1", "1,23", "1.234", "", "21474836.48"])("rejects invalid deposit %s", (value) => expect(depositSchema.safeParse(value).success).toBe(false));
  it("requires email and an eight-character password only when signed out", () => {
    expect(startSchema(true).safeParse(move).success).toBe(true);
    expect(startSchema(false).safeParse(move).success).toBe(false);
    expect(startSchema(false).safeParse({ ...move, email: "renter@example.test", password: "short" }).success).toBe(false);
    expect(startSchema(false).safeParse({ ...move, email: "renter@example.test", password: "long-enough" }).success).toBe(true);
  });
  it.each([{ address: "a".repeat(201) }, { landlordName: "a".repeat(101) }, { landlordEmail: "invalid" }, { moveOutDate: "2026-02-30" }])("rejects invalid move fields %j", (patch) => expect(startSchema(true).safeParse({ ...move, ...patch }).success).toBe(false));
  it("strips credentials and files from drafts", () => {
    const draft = startDraftSchema.parse({ ...move, email: "renter@example.test", password: "never-store", lease: "file" });
    expect(draft).not.toHaveProperty("password");
    expect(draft).not.toHaveProperty("lease");
  });
});
