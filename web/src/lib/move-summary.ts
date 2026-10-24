import { daysBetween } from "./schedule";
import type { MoveView } from "@/server/move-view";

export function todayInTimezone(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function daysUntil(date: string, today: string) {
  return daysBetween(new Date(`${today}T00:00:00Z`), new Date(`${date}T00:00:00Z`));
}
export function leaseFees(findings: MoveView["findings"]) {
  return findings.reduce((total, finding) => {
    const value = finding.value;
    const amount = value && typeof value === "object" && "feeUsd" in value ? value.feeUsd : null;
    return total + (finding.confidence !== "unresolved" && typeof amount === "number" && Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}
export function renterContext(view: MoveView) {
  const today = todayInTimezone(view.move?.timezone ?? "America/Los_Angeles");
  // Explicit allowlist: private address, contact details, tokens, raw reports excluded.
  const data = {
    today, moveOutDate: view.move?.move_out_date, daysLeft: view.move?.move_out_date ? daysUntil(view.move.move_out_date, today) : null,
    tasks: view.tasks.filter(t => t.status === "todo").slice(0, 30).map(t => ({ title: t.title.slice(0, 200), due: t.due_date, source: t.source?.slice(0, 300), page: t.page })),
    findings: view.findings.slice(0, 20).map(f => ({ rule: f.rule.slice(0, 100), page: f.page, confidence: f.confidence, quote: f.quote?.slice(0, 400) })),
    approvals: view.approvals.slice(0, 10).map(a => ({ id: a.id, title: a.title.slice(0, 200), kind: a.kind, reviewLink: a.kind === "landlord_call" ? "/calls" : `/muse#action-${a.id}` })), inventoryCount: view.items.length, listingCount: view.listings.length,
    activity: view.activity.slice(0, 5).map(a => ({ at: a.at, kind: a.kind, verified: a.verified })),
    links: { documents: "/account/documents", checklist: "/plan", propertyManager: "/calls", move: "/move", listings: "/muse" },
  };
  // Keep the bounded context valid JSON instead of cutting a quote/object in half.
  while (JSON.stringify(data).length > 18000) {
    if (data.tasks.length) data.tasks.pop();
    else if (data.findings.length) data.findings.pop();
    else break;
  }
  return JSON.stringify(data);
}
