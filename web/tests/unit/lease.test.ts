import { describe, expect, it } from "vitest";
import { extractLeaseFindings, leaseRulesFrom } from "@/server/domain/lease";
import { SYNTHETIC_LEASE_PAGES } from "../../../fixtures/synthetic/lease-pages";

describe("lease extraction (A01)", () => {
  const findings = extractLeaseFindings(SYNTHETIC_LEASE_PAGES);
  const get = (k: string) => findings.find((f) => f.ruleKey === k)!;

  it("finds clauses on the right pages with quotes", () => {
    expect(get("notice_days")).toMatchObject({ page: 2, value: { days: 30 } });
    expect(get("carpet_cleaning")).toMatchObject({ page: 3, value: { required: true, feeUsd: 350 } });
    expect(get("key_return")).toMatchObject({ page: 4, value: { required: true, feeUsd: 150 } });
    expect(get("notice_days").quote).toMatch(/thirty \(30\) days/i);
  });

  it("leaves missing terms unresolved instead of guessing", () => {
    const only = extractLeaseFindings(["This lease is between the parties named above."]);
    expect(only.every((f) => f.confidence === "unresolved" && f.page === null)).toBe(true);
    const { rules, noticeResolved } = leaseRulesFrom(
      only.map((f) => ({ rule_key: f.ruleKey, value: f.value, page: f.page, confidence: f.confidence })),
    );
    expect(noticeResolved).toBe(false);
    expect(rules.noticeClause).toMatch(/Not found/);
  });

  it("maps findings onto the website plan rules", () => {
    const { rules } = leaseRulesFrom(
      findings.map((f) => ({ rule_key: f.ruleKey, value: f.value, page: f.page, confidence: f.confidence })),
    );
    expect(rules).toMatchObject({
      noticeDays: 30,
      noticeClause: "Lease p.2",
      carpetCleaning: { clause: "Lease p.3", riskUsd: 350 },
      keyReturn: { clause: "Lease p.4", riskUsd: 150 },
    });
  });
});
