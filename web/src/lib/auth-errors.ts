// Plain-language text for Supabase Auth errors shown on /login.
// Matches on the error code first; falls back to Supabase's own message.

export interface AuthErrorLike {
  code?: string;
  message?: string;
}

const BY_CODE: Record<string, string> = {
  invalid_credentials: "Wrong email or password.",
  email_not_confirmed: "Confirm your email first: open the link we sent you, then sign in.",
  user_already_exists: "This email already has an account. Sign in instead.",
  email_exists: "This email already has an account. Sign in instead.",
  over_email_send_rate_limit: "Too many sign-up emails were sent in the last hour. Please try again later.",
  email_address_not_authorized:
    "We can't send a confirmation email to this address yet. Please try again later or sign in with Google.",
  weak_password: "Choose a stronger password: at least 8 characters.",
  signup_disabled: "New sign-ups are closed right now.",
  over_request_rate_limit: "Too many attempts. Wait a minute and try again.",
};

export function friendlyAuthError(error: AuthErrorLike | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  const message = error.message ?? "";
  if (/rate limit/i.test(message)) return BY_CODE.over_email_send_rate_limit;
  if (/not authorized/i.test(message)) return BY_CODE.email_address_not_authorized;
  if (/already (registered|exists)/i.test(message)) return BY_CODE.user_already_exists;
  return message || "Something went wrong. Please try again.";
}
