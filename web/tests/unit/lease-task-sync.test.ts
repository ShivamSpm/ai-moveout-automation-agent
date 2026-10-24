import { describe, expect, it } from "vitest";
import { reconcileLeaseTasks, type SavedLeaseTask } from "@/server/domain/lease-task-sync";
import { leasePlan } from "@/server/domain/lease-pipeline";
const task = (key: string, status = "todo"): SavedLeaseTask => ({ task_key: key, status, title: key, lane: "cleaning", detail: null, source: "Lease p.3", due_date: "2026-12-01" });
describe("Lease task reconciliation", () => {
  it("preserves done and skipped progress while updating the proposed deadline", () => {
    const desired = reconcileLeaseTasks([task("carpet", "done"), task("walls", "skipped")], [{ ...task("carpet"), due_date: "2026-12-15" }, task("walls")]);
    expect(desired.map(t => t.status)).toEqual(["done", "skipped"]); expect(desired[0].due_date).toBe("2026-12-15");
  });
  it("removes vanished unfinished and skipped tasks but keeps completed history", () => {
    expect(reconcileLeaseTasks([task("done", "done"), task("skip", "skipped"), task("todo")], [])).toEqual([task("done", "done")]);
  });
  it("deduplicates keys and is stable on repeated reads", () => {
    const result = reconcileLeaseTasks([], [task("carpet"), task("carpet")]);
    expect(result).toHaveLength(1); expect(reconcileLeaseTasks(result, [task("carpet")])).toEqual(result);
  });
  it("never guesses a notice period or move-out date for unresolved findings", () => {
    expect(leasePlan("2026-12-31", [{ rule_key: "notice_days", confidence: "unresolved", value: null, page: null }])).toEqual([]);
    expect(leasePlan(null, [{ rule_key: "notice_days", confidence: "medium", value: { days: 60 }, page: 2 }])).toEqual([]);
  });
});
