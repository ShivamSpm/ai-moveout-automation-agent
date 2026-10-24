// Real-run execution of one (model, image) cell: recognition, then judging. Imports the
// "server-only" OpenRouter client, so run.ts loads it lazily and only for real runs.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  completeVision,
  imageDataUrl,
  readOpenRouterConfig,
  type OpenRouterConfig,
  type ReasoningEffort,
  type VisionFailure,
  type VisionRequest,
  type VisionUsage,
} from "@/server/integrations/openrouter";
import { actualCost, callCostUpperBound, type PricedModel, type SpendLedger } from "@/server/integrations/spend-ledger";
import { photoProblem } from "@/server/tools/identify-items";
import { buildInventoryRequest, inventoryCallUpperBound, parseInventoryOutput } from "@/server/tools/inventory-prompt";
import type { GroundTruthImage } from "./ground-truth";
import { buildJudgeRequest, judgePromptChars, parseJudgeOutput, predictedLabel } from "./judge";
import { computeMetrics, sanitizeMatching, type CellResult } from "./metrics";
import { MIME_BY_EXTENSION } from "./report";

export { readOpenRouterConfig };

export interface RunSettings {
  openRouter: OpenRouterConfig;
  judgeModel: string;
  candidateMaxTokens: number;
  judgeMaxTokens: number;
  reasoningEffort: ReasoningEffort;
}

export function modelSlug(model: string): string {
  return model.replace(/[^A-Za-z0-9._-]+/g, "__");
}

/** Copy of a request with data URLs shortened, for logs and dry-run output. */
export function elideImages<T>(node: T): T {
  if (Array.isArray(node)) return node.map(elideImages) as T;
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [
        k,
        k === "url" && typeof v === "string" && v.startsWith("data:") ? `${v.slice(0, 40)}...<${v.length} chars>` : elideImages(v),
      ]),
    ) as T;
  }
  return node;
}

function writeJson(file: string, payload: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(payload, null, 2));
}

function baseCell(model: string, image: string): CellResult {
  return { model, image, status: "ok", attempts: 0, costSource: "none", judgeStatus: "not_run", pairs: [] };
}

const OVERSHOOT_STOP = "stopped: an earlier call cost more than its reserved worst case (overshoot)";

export class CellRunner {
  private exhausted = false;

  constructor(
    private readonly settings: RunSettings,
    private readonly pricing: ReadonlyMap<string, PricedModel>,
    private readonly ledger: SpendLedger,
    private readonly rawDir: string,
    private readonly imagesDir: string,
  ) {}

  /** True once any settled call cost more than its reservation; no new cells are dispatched after that. */
  get overshot(): boolean {
    return this.ledger.snapshot().maxOvershootUsd > 0;
  }

  /** Never rejects: an unexpected failure becomes an error cell, charged at its worst case, so the
   * rest of the matrix still runs. */
  async run(model: string, gt: GroundTruthImage): Promise<CellResult> {
    const key = `${model}|${gt.file}`;
    try {
      return await this.runCell(model, gt, key);
    } catch (error) {
      const charged = this.ledger.settleOpenAtReserved([`${key}|candidate`, `${key}|judge`]);
      return {
        ...baseCell(model, gt.file),
        status: "error",
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        costUsd: charged || undefined,
        costSource: charged ? "worst_case" : "none",
      };
    }
  }

  private judgeBound(gt: GroundTruthImage, labels: string[] | null): number {
    const names = gt.items.map((item) => item.name);
    // Before the candidate answers, its item labels are bounded by its own output cap.
    const chars = labels ? judgePromptChars(names, labels) : judgePromptChars(names, []) + this.settings.candidateMaxTokens * 4;
    return callCostUpperBound(this.pricing.get(this.settings.judgeModel)!.pricing, chars, 0, this.settings.judgeMaxTokens);
  }

  private settleSuccess(key: string, usage: VisionUsage | null, priced: PricedModel, images: number, bound: number) {
    // A success with no usage block was billed without saying how much.
    const cost = usage === null ? { usd: bound, source: "worst_case" as const } : actualCost(usage, priced.pricing, images);
    this.ledger.settle(key, cost.usd, cost.source);
    return cost;
  }

  private settleFailure(key: string, failure: VisionFailure, priced: PricedModel, images: number, bound: number) {
    const cost = failure.billingUnknown ? { usd: bound, source: "worst_case" as const } : actualCost(failure.usage, priced.pricing, images);
    this.ledger.settle(key, cost.usd, cost.source);
    return cost;
  }

