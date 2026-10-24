import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SpendLedger, parsePricingTable } from "@/server/integrations/spend-ledger";
import { CellRunner } from "../../scripts/vision-eval/runner";

const MODEL = "anthropic/claude-sonnet-5.5";
const JUDGE = "anthropic/claude-haiku-5.5";
const pricing = parsePricingTable({
  data: [MODEL, JUDGE].map((id) => ({
    id,
    pricing: { prompt: "0.000002", completion: "0.00001" },
    architecture: { input_modalities: ["text", "image"] },
    supported_parameters: ["max_tokens", "structured_outputs"],
  })),
});
const gt = {
  file: "room.jpg",
  room: "living_room",
  difficulty: "easy" as const,
  items: [
    { name: "sofa", category: "furniture" as const, quantity: 1, salience: "major" as const },
    { name: "books", category: "books_media" as const, quantity: 8, salience: "minor" as const },
  ],
};
const item = { category: "furniture", quantity: 1, size_class: "bulky", condition: "good", brand: null, estimated_resale_usd: null, confidence: 0.9, notes: null };
const ok = (content: unknown, cost: number) =>
  new Response(JSON.stringify({ model: MODEL, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 10, cost } }));

function runner(cap: number, responses: Response[]) {
  const dir = mkdtempSync(path.join(tmpdir(), "vision-eval-"));
  writeFileSync(path.join(dir, "room.jpg"), new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
  const fetchMock = vi.fn<typeof fetch>(async () => responses.shift() ?? Promise.reject(new Error("unexpected fetch")));
  const ledger = new SpendLedger(cap);
  const openRouter = { apiKey: "k", baseUrl: "https://openrouter.test/api/v1", timeoutMs: 5000, maxAttempts: 3, fetch: fetchMock, sleep: async () => {} };
  const settings = { openRouter, judgeModel: JUDGE, candidateMaxTokens: 4000, judgeMaxTokens: 1500, reasoningEffort: "low" as const };
  return { cells: new CellRunner(settings, pricing, ledger, path.join(dir, "raw"), dir), ledger, fetchMock };
}

describe("CellRunner", () => {
  it("scores a cell from the judge's matching and settles both calls", async () => {
    const { cells, ledger } = runner(1, [
      ok({ room_type: "living room", items: [{ ...item, name: "couch" }, { ...item, name: "lamp" }] }, 0.02),
      ok({ matches: [{ gt: 0, pred: 0 }, { gt: 0, pred: 1 }] }, 0.001),
    ]);
    const cell = await cells.run(MODEL, gt);
    expect(cell).toMatchObject({ status: "ok", judgeStatus: "ok", costUsd: 0.02, judgeCostUsd: 0.001 });
    expect(cell.metrics).toMatchObject({ tp: 1, fp: 1, fn: 1, majorRecall: 1 });
    expect(cell.pairs).toEqual([{ gt: 0, pred: 0 }]);
    expect(ledger.snapshot()).toMatchObject({ reservedUsd: 0 });
    expect(ledger.snapshot().spentUsd).toBeCloseTo(0.021);
  });

  it("skips the cell without calling when candidate plus judge worst case does not fit", async () => {
    const { cells, fetchMock } = runner(0.01, []);
    expect(await cells.run(MODEL, gt)).toMatchObject({ status: "skipped_budget" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops dispatching new cells after the first overshoot", async () => {
    const { cells, fetchMock } = runner(10, [
      ok({ room_type: "living room", items: [] }, 5),
    ]);
    expect(await cells.run(MODEL, gt)).toMatchObject({ status: "ok", costUsd: 5 });
    expect(cells.overshot).toBe(true);
    expect(await cells.run(MODEL, { ...gt, file: "room.jpg" })).toMatchObject({ status: "skipped_budget", error: expect.stringMatching(/overshoot/) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
