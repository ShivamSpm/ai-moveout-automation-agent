// Pure scoring: the judge proposes item pairs, code turns them into metrics and per-model summaries.
import type { CostSource, InventoryResult } from "@/contracts/inventory";
import type { VisionUsage } from "@/server/integrations/openrouter";

export interface MatchPair {
  gt: number;
  pred: number;
}

export type Salience = "major" | "minor";

export interface CellMetrics {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  majorTotal: number;
  majorMatched: number;
  /** Null when the image has no major-salience items. */
  majorRecall: number | null;
}

/** Reduces the judge's raw pairs to a valid one-to-one matching; the first valid claim on an index
 * wins. The judge is a model, so it can reuse an index or point past the end of a list. */
export function sanitizeMatching(pairs: readonly MatchPair[], gtCount: number, predCount: number): MatchPair[] {
  const usedGt = new Set<number>();
  const usedPred = new Set<number>();
  const kept: MatchPair[] = [];
  for (const { gt, pred } of pairs) {
    const inRange = Number.isInteger(gt) && Number.isInteger(pred) && gt >= 0 && gt < gtCount && pred >= 0 && pred < predCount;
    if (inRange && !usedGt.has(gt) && !usedPred.has(pred)) {
      kept.push({ gt, pred });
      usedGt.add(gt);
      usedPred.add(pred);
    }
  }
  return kept;
}

/** An empty prediction against real items has precision 0 (seeing nothing must not look precise);
 * an empty ground truth makes recall vacuously 1; both empty is a perfect score. */
export function computeMetrics(saliences: readonly Salience[], predCount: number, pairs: readonly MatchPair[]): CellMetrics {
  const matched = sanitizeMatching(pairs, saliences.length, predCount);
  const gtCount = saliences.length;
  const tp = matched.length;
  const precision = predCount === 0 ? (gtCount === 0 ? 1 : 0) : tp / predCount;
  const recall = gtCount === 0 ? 1 : tp / gtCount;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const majorTotal = saliences.filter((s) => s === "major").length;
  const majorMatched = matched.filter((pair) => saliences[pair.gt] === "major").length;
  return {
    tp,
    fp: predCount - tp,
    fn: gtCount - tp,
    precision,
    recall,
    f1,
    majorTotal,
    majorMatched,
    majorRecall: majorTotal === 0 ? null : majorMatched / majorTotal,
  };
}

export type CellStatus = "ok" | "invalid_output" | "error" | "skipped_budget";
export type JudgeStatus = "ok" | "not_needed" | "error" | "skipped_budget" | "not_run";

/** One (model, image) run. Metrics exist for judged "ok" cells and for "invalid_output" cells,
 * which score as an empty prediction because unusable output is the model's failure. */
export interface CellResult {
  model: string;
  image: string;
  status: CellStatus;
  error?: string;
  latencyMs?: number;
  attempts: number;
  usage?: VisionUsage | null;
  costUsd?: number;
  costSource: CostSource;
  itemCount?: number;
  inventory?: InventoryResult;
  judgeStatus: JudgeStatus;
  judgeError?: string;
  judgeCostUsd?: number;
  pairs: MatchPair[];
  metrics?: CellMetrics;
}

export interface ModelSummary {
  model: string;
  cells: number;
  scored: number;
  errors: number;
  skipped: number;
  judgeErrors: number;
  jsonValidityRate: number | null;
  meanPrecision: number | null;
  meanRecall: number | null;
  meanF1: number | null;
  meanMajorRecall: number | null;
  medianLatencyMs: number | null;
  p90LatencyMs: number | null;
  candidateCostUsd: number;
  judgeCostUsd: number;
  meanItems: number | null;
}

/** Nearest-rank percentile; null for an empty sample. */
export function percentile(values: readonly number[], pct: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(1, Math.ceil((pct / 100) * ordered.length)) - 1];
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function summarizeModel(model: string, cells: readonly CellResult[]): ModelSummary {
  const answered = cells.filter((c) => c.status === "ok" || c.status === "invalid_output");
  const valid = answered.filter((c) => c.status === "ok");
  const scored = cells.flatMap((c) => (c.metrics ? [c.metrics] : []));
  const latencies = answered.flatMap((c) => (c.latencyMs === undefined ? [] : [c.latencyMs]));
  return {
    model,
    cells: cells.length,
    scored: scored.length,
    errors: cells.filter((c) => c.status === "error").length,
    skipped: cells.filter((c) => c.status === "skipped_budget").length,
    judgeErrors: cells.filter((c) => c.judgeStatus === "error" || c.judgeStatus === "skipped_budget").length,
    jsonValidityRate: answered.length ? valid.length / answered.length : null,
    meanPrecision: mean(scored.map((m) => m.precision)),
    meanRecall: mean(scored.map((m) => m.recall)),
    meanF1: mean(scored.map((m) => m.f1)),
    meanMajorRecall: mean(scored.flatMap((m) => (m.majorRecall === null ? [] : [m.majorRecall]))),
    medianLatencyMs: percentile(latencies, 50),
    p90LatencyMs: percentile(latencies, 90),
    candidateCostUsd: cells.reduce((sum, c) => sum + (c.costUsd ?? 0), 0),
    judgeCostUsd: cells.reduce((sum, c) => sum + (c.judgeCostUsd ?? 0), 0),
    meanItems: mean(valid.flatMap((c) => (c.itemCount === undefined ? [] : [c.itemCount]))),
  };
}

/** Major-item recall first (a missed sofa is worse than a missed mug), then F1; unscored last. */
export function rankModels(summaries: readonly ModelSummary[]): ModelSummary[] {
  const score = (value: number | null) => value ?? -1;
  return [...summaries].sort(
    (a, b) => score(b.meanMajorRecall) - score(a.meanMajorRecall) || score(b.meanF1) - score(a.meanF1),
  );
}
