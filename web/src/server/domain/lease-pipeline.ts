import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import type { LeaseFinding } from "@/contracts";
import { buildPlan } from "@/lib/schedule";
import type { ToolContext } from "@/server/auth";
import { reconcileLeaseTasks } from "./lease-task-sync";
import { extractLeaseFindings, leaseRulesFrom, type FindingRow } from "./lease";

// Future vision adapters must return citations in this shape. No model is called.
export interface LeaseExtractor {
  extract(pages: string[]): Promise<LeaseFinding[]>;
}
export async function readPdf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  try {
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    return { pages: text, pageCount: totalPages };
  } finally { await pdf.cleanup(); }
}
export function leasePlan(moveOut: string | null, findings: FindingRow[]) {
  if (!moveOut) return [];
  const { rules, leaseSources } = leaseRulesFrom(findings);
  // Only actual lease findings become lease tasks. In particular, do not schedule
  // the reader's fallback 30-day notice or label general California law as a lease.
  return buildPlan(new Date(`${moveOut}T00:00:00Z`), rules)
    .filter(t => leaseSources.has(t.source))
    .map(t => ({ task_key: t.id, lane: t.lane, title: t.title, detail: t.detail,
      due_date: t.due.toISOString().slice(0, 10), source: t.source }));
}
export async function readLease(ctx: ToolContext, documentId: string, parsed?: Awaited<ReturnType<typeof readPdf>>) {
  const { data: doc, error } = await ctx.db.from("documents").select("*")
    .eq("id", documentId).eq("owner_id", ctx.user.id).eq("kind", "lease").single();
  if (error || !doc) throw new Error("Lease not found");
  if (!parsed) {
    const result = await ctx.db.storage.from("move-files").download(doc.storage_path);
    if (result.error) throw result.error;
    parsed = await readPdf(new Uint8Array(await result.data.arrayBuffer()));
  }
  const { data: move, error: moveError } = await ctx.db.from("moves").select("move_out_date").eq("id", doc.move_id).single();
  if (moveError) throw moveError;
  const findings = extractLeaseFindings(parsed.pages).map(f => ({ rule_key: f.ruleKey,
    value: f.value, quote: f.quote, page: f.page, confidence: f.confidence }));
  const existing = await ctx.db.from("tasks").select("task_key,lane,title,detail,due_date,source,status").eq("document_id", doc.id).eq("source_kind", "lease");
  if (existing.error) throw existing.error;
  const { error: saveError } = await ctx.db.rpc("save_lease_result", {
    doc: doc.id, findings, plan: reconcileLeaseTasks(existing.data, leasePlan(move.move_out_date, findings)).map(task => ({ ...task })),
  });
  if (saveError) throw saveError;
  const scanned = parsed.pages.every(p => !p.trim());
  return { documentId, message: scanned ? "We couldn't read text in this PDF" :
    !move.move_out_date ? "Add your move-out date to build the plan" : "Lease read. Review the findings and checklist.", scanned };
}
