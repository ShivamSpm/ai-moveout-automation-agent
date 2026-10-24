import { describe, expect, it } from "vitest";
import { computeMetrics, sanitizeMatching, summarizeModel, type CellResult, type MatchPair } from "../../scripts/vision-eval/metrics";

const pairs = (...items: Array<[number, number]>): MatchPair[] => items.map(([gt, pred]) => ({ gt, pred }));

describe("computeMetrics", () => {
  it("scores an empty prediction against real items as zero, not NaN", () => {
    const m = computeMetrics(["major", "minor"], 0, []);
    expect([m.tp, m.fp, m.fn, m.precision, m.recall, m.f1, m.majorRecall]).toEqual([0, 0, 2, 0, 0, 0, 0]);
  });

  it("makes every prediction a false positive when the ground truth is empty", () => {
    const m = computeMetrics([], 3, []);
    expect([m.tp, m.fp, m.fn, m.precision, m.recall, m.f1, m.majorRecall]).toEqual([0, 3, 0, 0, 1, 0, null]);
    expect(computeMetrics([], 0, [])).toMatchObject({ precision: 1, recall: 1, f1: 1, majorRecall: null });
  });

  it("counts two predictions claiming the same item as one hit and one false positive", () => {
    const m = computeMetrics(["major"], 2, pairs([0, 0], [0, 1]));
    expect([m.tp, m.fp, m.fn, m.precision, m.recall]).toEqual([1, 1, 0, 0.5, 1]);
  });

  it("lets a grouped prediction cover only one ground-truth entry", () => {
    // ground truth: "books" (minor), "bookshelf" (major); prediction: "books (x30)" claimed for both
    const m = computeMetrics(["minor", "major"], 1, pairs([0, 0], [1, 0]));
    expect([m.tp, m.fp, m.fn, m.precision, m.recall, m.majorRecall]).toEqual([1, 0, 1, 1, 0.5, 0]);
  });

  it("reports major recall as n/a for an image with no major items", () => {
    const m = computeMetrics(["minor", "minor", "minor"], 2, pairs([0, 0]));
    expect(m.majorTotal).toBe(0);
    expect(m.majorRecall).toBeNull();
  });

  it("drops out-of-range and repeated judge indices", () => {
    expect(sanitizeMatching(pairs([0, 0], [0, 1], [1, 0], [5, 1], [1, -1], [1, 1]), 2, 2)).toEqual(pairs([0, 0], [1, 1]));
  });
});

describe("summarizeModel", () => {
  it("averages major recall only over images that have major items", () => {
    const cell = (image: string, metrics: CellResult["metrics"]): CellResult => ({
      model: "m",
      image,
      status: "ok",
      attempts: 1,
      costSource: "response",
      judgeStatus: "ok",
      pairs: [],
      metrics,
    });
    const summary = summarizeModel("m", [
      cell("a", computeMetrics(["major", "major"], 1, pairs([0, 0]))),
      cell("b", computeMetrics(["minor"], 1, pairs([0, 0]))),
    ]);
    expect(summary.meanMajorRecall).toBe(0.5);
    expect(summary.meanRecall).toBe(0.75);
  });
});
