import { z } from "zod";
import { jsonSchemaResponseFormat } from "@/contracts/json-schema";
import type { InventoryItem } from "@/contracts/inventory";
import type { ReasoningEffort, VisionRequest } from "@/server/integrations/openrouter";
import { parseJsonOutput } from "@/server/tools/inventory-prompt";
import type { MatchPair } from "./metrics";

export const DEFAULT_JUDGE_MODEL = "anthropic/claude-haiku-5.5";

const JudgeVerdictSchema = z.strictObject({
  matches: z.array(z.strictObject({ gt: z.number().int(), pred: z.number().int() })),
});

export const JUDGE_RESPONSE_FORMAT = jsonSchemaResponseFormat("item_matching", JudgeVerdictSchema);

export const JUDGE_SYSTEM_PROMPT = `You grade a home-inventory model against a human-labelled ground truth for one photo.
You get two numbered lists of item names: GROUND TRUTH (what is really in the photo) and PREDICTED (what the model listed, with quantity).

Return the pairs that refer to the same physical belonging(s), as a one-to-one matching:
- Synonyms and wording differences match: "couch" = "sofa", "TV" = "television", "mug" = "coffee cup".
- A more specific or more generic name for the same thing matches: "office chair" = "chair", "ceramic vase" = "vase".
- Grouped entries match their group: predicted "books (x30)" matches ground truth "books"; quantities do not have to agree.
- Each ground-truth index and each predicted index appears in at most one pair. If two predictions describe the same ground-truth item, pair only the better one. If one broad prediction covers several ground-truth items, pair it with the single closest one.
- Do not pair different kinds of objects, even from the same category: "armchair" is not "sofa", "lamp" is not "ceiling light".
- Leave unmatched anything without a clear counterpart. Precision matters as much as recall.

Respond with JSON only: {"matches": [{"gt": <ground truth index>, "pred": <predicted index>}]}`;

export function predictedLabel(item: Pick<InventoryItem, "name" | "quantity">): string {
  return item.quantity > 1 ? `${item.name} (x${item.quantity})` : item.name;
}

export function judgeUserPrompt(gtNames: readonly string[], predictedLabels: readonly string[]): string {
  const gt = gtNames.map((name, i) => `${i}: ${name}`).join("\n") || "(none)";
  const pred = predictedLabels.map((label, i) => `${i}: ${label}`).join("\n") || "(none)";
  return `GROUND TRUTH\n${gt}\n\nPREDICTED\n${pred}`;
}

export function judgePromptChars(gtNames: readonly string[], predictedLabels: readonly string[]): number {
  return JUDGE_SYSTEM_PROMPT.length + judgeUserPrompt(gtNames, predictedLabels).length + JSON.stringify(JUDGE_RESPONSE_FORMAT).length;
}

export function buildJudgeRequest(
  model: string,
  gtNames: readonly string[],
  predictedLabels: readonly string[],
  maxTokens: number,
  reasoningEffort: ReasoningEffort,
): VisionRequest {
  return {
    model,
    messages: [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      { role: "user", content: judgeUserPrompt(gtNames, predictedLabels) },
    ],
    maxTokens,
    responseFormat: JUDGE_RESPONSE_FORMAT,
    reasoningEffort,
  };
}

export function parseJudgeOutput(content: string): { ok: true; pairs: MatchPair[] } | { ok: false; detail: string } {
  const parsed = parseJsonOutput(content, JudgeVerdictSchema);
  return parsed.ok ? { ok: true, pairs: parsed.value.matches } : { ok: false, detail: `${parsed.kind}: ${parsed.detail}` };
}
