import "server-only";

import { z } from "zod";

// Server-side OpenRouter client (OpenAI-compatible chat completions).
// The key stays on the server: never import this from a client component.

const BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "anthropic/claude-opus-5.5";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class OpenRouterError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function complete(
  messages: ChatMessage[],
  { signal }: { signal?: AbortSignal } = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new OpenRouterError("OPENROUTER_API_KEY is not set");

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL, messages }),
    signal,
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new OpenRouterError(`OpenRouter returned ${res.status}: ${detail}`, res.status);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new OpenRouterError("OpenRouter returned no message");
  return text;
}

// ---------------------------------------------------------------------------
// Vision chat completions with structured output, raw usage and cost, used by
// the identify-items tool. Failures come back as typed results so the caller
// can settle the spend ledger; only missing configuration throws.

export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_VISION_TIMEOUT_MS = 120_000;
export const MAX_VISION_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 60_000;

export class OpenRouterConfigError extends OpenRouterError {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterConfigError";
  }
}

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxAttempts: number;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

export function readOpenRouterBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OpenRouterConfigError(`OPENROUTER_BASE_URL is not a valid URL: "${raw}"`);
  }
  if (url.protocol !== "https:") throw new OpenRouterConfigError("OPENROUTER_BASE_URL must use https");
  return raw.replace(/\/+$/, "");
}

export function readOpenRouterConfig(
  env: Record<string, string | undefined> = process.env,
  overrides: Partial<Omit<OpenRouterConfig, "apiKey" | "baseUrl">> = {},
): OpenRouterConfig {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new OpenRouterConfigError("OPENROUTER_API_KEY is not set; refusing to call OpenRouter");
  return {
    apiKey,
    baseUrl: readOpenRouterBaseUrl(env),
    timeoutMs: overrides.timeoutMs ?? DEFAULT_VISION_TIMEOUT_MS,
    maxAttempts: overrides.maxAttempts ?? MAX_VISION_ATTEMPTS,
    fetch: overrides.fetch ?? fetch,
    sleep: overrides.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
}

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface VisionMessage {
  role: "system" | "user";
  content: string | ContentPart[];
}

export type ReasoningEffort = "default" | "none" | "low" | "medium" | "high";

export interface VisionRequest {
  model: string;
  messages: VisionMessage[];
  maxTokens: number;
  responseFormat: { type: "json_schema"; json_schema: { name: string; strict: true; schema: object } };
  reasoningEffort: ReasoningEffort;
}

export function imageDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function buildVisionBody(request: VisionRequest): Record<string, unknown> {
  if (!Number.isInteger(request.maxTokens) || request.maxTokens <= 0) {
    throw new RangeError(`max_tokens must be a positive integer, got ${request.maxTokens}`);
  }
  // No temperature: Anthropic and OpenAI reasoning models reject or ignore it.
  return {
    model: request.model,
    messages: request.messages,
    max_tokens: request.maxTokens,
    response_format: request.responseFormat,
    // Route only to endpoints that honour every parameter here, structured outputs in particular.
    provider: { require_parameters: true },
    ...(request.reasoningEffort === "default" ? {} : { reasoning: { effort: request.reasoningEffort, exclude: true } }),
  };
}

export interface VisionUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number | null;
  /** OpenRouter credits billed (1 credit = 1 USD); null when the response omits it. */
  costUsd: number | null;
}

export interface VisionSuccess {
  ok: true;
  content: string;
  finishReason: string | null;
  servedModel: string | null;
  usage: VisionUsage | null;
  /** Successful attempt only; retries and backoff excluded. */
  latencyMs: number;
  attempts: number;
}

export type VisionFailureKind = "http" | "provider_error" | "truncated" | "timeout" | "aborted" | "transport" | "bad_response";

export interface VisionFailure {
  ok: false;
  kind: VisionFailureKind;
  message: string;
  status: number | null;
  retryable: boolean;
  usage: VisionUsage | null;
  /** True when generation may have been billed but the response did not say how much. */
  billingUnknown: boolean;
  attempts: number;
}

export type VisionResult = VisionSuccess | VisionFailure;

// Negative numbers would corrupt the spend ledger, so they make the whole response unreadable.
const usageSchema = z.object({
  prompt_tokens: z.number().nonnegative(),
  completion_tokens: z.number().nonnegative(),
  cost: z.number().nonnegative().nullish(),
  completion_tokens_details: z.object({ reasoning_tokens: z.number().nonnegative().nullish() }).nullish(),
});
const apiErrorSchema = z.object({ code: z.union([z.number(), z.string()]).nullish(), message: z.string().nullish() });
const responseSchema = z.object({
  model: z.string().nullish(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({ content: z.string().nullish() }).nullish(),
        error: apiErrorSchema.nullish(),
      }),
    )
    .nullish(),
  usage: usageSchema.nullish(),
  error: apiErrorSchema.nullish(),
});

const isRetryable = (status: number) => status === 429 || status >= 500;

function toUsage(usage: z.infer<typeof usageSchema> | null | undefined): VisionUsage | null {
  if (!usage) return null;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
    costUsd: usage.cost ?? null,
  };
}

