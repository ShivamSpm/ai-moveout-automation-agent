// Vision benchmark CLI. Dry run (no key, no chat calls; fetches the public /models price list):
//   npx tsx scripts/vision-eval/run.ts --dry-run --samples-dir ../samples
// Real run (paid; the OpenRouter client is "server-only", hence the react-server condition):
//   npx tsx --conditions=react-server --env-file=.env.local scripts/vision-eval/run.ts \
//     --samples-dir ../samples --models anthropic/claude-sonnet-5.5 --budget-usd 0.5
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { ReasoningEffort } from "@/server/integrations/openrouter";
import {
  CHARS_PER_TOKEN,
  IMAGE_TOKEN_ALLOWANCE,
  SpendLedger,
  callCostExpected,
  callCostUpperBound,
  fetchPricingTable,
  pricingFor,
  type PricedModel,
} from "@/server/integrations/spend-ledger";
import {
  DEFAULT_REASONING_EFFORT,
  DEFAULT_VISION_MAX_TOKENS,
  buildInventoryRequest,
  inventoryCallExpected,
  inventoryCallUpperBound,
  unsupportedReason,
} from "@/server/tools/inventory-prompt";
import { GroundTruthError, loadGroundTruth, type GroundTruth, type GroundTruthImage } from "./ground-truth";
import { DEFAULT_JUDGE_MODEL, judgePromptChars } from "./judge";
import { rankModels, summarizeModel, type CellResult } from "./metrics";
import { MIME_BY_EXTENSION, renderHtml, renderMarkdown, type RunInfo } from "./report";

// qwen and kimi are left out: in the Python benchmark they spent max_tokens on reasoning.
export const DEFAULT_MODELS = [
  "anthropic/claude-haiku-5.5",
  "anthropic/claude-sonnet-5.5",
  "openai/gpt-6-luna",
  "openai/gpt-6.1-sol",
  "google/gemini-3.8-flash",
  "google/gemini-4-argon",
  "z-ai/glm-5.3-flash",
  "x-ai/grok-4.7",
];
const REASONING_EFFORTS: readonly ReasoningEffort[] = ["default", "none", "low", "medium", "high"];
const DEFAULT_JUDGE_MAX_TOKENS = 1500;
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

class UsageError extends Error {}

const print = (line = "") => process.stdout.write(`${line}\n`);
const warn = (line: string) => process.stderr.write(`${line}\n`);

const HELP = `Usage: npx tsx scripts/vision-eval/run.ts --samples-dir <dir> [options]

  --samples-dir <dir>       folder with images/ and ground_truth.json (required)
  --models <a,b>            model ids (default: ${DEFAULT_MODELS.join(", ")})
  --images <a.jpg,b.jpg>    file names under <samples-dir>/images (default: all labelled)
  --judge <id>              judge model (default ${DEFAULT_JUDGE_MODEL})
  --budget-usd <n>          hard spend cap in USD; required for a real run
  --allow-partial           run within the budget even if the worst case exceeds it
  --max-tokens <n>          candidate output cap, reasoning included (default ${DEFAULT_VISION_MAX_TOKENS})
  --judge-max-tokens <n>    judge output cap (default ${DEFAULT_JUDGE_MAX_TOKENS})
  --reasoning-effort <e>    ${REASONING_EFFORTS.join(" | ")} (default ${DEFAULT_REASONING_EFFORT})
  --concurrency <n>         parallel cells, 1-32 (default 4)
  --timeout <seconds>       per-request timeout (default 180)
  --dry-run                 print the plan and cost estimate; no chat calls, no key needed
  --out <dir>               results root (default ./vision-eval-results)

Real runs need the API key and the react-server condition:
  npx tsx --conditions=react-server --env-file=.env.local scripts/vision-eval/run.ts ...`;

export interface Options {
  samplesDir: string;
  models: string[];
  images: string[] | null;
  judge: string;
  budgetUsd: number | null;
  allowPartial: boolean;
  maxTokens: number;
  judgeMaxTokens: number;
  reasoningEffort: ReasoningEffort;
  concurrency: number;
  timeoutS: number;
  dryRun: boolean;
  out: string;
}

const csv = (value: string) => value.split(",").map((part) => part.trim()).filter(Boolean);

