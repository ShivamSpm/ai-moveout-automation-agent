import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { LedgerSnapshot } from "@/server/integrations/spend-ledger";
import type { GroundTruthImage } from "./ground-truth";
import type { CellResult, ModelSummary } from "./metrics";

export interface RunInfo {
  timestamp: string;
  judgeModel: string;
  candidateMaxTokens: number;
  judgeMaxTokens: number;
  reasoningEffort: string;
  worstCaseUsd: number;
  expectedUsd: number;
}

export const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(0)}%`);
const secs = (ms: number | null | undefined) => (ms === null || ms === undefined ? "n/a" : `${(ms / 1000).toFixed(1)}s`);
const usd = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : `$${v.toFixed(4)}`);

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function budgetLines(ledger: LedgerSnapshot, info: RunInfo): string[] {
  return [
    `Budget: $${ledger.capUsd.toFixed(2)} | spent: $${ledger.spentUsd.toFixed(4)} | remaining: $${ledger.remainingUsd.toFixed(4)}`,
    `Pre-flight: worst case $${info.worstCaseUsd.toFixed(4)}, expected $${info.expectedUsd.toFixed(4)}`,
    ...(ledger.overshootUsd > 0
      ? [`OVERSHOOT: calls cost $${ledger.overshootUsd.toFixed(4)} more than their reserved worst case; dispatch stopped after the first one`]
      : []),
  ];
}

function leaderboardRow(rank: number, s: ModelSummary): string {
  return (
    `| ${rank} | \`${s.model}\` | ${pct(s.meanMajorRecall)} | ${pct(s.meanF1)} | ${pct(s.meanPrecision)} | ${pct(s.meanRecall)} ` +
    `| ${pct(s.jsonValidityRate)} | ${secs(s.medianLatencyMs)} | ${secs(s.p90LatencyMs)} | ${usd(s.candidateCostUsd)} ` +
    `| ${s.meanItems === null ? "n/a" : s.meanItems.toFixed(1)} | ${s.scored}/${s.cells} | ${s.errors} | ${s.skipped} |`
  );
}