type Attempt = Omit<VisionSuccess, "attempts"> | (Omit<VisionFailure, "attempts"> & { retryAfterMs: number | null });

function fail(kind: VisionFailureKind, message: string, fields: Partial<VisionFailure> & { retryAfterMs?: number | null } = {}): Omit<VisionFailure, "attempts"> & { retryAfterMs: number | null } {
  return { ok: false, kind, message, status: null, retryable: false, usage: null, billingUnknown: false, retryAfterMs: null, ...fields };
}

function interpret(status: number, payload: unknown, latencyMs: number, retryAfterMs: number | null): Attempt {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    // A 2xx with an unreadable body may still have been billed.
    return fail("bad_response", `HTTP ${status}: unexpected response shape`, {
      status,
      retryable: isRetryable(status),
      billingUnknown: status < 400,
      retryAfterMs,
    });
  }
  const body = parsed.data;
  const usage = toUsage(body.usage);
  if (status >= 400) {
    return fail("http", `HTTP ${status}: ${body.error?.message ?? "request failed"}`, {
      status,
      retryable: isRetryable(status),
      usage,
      retryAfterMs,
    });
  }
  if (body.error) {
    // An error inside an HTTP 200 body: generation started, so tokens may be billed. Never retried,
    // so a retry cannot double-spend.
    return fail("provider_error", `error after HTTP 200: ${body.error.message ?? "generation failed"}`, {
      status: typeof body.error.code === "number" ? body.error.code : status,
      usage,
      billingUnknown: usage === null,
    });
  }
  const choice = body.choices?.[0];
  if (!choice) return fail("bad_response", "response has no choices", { status, usage, billingUnknown: usage === null });
  if (choice.finish_reason === "error" || choice.error) {
    return fail("provider_error", `generation ended with an error: ${choice.error?.message ?? "finish_reason error"}`, {
      status,
      usage,
      billingUnknown: usage === null,
    });
  }
  if (choice.finish_reason === "length") {
    return fail("truncated", "output hit max_tokens before finishing; partial output is discarded", {
      status,
      usage,
      billingUnknown: usage === null,
    });
  }
  return {
    ok: true,
    content: choice.message?.content ?? "",
    finishReason: choice.finish_reason ?? null,
    servedModel: body.model ?? null,
    usage,
    latencyMs,
  };
}

function parseRetryAfter(header: string | null): number | null {
  if (!header || !/^\d+(\.\d+)?$/.test(header.trim())) return null;
  return Number(header) * 1000;
}

async function attemptVision(body: string, config: OpenRouterConfig, signal?: AbortSignal): Promise<Attempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const started = performance.now();
  try {
    const response = await config.fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    const latencyMs = performance.now() - started;
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { non_json_body: text.slice(0, 2000) };
    }
    return interpret(response.status, payload, latencyMs, parseRetryAfter(response.headers.get("retry-after")));
  } catch (error) {
    // The request may have reached the provider before failing, so its cost is unknown.
    if (signal?.aborted) return fail("aborted", "aborted by the caller", { billingUnknown: true });
    if (controller.signal.aborted) {
      return fail("timeout", `no response within ${config.timeoutMs} ms`, { billingUnknown: true });
    }
    return fail("transport", `transport error: ${error instanceof Error ? error.message : String(error)}`, {
      billingUnknown: true,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function backoffMs(retry: number): number {
  return Math.min(MAX_BACKOFF_MS, 2000 * 2 ** retry) + Math.random() * 500;
}

function addUsage(a: VisionUsage | null, b: VisionUsage | null): VisionUsage | null {
  if (!a || !b) return a ?? b;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    reasoningTokens: a.reasoningTokens === null && b.reasoningTokens === null ? null : (a.reasoningTokens ?? 0) + (b.reasoningTokens ?? 0),
    costUsd: a.costUsd === null || b.costUsd === null ? null : a.costUsd + b.costUsd,
  };
}

/** One vision completion; retries HTTP 429 and 5xx only, at most `config.maxAttempts` attempts in total.
 * Usage reported by a retried attempt is added to the result, so the caller settles all of it. */
export async function completeVision(
  request: VisionRequest,
  config: OpenRouterConfig,
  { signal }: { signal?: AbortSignal } = {},
): Promise<VisionResult> {
  const body = JSON.stringify(buildVisionBody(request));
  let retriedUsage: VisionUsage | null = null;
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) {
      return { ...fail("aborted", "aborted by the caller before sending"), usage: retriedUsage, attempts: attempt - 1 };
    }
    const result = await attemptVision(body, config, signal);
    if (result.ok) {
      // A success without usage stays usage-null so the caller charges its worst case.
      return { ...result, usage: retriedUsage && result.usage ? addUsage(retriedUsage, result.usage) : result.usage, attempts: attempt };
    }
    const { retryAfterMs, ...failure } = result;
    if (!failure.retryable || attempt >= config.maxAttempts) {
      return { ...failure, usage: addUsage(retriedUsage, failure.usage), attempts: attempt };
    }
    retriedUsage = addUsage(retriedUsage, failure.usage);
    await config.sleep(Math.min(MAX_BACKOFF_MS, retryAfterMs ?? backoffMs(attempt - 1)));
  }
}
