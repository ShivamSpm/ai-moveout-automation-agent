// Anti-eviction boundary. The assistant serves the renter who is moving. It
// does not help a landlord remove a tenant: no eviction demands, lockouts,
// utility shutoffs or disposal of a tenant's belongings. A renter's own
// voluntary notice to vacate and sale of their own things stay in scope.
// Checked in chat and again at every tool and action entry point.

export type ScopeVerdict =
  | { kind: "allowed" }
  | { kind: "refused"; reason: string }
  | { kind: "referral"; reason: string };

const landlordVoice =
  /\b(i\s*(?:am|'m)\s+(?:the|a|their)\s+(?:landlord|property\s+manager|owner)|as\s+(?:the|a)\s+landlord|my\s+tenants?|our\s+tenants?|the\s+tenants?\s+(?:won'?t|refuses?|hasn'?t|is\s+late|owes))\b/i;

const removalOfTenant =
  /\b(evict(?:ing|ion)?\s+(?:the|my|our|a|this|that|him|her|them)\b|evict\s+(?:the|my|our)?\s*tenants?|kick\s+(?:the\s+tenants?|them|him|her)\s+out|get\s+(?:the\s+tenants?|them|him|her)\s+out|notice\s+to\s+quit|pay[\s-]+or[\s-]+quit|cure[\s-]+or[\s-]+quit|unlawful\s+detainer|change\s+the\s+locks|lock\s+(?:them|him|her|the\s+tenants?)\s+out|(?:remove|throw\s+out|dispose\s+of|get\s+rid\s+of|sell)\s+(?:the\s+)?(?:tenant'?s?|their|his|her)\s+(?:belongings|things|stuff|property|furniture)|shut\s+off\s+(?:their|the\s+tenant'?s?)\s+(?:utilities|water|power|electricity|gas))\b/i;

const renterFacingEviction =
  /\b(i\s*(?:am|'m)\s+being\s+evicted|(?:my\s+)?landlord\s+(?:is\s+)?(?:trying\s+to\s+)?evict(?:ing)?\s+me|got\s+an?\s+eviction\s+notice|received\s+an?\s+(?:eviction|unlawful\s+detainer))\b/i;

export function checkScope(text: string): ScopeVerdict {
  if (renterFacingEviction.test(text)) {
    return {
      kind: "referral",
      reason:
        "I can't give legal advice about an eviction. A local tenant rights organization or legal aid office can help. I can still help with a move you choose to make.",
    };
  }
  if (removalOfTenant.test(text) || (landlordVoice.test(text) && /\bevict/i.test(text))) {
    return {
      kind: "refused",
      reason:
        "This assistant works for renters moving out on their own terms. It can't help remove a tenant, draft eviction demands, or handle a tenant's belongings for a landlord.",
    };
  }
  return { kind: "allowed" };
}

export class ScopeError extends Error {
  status = 403;
}

export function assertInScope(...texts: Array<string | null | undefined>): void {
  for (const text of texts) {
    if (!text) continue;
    const verdict = checkScope(text);
    if (verdict.kind === "refused") throw new ScopeError(verdict.reason);
  }
}
