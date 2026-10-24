import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "@/lib/auth-errors";

describe("friendlyAuthError", () => {
  it.each([
    ["invalid_credentials", "Wrong email or password."],
    ["email_not_confirmed", "Confirm your email first: open the link we sent you, then sign in."],
    ["over_email_send_rate_limit", "Too many sign-up emails were sent in the last hour. Please try again later."],
    ["user_already_exists", "This email already has an account. Sign in instead."],
  ])("maps code %s", (code, text) => {
    expect(friendlyAuthError({ code, message: "raw" })).toBe(text);
  });

  it("recognizes errors by message when the code is missing", () => {
    expect(friendlyAuthError({ message: "email rate limit exceeded" })).toMatch(/Too many sign-up emails/);
    expect(friendlyAuthError({ message: 'Email address "a@b.c" cannot be used as it is not authorized' })).toMatch(/can't send a confirmation email/);
  });

  it("falls back to Supabase's message, then a generic one", () => {
    expect(friendlyAuthError({ code: "something_new", message: "Specific problem" })).toBe("Specific problem");
    expect(friendlyAuthError(null)).toBe("Something went wrong. Please try again.");
  });
});