  private async runCell(model: string, gt: GroundTruthImage, key: string): Promise<CellResult> {
    const s = this.settings;
    const priced = this.pricing.get(model)!;
    const candKey = `${key}|candidate`;
    const judgeKey = `${key}|judge`;
    const candBound = inventoryCallUpperBound(priced.pricing, s.candidateMaxTokens);
    if (this.overshot) {
      return { ...baseCell(model, gt.file), status: "skipped_budget", judgeStatus: "skipped_budget", error: OVERSHOOT_STOP };
    }
    // Reserve the judge's worst case together with the candidate's, so no cell is paid for and left unjudged.
    if (this.exhausted || !(await this.ledger.reserveManyWhenAvailable({ [candKey]: candBound, [judgeKey]: this.judgeBound(gt, null) }))) {
      this.exhausted = true;
      return { ...baseCell(model, gt.file), status: "skipped_budget", judgeStatus: "skipped_budget" };
    }

    const file = path.join(this.imagesDir, gt.file);
    const bytes = new Uint8Array(readFileSync(file));
    const mime = MIME_BY_EXTENSION[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    const problem = photoProblem(bytes, mime);
    if (problem) {
      this.ledger.release(candKey);
      this.ledger.release(judgeKey);
      return { ...baseCell(model, gt.file), status: "error", error: problem };
    }

    const request = buildInventoryRequest(model, imageDataUrl(bytes, mime), s.candidateMaxTokens, s.reasoningEffort);
    const rawPath = path.join(this.rawDir, modelSlug(model), `${gt.file}.json`);
    const reply = await completeVision(request, s.openRouter);
    if (!reply.ok) {
      const cost = this.settleFailure(candKey, reply, priced, 1, candBound);
      this.ledger.release(judgeKey);
      writeJson(rawPath, { request: elideImages(request), failure: reply, costUsd: cost.usd });
      return {
        ...baseCell(model, gt.file),
        status: reply.kind === "truncated" ? "invalid_output" : "error",
        error: `${reply.kind}: ${reply.message}`,
        attempts: reply.attempts,
        usage: reply.usage,
        costUsd: cost.usd,
        costSource: cost.source,
        ...(reply.kind === "truncated" ? { itemCount: 0, judgeStatus: "not_needed" as const, metrics: computeMetrics(gt.items.map((i) => i.salience), 0, []) } : {}),
      };
    }

    const cost = this.settleSuccess(candKey, reply.usage, priced, 1, candBound);
    const parsed = parseInventoryOutput(reply.content);
    writeJson(rawPath, { request: elideImages(request), reply, costUsd: cost.usd, costSource: cost.source, parse: parsed.ok ? "ok" : `${parsed.kind}: ${parsed.detail}` });
    const base: CellResult = {
      ...baseCell(model, gt.file),
      latencyMs: reply.latencyMs,
      attempts: reply.attempts,
      usage: reply.usage,
      costUsd: cost.usd,
      costSource: cost.source,
    };
    const saliences = gt.items.map((item) => item.salience);
    if (!parsed.ok) {
      this.ledger.release(judgeKey);
      return { ...base, status: "invalid_output", error: `${parsed.kind}: ${parsed.detail}`, itemCount: 0, judgeStatus: "not_needed", metrics: computeMetrics(saliences, 0, []) };
    }

    const items = parsed.value.items;
    const withInventory: CellResult = { ...base, inventory: parsed.value, itemCount: items.length };
    if (items.length === 0 || gt.items.length === 0) {
      this.ledger.release(judgeKey);
      return { ...withInventory, judgeStatus: "not_needed", metrics: computeMetrics(saliences, items.length, []) };
    }
    return this.judge(judgeKey, gt, items.map(predictedLabel), withInventory);
  }

  private async judge(judgeKey: string, gt: GroundTruthImage, labels: string[], cell: CellResult): Promise<CellResult> {
    const s = this.settings;
    const judgePriced = this.pricing.get(s.judgeModel)!;
    const bound = this.judgeBound(gt, labels);
    if (!this.ledger.resize(judgeKey, bound)) {
      this.ledger.release(judgeKey);
      return { ...cell, judgeStatus: "skipped_budget", judgeError: "judge call does not fit the budget" };
    }
    const request: VisionRequest = buildJudgeRequest(s.judgeModel, gt.items.map((i) => i.name), labels, s.judgeMaxTokens, s.reasoningEffort);
    const rawPath = path.join(this.rawDir, modelSlug(cell.model), `${gt.file}.judge.json`);
    const verdict = await completeVision(request, s.openRouter);
    if (!verdict.ok) {
      const cost = this.settleFailure(judgeKey, verdict, judgePriced, 0, bound);
      writeJson(rawPath, { request, failure: verdict, costUsd: cost.usd });
      return { ...cell, judgeStatus: "error", judgeError: `${verdict.kind}: ${verdict.message}`, judgeCostUsd: cost.usd };
    }
    const cost = this.settleSuccess(judgeKey, verdict.usage, judgePriced, 0, bound);
    writeJson(rawPath, { request, verdict, costUsd: cost.usd, costSource: cost.source });
    const parsed = parseJudgeOutput(verdict.content);
    if (!parsed.ok) return { ...cell, judgeStatus: "error", judgeError: `judge returned unusable output: ${parsed.detail}`, judgeCostUsd: cost.usd };
    return {
      ...cell,
      judgeStatus: "ok",
      judgeCostUsd: cost.usd,
      // Sanitized so the report never colors an item by a reused or out-of-range judge index.
      pairs: sanitizeMatching(parsed.pairs, gt.items.length, cell.itemCount ?? 0),
      metrics: computeMetrics(gt.items.map((i) => i.salience), cell.itemCount ?? 0, parsed.pairs),
    };
  }
}