function int(name: string, raw: string | undefined, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new UsageError(`--${name} must be an integer between ${min} and ${max}`);
  return value;
}

export function parseOptions(argv: string[]): Options | "help" {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        "samples-dir": { type: "string" },
        models: { type: "string" },
        images: { type: "string" },
        judge: { type: "string" },
        "budget-usd": { type: "string" },
        "allow-partial": { type: "boolean" },
        "max-tokens": { type: "string" },
        "judge-max-tokens": { type: "string" },
        "reasoning-effort": { type: "string" },
        concurrency: { type: "string" },
        timeout: { type: "string" },
        "dry-run": { type: "boolean" },
        out: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  if (values.help) return "help";
  if (!values["samples-dir"]) throw new UsageError("--samples-dir is required");
  const effort = (values["reasoning-effort"] ?? DEFAULT_REASONING_EFFORT) as ReasoningEffort;
  if (!REASONING_EFFORTS.includes(effort)) throw new UsageError(`--reasoning-effort must be one of ${REASONING_EFFORTS.join(", ")}`);
  let budgetUsd: number | null = null;
  if (values["budget-usd"] !== undefined) {
    budgetUsd = Number(values["budget-usd"]);
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new UsageError("--budget-usd must be a number > 0");
  }
  const dryRun = Boolean(values["dry-run"]);
  if (!dryRun && budgetUsd === null) throw new UsageError("--budget-usd is required for a real run (use --dry-run to see the estimate first)");
  const timeoutS = Number(values.timeout ?? 180);
  if (!Number.isFinite(timeoutS) || timeoutS <= 0) throw new UsageError("--timeout must be a number of seconds > 0");
  const models = values.models ? csv(values.models) : [...DEFAULT_MODELS];
  if (models.length === 0) throw new UsageError("--models is empty");
  return {
    samplesDir: path.resolve(values["samples-dir"]),
    models: [...new Set(models)],
    images: values.images ? [...new Set(csv(values.images))] : null,
    judge: values.judge ?? DEFAULT_JUDGE_MODEL,
    budgetUsd,
    allowPartial: Boolean(values["allow-partial"]),
    maxTokens: int("max-tokens", values["max-tokens"], DEFAULT_VISION_MAX_TOKENS, 256),
    judgeMaxTokens: int("judge-max-tokens", values["judge-max-tokens"], DEFAULT_JUDGE_MAX_TOKENS, 256),
    reasoningEffort: effort,
    concurrency: int("concurrency", values.concurrency, 4, 1, 32),
    timeoutS,
    dryRun,
    out: path.resolve(values.out ?? "vision-eval-results"),
  };
}

export function selectImages(truth: GroundTruth, imagesDir: string, requested: string[] | null): GroundTruthImage[] {
  const onDisk = existsSync(imagesDir)
    ? readdirSync(imagesDir).filter((name) => MIME_BY_EXTENSION[path.extname(name).toLowerCase()]).sort()
    : [];
  const labelled = new Map(truth.images.map((image) => [image.file, image]));
  const names = requested ?? onDisk.filter((name) => labelled.has(name));
  const missingFile = names.filter((name) => !onDisk.includes(name));
  const missingTruth = names.filter((name) => !labelled.has(name));
  if (missingFile.length || missingTruth.length) {
    throw new UsageError(
      `Images not on disk in ${imagesDir}: ${missingFile.join(", ") || "-"}; without ground truth: ${missingTruth.join(", ") || "-"}`,
    );
  }
  const unlabelled = onDisk.filter((name) => !labelled.has(name));
  if (unlabelled.length && requested === null) warn(`warning: skipping images without ground truth: ${unlabelled.join(", ")}`);
  return names.map((name) => labelled.get(name)!);
}