function cellRow(cell: CellResult): string {
  const m = cell.metrics;
  const status = ["ok", "not_needed", "not_run"].includes(cell.judgeStatus) ? cell.status : `${cell.status}, judge ${cell.judgeStatus}`;
  const note = (cell.error ?? cell.judgeError ?? "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 160);
  const scores = m
    ? `${m.tp}/${m.fp}/${m.fn} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} | ${pct(m.majorRecall)}`
    : "- | - | - | - | -";
  return `| \`${cell.model}\` | ${status} | ${cell.itemCount ?? "-"} | ${scores} | ${secs(cell.latencyMs)} | ${usd(cell.costUsd)} | ${note} |`;
}

export function renderMarkdown(
  info: RunInfo,
  ranked: readonly ModelSummary[],
  cells: readonly CellResult[],
  images: readonly GroundTruthImage[],
  ledger: LedgerSnapshot,
): string {
  const judgeCost = ranked.reduce((sum, s) => sum + s.judgeCostUsd, 0);
  const lines = [
    `# Vision benchmark ${info.timestamp}`,
    "",
    `- Models: ${ranked.length} | images: ${images.length} | judge: \`${info.judgeModel}\``,
    `- max_tokens: ${info.candidateMaxTokens} (candidates), ${info.judgeMaxTokens} (judge) | reasoning effort: ${info.reasoningEffort}`,
    ...budgetLines(ledger, info).map((line) => `- ${line}`),
    `- Judge cost: $${judgeCost.toFixed(4)}`,
    "",
    "## Leaderboard",
    "",
    "Sorted by major-item recall, then F1. Major recall is averaged only over images that have major items. " +
      "Invalid JSON scores as an empty prediction; transport errors and budget skips are excluded from quality means.",
    "",
    "| # | Model | Major recall | F1 | Precision | Recall | JSON valid | Median latency | p90 latency | Cost (model) | Items/image | Scored | Errors | Skipped |",
    "|" + "---|".repeat(14),
    ...ranked.map((s, i) => leaderboardRow(i + 1, s)),
    "",
    "## Per image",
  ];
  for (const gt of images) {
    const majors = gt.items.filter((item) => item.salience === "major").length;
    lines.push(
      "",
      `### ${gt.file} (${gt.room}, ${gt.difficulty}; ${gt.items.length} ground-truth items, ${majors} major)`,
      "",
      "| Model | Status | Items | TP/FP/FN | Precision | Recall | F1 | Major recall | Latency | Cost | Note |",
      "|" + "---|".repeat(11),
      ...cells.filter((c) => c.image === gt.file).map(cellRow),
    );
  }
  return lines.join("\n") + "\n";
}

const CSS = `
:root { --bg:#fff; --fg:#1d2329; --muted:#5f6b76; --line:#d9dee3; --hit:#e3f4e6; --hit-fg:#1d6b33;
        --miss:#fff1d6; --miss-fg:#8a5a00; --fake:#fde4e4; --fake-fg:#a12828; --card:#f7f8fa; }
@media (prefers-color-scheme: dark) { :root { --bg:#14181c; --fg:#e4e8ec; --muted:#9aa5b0; --line:#2c343c;
        --hit:#173823; --hit-fg:#8fdca6; --miss:#3a2e12; --miss-fg:#f0c66b; --fake:#3d1b1b; --fake-fg:#f4a3a3; --card:#1b2026; } }
body { background:var(--bg); color:var(--fg); font:14px/1.45 system-ui, sans-serif; margin:0 auto; max-width:1400px; padding:16px; }
table { border-collapse:collapse; width:100%; margin:8px 0 24px; }
th, td { border-bottom:1px solid var(--line); padding:4px 8px; text-align:left; }
.wrap { overflow-x:auto; }
.image { border-top:2px solid var(--line); padding-top:12px; margin-top:24px; }
.image img { max-width:min(480px, 100%); border-radius:6px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:12px; margin-top:12px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:6px; padding:8px; }
.card h4 { margin:0 0 4px; font-size:13px; } .meta { color:var(--muted); font-size:12px; margin-bottom:6px; }
ul { margin:0; padding-left:0; list-style:none; } li { margin:2px 0; padding:1px 6px; border-radius:4px; }
.hit { background:var(--hit); color:var(--hit-fg); } .fake { background:var(--fake); color:var(--fake-fg); }
.miss { background:var(--miss); color:var(--miss-fg); } .err { color:var(--fake-fg); }
.legend span { margin-right:12px; padding:1px 6px; border-radius:4px; }
`;

function thumbnail(file: string): string {
  if (!existsSync(file)) return "<p class='meta'>image not found</p>";
  const mime = MIME_BY_EXTENSION[path.extname(file).toLowerCase()] ?? "image/jpeg";
  return `<img alt='${escapeHtml(path.basename(file))}' src='data:${mime};base64,${readFileSync(file).toString("base64")}'>`;
}

function card(cell: CellResult, gt: GroundTruthImage): string {
  const e = escapeHtml;
  const m = cell.metrics;
  const meta = (m ? `P ${pct(m.precision)} · R ${pct(m.recall)} · major ${pct(m.majorRecall)} · ` : "") + `${secs(cell.latencyMs)} · ${usd(cell.costUsd)}`;
  const head = `<h4>${e(cell.model)}</h4><div class='meta'>${e(meta)}</div>`;
  if (!cell.inventory || !["ok", "not_needed"].includes(cell.judgeStatus)) {
    const reason = cell.error ?? cell.judgeError ?? cell.status;
    return `<div class='card'>${head}<p class='err'>${e(cell.status)}: ${e(reason.slice(0, 300))}</p></div>`;
  }
  const matchedPred = new Map(cell.pairs.map((pair) => [pair.pred, pair.gt]));
  const matchedGt = new Set(cell.pairs.map((pair) => pair.gt));
  const predicted = cell.inventory.items
    .map((item, i) => {
      const gtIndex = matchedPred.get(i);
      const qty = item.quantity > 1 ? ` ×${item.quantity}` : "";
      const target = gtIndex === undefined ? "" : ` → ${e(gt.items[gtIndex].name)}`;
      return `<li class='${gtIndex === undefined ? "fake" : "hit"}' title='${e(item.category)}'>${e(item.name)}${qty}${target}</li>`;
    })
    .join("");
  const missed = gt.items
    .map((item, j) => (matchedGt.has(j) ? "" : `<li class='miss'>${e(item.name)}${item.salience === "major" ? " (major)" : ""}</li>`))
    .join("");
  return `<div class='card'>${head}<ul>${predicted}${missed}</ul></div>`;
}

function leaderboardHtml(ranked: readonly ModelSummary[]): string {
  const head = ["#", "Model", "Major recall", "F1", "Precision", "Recall", "JSON valid", "Median", "p90", "Cost", "Errors", "Skipped"]
    .map((h) => `<th>${h}</th>`)
    .join("");
  const rows = ranked
    .map(
      (s, i) =>
        `<tr><td>${i + 1}</td><td>${escapeHtml(s.model)}</td><td>${pct(s.meanMajorRecall)}</td><td>${pct(s.meanF1)}</td>` +
        `<td>${pct(s.meanPrecision)}</td><td>${pct(s.meanRecall)}</td><td>${pct(s.jsonValidityRate)}</td>` +
        `<td>${secs(s.medianLatencyMs)}</td><td>${secs(s.p90LatencyMs)}</td><td>${usd(s.candidateCostUsd)}</td>` +
        `<td>${s.errors}</td><td>${s.skipped}</td></tr>`,
    )
    .join("");
  return `<div class='wrap'><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderHtml(
  info: RunInfo,
  ranked: readonly ModelSummary[],
  cells: readonly CellResult[],
  images: readonly GroundTruthImage[],
  ledger: LedgerSnapshot,
  imagesDir: string,
): string {
  const e = escapeHtml;
  const budget = budgetLines(ledger, info).map((line) => `<li>${e(line)}</li>`).join("");
  const sections = images
    .map(
      (gt) =>
        `<section class='image'><h2>${e(gt.file)}</h2><div class='meta'>${e(gt.room)} · ${e(gt.difficulty)} · ` +
        `${gt.items.length} ground-truth items</div>${thumbnail(path.join(imagesDir, gt.file))}` +
        `<div class='grid'>${cells.filter((c) => c.image === gt.file).map((c) => card(c, gt)).join("")}</div></section>`,
    )
    .join("");
  return (
    "<!doctype html><html lang='en'><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
    `<title>Vision benchmark ${e(info.timestamp)}</title><style>${CSS}</style></head><body>` +
    `<h1>Vision benchmark ${e(info.timestamp)}</h1><ul>${budget}<li>Judge: ${e(info.judgeModel)}</li></ul>` +
    `<h2>Leaderboard</h2>${leaderboardHtml(ranked)}` +
    "<p class='legend'><span class='hit'>matched → ground truth</span><span class='fake'>hallucinated / unmatched</span>" +
    "<span class='miss'>missed ground truth</span></p>" +
    `${sections}</body></html>`
  );
}
