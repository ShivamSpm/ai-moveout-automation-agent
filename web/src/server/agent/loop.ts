import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AgentEvent } from "@/contracts/agent-events";
import { OpenRouterError } from "@/server/integrations/openrouter";
import { actualCost, callCostUpperBound, type ModelPricing, type SpendLedger } from "@/server/integrations/spend-ledger";
import { TOOL_DEFINITIONS, runTool, type ToolEnv } from "./tools";

// The tool-calling loop over OpenRouter's OpenAI-compatible chat completions: `tools` in every
// request, `tool_calls` (arguments as a JSON string) on the assistant message, and results sent back
// as role "tool" messages with the matching tool_call_id.

export const MAX_MODEL_ROUNDS = 4;
export const CHAT_MAX_TOKENS = 2000;
export const ROUND_LIMIT_REPLY = "I ran out of steps for this message. Tell me what to focus on and I will continue.";
export const SPEND_CAP_REPLY = "I have reached this app's AI spending limit for now, so I cannot continue. Please try again later.";

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type LoopMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface LoopDeps {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetch: typeof fetch;
  ledger: SpendLedger;
  pricing: ModelPricing;
}

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z
          .object({
            content: z.string().nullish(),
            tool_calls: z.array(z.object({ id: z.string(), type: z.literal("function").optional(), function: z.object({ name: z.string(), arguments: z.string().nullish() }) })).nullish(),
          })
          .nullish(),
      }),
    )
    .nullish(),
  usage: z.object({ prompt_tokens: z.number().nonnegative(), completion_tokens: z.number().nonnegative(), cost: z.number().nonnegative().nullish() }).nullish(),
});

export interface LoopResult {
  reply: string;
  events: AgentEvent[];
}

async function callModel(messages: LoopMessage[], deps: LoopDeps, signal?: AbortSignal) {
  const body = JSON.stringify({ model: deps.model, messages, tools: TOOL_DEFINITIONS, max_tokens: CHAT_MAX_TOKENS });
  const key = `chat-${randomUUID()}`;
  if (!deps.ledger.tryReserve(key, callCostUpperBound(deps.pricing, body.length, 0, CHAT_MAX_TOKENS))) return null;
  let status: number;
  let payload: unknown;
  try {
    const res = await deps.fetch(`${deps.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${deps.apiKey}`, "content-type": "application/json" },
      body,
      signal,
    });
    status = res.status;
    payload = await res.json().catch(() => null);
  } catch (error) {
    // The request may have reached the provider, so charge the worst case.
    deps.ledger.settleOpenAtReserved([key]);
    throw error;
  }
  const parsed = responseSchema.safeParse(payload);
  const usage = parsed.success ? parsed.data.usage : null;
  if (usage) {
    const cost = actualCost({ promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, costUsd: usage.cost ?? null }, deps.pricing, 0);
    deps.ledger.settle(key, cost.usd, cost.source);
  } else {
    deps.ledger.settleOpenAtReserved([key]);
  }
  if (status >= 400) throw new OpenRouterError(`OpenRouter returned ${status}`, status);
  const message = parsed.success ? parsed.data.choices?.[0]?.message : null;
  if (!message) throw new OpenRouterError("OpenRouter returned no message");
  return message;
}

export async function runToolLoop(initial: LoopMessage[], env: ToolEnv, deps: LoopDeps, signal?: AbortSignal): Promise<LoopResult> {
  const messages = [...initial];
  const events: AgentEvent[] = [];
  let lastText = "";
  for (let round = 0; round < MAX_MODEL_ROUNDS; round++) {
    const message = await callModel(messages, deps, signal);
    if (!message) return { reply: lastText ? `${lastText}\n\n${SPEND_CAP_REPLY}` : SPEND_CAP_REPLY, events };
    const text = message.content?.trim() ?? "";
    if (text) lastText = text;
    const calls = message.tool_calls ?? [];
    if (calls.length === 0) return { reply: text || lastText || ROUND_LIMIT_REPLY, events };
    const toolCalls: ToolCall[] = calls.map((c) => ({ id: c.id, type: "function", function: { name: c.function.name, arguments: c.function.arguments ?? "" } }));
    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      const outcome = await runTool(call.function.name, call.function.arguments, env);
      if (outcome.event) events.push(outcome.event);
      messages.push({ role: "tool", tool_call_id: call.id, content: outcome.content });
    }
  }
  return { reply: lastText || ROUND_LIMIT_REPLY, events };
}