export function checkModels(table: ReadonlyMap<string, PricedModel>, models: string[], judge: string): Map<string, PricedModel> {
  const problems: string[] = [];
  const chosen = new Map<string, PricedModel>();
  for (const id of [...models, judge]) {
    try {
      const priced = pricingFor(table, id);
      const reason =
        id === judge && !models.includes(id)
          ? priced.supportedParameters.includes("structured_outputs") ? null : `${id} does not support structured outputs`
          : unsupportedReason(priced);
      if (reason) problems.push(reason);
      chosen.set(id, priced);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (problems.length) throw new UsageError(problems.join("\n"));
  return chosen;
}

export interface CostPlan {
  worstUsd: number;
  expectedUsd: number;
  perModel: Map<string, { worst: number; expected: number }>;
}

export function planCosts(pricing: ReadonlyMap<string, PricedModel>, images: GroundTruthImage[], o: Options): CostPlan {
  const judge = pricing.get(o.judge)!.pricing;
  const perModel = new Map<string, { worst: number; expected: number }>();
  for (const model of o.models) {
    const p = pricing.get(model)!.pricing;
    let worst = 0;
    let expected = 0;
    for (const gt of images) {
      const judgeChars = judgePromptChars(gt.items.map((item) => item.name), []) + o.maxTokens * CHARS_PER_TOKEN;
      worst += inventoryCallUpperBound(p, o.maxTokens) + callCostUpperBound(judge, judgeChars, 0, o.judgeMaxTokens);
      expected += inventoryCallExpected(p, o.maxTokens) + callCostExpected(judge, judgeChars, 0, o.judgeMaxTokens);
    }
    perModel.set(model, { worst, expected });
  }
  const sum = (pick: (v: { worst: number; expected: number }) => number) => [...perModel.values()].reduce((a, v) => a + pick(v), 0);
  return { worstUsd: sum((v) => v.worst), expectedUsd: sum((v) => v.expected), perModel };
}

function printPlan(plan: CostPlan, o: Options, images: GroundTruthImage[]): void {
  print();
  print(
    `Cost pre-flight (${o.models.length} models x ${images.length} images, judge ${o.judge}; max_tokens ${o.maxTokens}/${o.judgeMaxTokens}; ` +
      `input = prompt chars/4 + ${IMAGE_TOKEN_ALLOWANCE} tokens per image)`,
  );
  print(`  ${"model".padEnd(34)} ${"worst case".padStart(12)} ${"expected".padStart(12)}`);
  for (const [model, cost] of plan.perModel) {
    print(`  ${model.padEnd(34)} ${cost.worst.toFixed(4).padStart(12)} ${cost.expected.toFixed(4).padStart(12)}`);
  }
  print(`  ${"TOTAL (USD, judge included)".padEnd(34)} ${plan.worstUsd.toFixed(4).padStart(12)} ${plan.expectedUsd.toFixed(4).padStart(12)}`);
  if (o.budgetUsd !== null) {
    print(`  budget $${o.budgetUsd.toFixed(2)}: worst case ${plan.worstUsd <= o.budgetUsd ? "fits" : "EXCEEDS"} the budget`);
  }
}

function dryRun(o: Options, images: GroundTruthImage[], plan: CostPlan, baseUrl: string): number {
  const cells = o.models.length * images.length;
  print(`Dry run: ${o.models.length} models x ${images.length} images = ${cells} recognition calls + up to ${cells} judge calls (${o.judge}); concurrency ${o.concurrency}`);
  for (const gt of images) print(`  ${gt.file.padEnd(24)} ${gt.room.padEnd(14)} ${gt.difficulty.padEnd(7)} ${String(gt.items.length).padStart(3)} items`);
  print(`Models: ${o.models.join(", ")}`);
  const sample = buildInventoryRequest(o.models[0], "data:image/jpeg;base64,<photo>", o.maxTokens, o.reasoningEffort);
  const summary = {
    model: sample.model,
    max_tokens: sample.maxTokens,
    reasoning_effort: sample.reasoningEffort,
    response_format: sample.responseFormat.json_schema.name,
    messages: sample.messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? `${m.content.slice(0, 80)}...` : m.content,
    })),
  };
  print(`Sample request (POST ${baseUrl}/chat/completions; not sent):`);
  print(JSON.stringify(summary, null, 2));
  printPlan(plan, o, images);
  return 0;
}

