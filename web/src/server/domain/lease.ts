// Pattern-based lease reader. It finds the clauses the plan depends on, with the
// page and the sentence each came from. Anything not found is "unresolved";
// nothing is guessed. The model-based extractor returns the same shape.

import type { LeaseFinding, LeaseRuleKey } from "@/contracts";
import type { LeaseRules } from "@/lib/schedule";

interface Rule {
  key: LeaseRuleKey;
  sentence: RegExp;
  value: (sentence: string) => LeaseFinding["value"];
}

const dollars = (s: string) => {
  const m = s.replace(/,/g, "").match(/\$\s?(\d{1,6})(?:\.\d{2})?/);
  return m ? Number(m[1]) : undefined;
};

const RULES: Rule[] = [
  {
    key: "notice_days",
    sentence: /(\b\d{1,3}\b|\bthirty\b|\bsixty\b)\s*(?:\(\d{1,3}\)\s*)?(?:calendar\s+)?days?['’]?\s+(?:prior\s+|advance\s+)?written\s+notice|written\s+notice[^.]{0,80}?\b(\d{1,3})\s*(?:calendar\s+)?days/i,
    value: (s) => {
      const words: Record<string, number> = { thirty: 30, sixty: 60 };
      const m =
        s.match(/\b(\d{1,3})\s*(?:\(\d{1,3}\)\s*)?(?:calendar\s+)?days?['’]?\s+(?:prior\s+|advance\s+)?written\s+notice/i) ??
        s.match(/written\s+notice[^.]{0,80}?\b(\d{1,3})\s*(?:calendar\s+)?days/i);
      const w = s.match(/\b(thirty|sixty)\b/i);
      const days = m ? Number(m[1]) : w ? words[w[1].toLowerCase()] : undefined;
      return days ? { days } : null;
    },
  },
  {
    key: "carpet_cleaning",
    sentence: /carpets?[^.]{0,120}professional(?:ly)?\s+clean|professional(?:ly)?\s+(?:carpet\s+)?clean[^.]{0,80}carpets?/i,
    value: (s) => ({ required: true, ...(dollars(s) ? { feeUsd: dollars(s)! } : {}) }),
  },
  {
    key: "wall_repair",
    sentence: /(nail\s+holes|patch(?:ed|ing)?\s+(?:all\s+)?(?:holes|walls)|touch[\s-]up\s+paint|repaint)/i,
    value: (s) => ({ required: true, ...(dollars(s) ? { feeUsd: dollars(s)! } : {}) }),
  },
  {
    key: "general_cleaning",
    sentence: /(clean\s+(?:and\s+sanitary\s+)?condition|broom[\s-]clean|same\s+condition[^.]{0,60}(?:clean|wear)|cleaning\s+fee|thoroughly\s+clean)/i,
    value: (s) => ({ required: true, ...(dollars(s) ? { feeUsd: dollars(s)! } : {}) }),
  },
  {
    key: "key_return",
    sentence: /(keys?|fobs?|access\s+cards?|remotes?)[^.]{0,140}(return|surrender)|(return|surrender)[^.]{0,80}(keys?|fobs?)/i,
    value: (s) => ({ required: true, ...(dollars(s) ? { feeUsd: dollars(s)! } : {}) }),
  },
];

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.;])\s+(?=[A-Z0-9§(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// pages[i] is the text of page i + 1.
export function extractLeaseFindings(pages: string[]): LeaseFinding[] {
  return RULES.map((rule) => {
    for (let i = 0; i < pages.length; i++) {
      const list = sentences(pages[i]);
      for (let j = 0; j < list.length; j++) {
        const s = list[j];
        if (!rule.sentence.test(s)) continue;
        // Fees are often stated in the sentence right after the obligation.
        const value = rule.value(list[j + 1] ? `${s} ${list[j + 1]}` : s);
        if (rule.key === "notice_days" && !value) continue;
        return {
          ruleKey: rule.key,
          value,
          quote: s.length > 600 ? `${s.slice(0, 597)}…` : s,
          page: i + 1,
          confidence: "medium" as const,
        };
      }
    }
    return { ruleKey: rule.key, value: null, quote: null, page: null, confidence: "unresolved" as const };
  });
}

export interface FindingRow {
  rule_key: string;
  value: unknown;
  page: number | null;
  confidence: string;
}

const pageLabel = (f: FindingRow | undefined) => (f?.page ? `Lease p.${f.page}` : undefined);
const fee = (f: FindingRow | undefined) =>
  f?.value && typeof f.value === "object" && "feeUsd" in f.value ? Number(f.value.feeUsd) : 0;

// Map findings onto the website's LeaseRules so its buildPlan() can date the
// checklist. Unresolved clauses say so instead of inventing a source.
export function leaseRulesFrom(findings: FindingRow[]): {
  rules: LeaseRules;
  noticeResolved: boolean;
  leaseSources: Set<string>;
} {
  const by = (k: LeaseRuleKey) =>
    findings.find((f) => f.rule_key === k && f.confidence !== "unresolved");
  const notice = by("notice_days");
  const noticeDays =
    notice?.value && typeof notice.value === "object" && "days" in notice.value
      ? Number(notice.value.days)
      : 30;
  const carpet = by("carpet_cleaning");
  const wall = by("wall_repair");
  const clean = by("general_cleaning");
  const keys = by("key_return");
  const rules: LeaseRules = {
    noticeDays,
    noticeClause: pageLabel(notice) ?? "Not found in lease: confirm notice period (30 days assumed)",
    generalCleaning: { clause: pageLabel(clean) ?? "Not found in lease", riskUsd: fee(clean) },
    keyReturn: { clause: pageLabel(keys) ?? "Not found in lease", riskUsd: fee(keys) },
    ...(carpet ? { carpetCleaning: { clause: pageLabel(carpet)!, riskUsd: fee(carpet) } } : {}),
    ...(wall ? { wallRepair: { clause: pageLabel(wall)!, riskUsd: fee(wall) } } : {}),
  };
  const leaseSources = new Set(
    [notice, carpet, wall, clean, keys].map(pageLabel).filter((s): s is string => !!s),
  );
  return { rules, noticeResolved: !!notice, leaseSources };
}

// Sources in the website plan that are general California/SF information,
// not terms from this renter's lease. Shown with a "verify" label.
export function sourceKind(source: string, leaseSources: Set<string>): "lease" | "general_info" | "plan" {
  if (leaseSources.has(source)) return "lease";
  if (/Civil Code|Vehicle Code|SFMTA|Building rules/i.test(source)) return "general_info";
  return "plan";
}