async function pool<T, R>(items: T[], concurrency: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadRunner() {
  try {
    return await import("./runner");
  } catch (error) {
    if (error instanceof Error && /Client Component/.test(error.message)) {
      throw new UsageError("Real runs load the server-only OpenRouter client; rerun with: npx tsx --conditions=react-server ...");
    }
    throw error;
  }
}

async function realRun(o: Options, images: GroundTruthImage[], plan: CostPlan, pricing: Map<string, PricedModel>): Promise<number> {
  const { CellRunner, readOpenRouterConfig } = await loadRunner();
  const openRouter = readOpenRouterConfig(process.env, { timeoutMs: o.timeoutS * 1000 });
  const budget = o.budgetUsd!;
  printPlan(plan, o, images);
  if (plan.worstUsd > budget && !o.allowPartial) {
    warn(
      `\nAborting: worst case $${plan.worstUsd.toFixed(4)} > budget $${budget.toFixed(2)}. Raise the budget, ` +
        "narrow --models/--images, lower --max-tokens, or pass --allow-partial.",
    );
    return 2;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(o.out, timestamp);
  const ledger = new SpendLedger(budget);
  const runner = new CellRunner(
    { openRouter, judgeModel: o.judge, candidateMaxTokens: o.maxTokens, judgeMaxTokens: o.judgeMaxTokens, reasoningEffort: o.reasoningEffort },
    pricing,
    ledger,
    path.join(outDir, "raw"),
    path.join(o.samplesDir, "images"),
  );
  // Image-major order: if the budget stops the run early, the finished images cover every model.
  const jobs = images.flatMap((gt) => o.models.map((model) => ({ model, gt })));
  const cells: CellResult[] = await pool(jobs, o.concurrency, async ({ model, gt }, index) => {
    const cell = await runner.run(model, gt);
    print(`[${index + 1}/${jobs.length}] ${model} ${gt.file}: ${cell.status}/${cell.judgeStatus} ${(cell.error ?? cell.judgeError ?? "").slice(0, 120)}`);
    return cell;
  });
  const snapshot = ledger.snapshot();
  const ranked = rankModels(o.models.map((m) => summarizeModel(m, cells.filter((c) => c.model === m))));
  const info: RunInfo = {
    timestamp,
    judgeModel: o.judge,
    candidateMaxTokens: o.maxTokens,
    judgeMaxTokens: o.judgeMaxTokens,
    reasoningEffort: o.reasoningEffort,
    worstCaseUsd: plan.worstUsd,
    expectedUsd: plan.expectedUsd,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "spend.json"), JSON.stringify(snapshot, null, 2));
  writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(ranked, null, 2));
  writeFileSync(path.join(outDir, "report.md"), renderMarkdown(info, ranked, cells, images, snapshot));
  writeFileSync(path.join(outDir, "report.html"), renderHtml(info, ranked, cells, images, snapshot, path.join(o.samplesDir, "images")));
  if (snapshot.overshootUsd > 0) {
    warn(`\nOVERSHOOT: calls cost $${snapshot.overshootUsd.toFixed(4)} more than their reserved worst case; no cells were dispatched after the first.`);
  }
  print(`\nBudget $${snapshot.capUsd.toFixed(2)} | spent $${snapshot.spentUsd.toFixed(4)} | remaining $${snapshot.remainingUsd.toFixed(4)}`);
  print(`Report: ${path.join(outDir, "report.md")}\n        ${path.join(outDir, "report.html")}`);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  try {
    const o = parseOptions(argv);
    if (o === "help") {
      print(HELP);
      return 0;
    }
    if (!o.dryRun && !process.env.OPENROUTER_API_KEY?.trim()) {
      throw new UsageError("OPENROUTER_API_KEY is not set; pass --env-file=.env.local to tsx or export it");
    }
    const images = selectImages(loadGroundTruth(path.join(o.samplesDir, "ground_truth.json")), path.join(o.samplesDir, "images"), o.images);
    if (images.length === 0) {
      print(`No labelled images found in ${path.join(o.samplesDir, "images")}; nothing to run.`);
      return 0;
    }
    const baseUrl = (process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
    const pricing = checkModels(await fetchPricingTable({ baseUrl }), o.models, o.judge);
    const plan = planCosts(pricing, images, o);
    return o.dryRun ? dryRun(o, images, plan, baseUrl) : await realRun(o, images, plan, pricing);
  } catch (error) {
    if (error instanceof UsageError || error instanceof GroundTruthError) {
      warn(`error: ${error.message}`);
      return 2;
    }
    throw error;
  }
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
