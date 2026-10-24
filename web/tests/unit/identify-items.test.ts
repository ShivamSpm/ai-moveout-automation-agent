import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { OpenRouterConfigError, type OpenRouterConfig } from "@/server/integrations/openrouter";
import { SpendCapConfigError, SpendLedger, parsePricingTable } from "@/server/integrations/spend-ledger";
import { identifyItemsFromPhoto, loadIdentifyItemsDeps, type IdentifyItemsDeps } from "@/server/tools/identify-items";
import { parseInventoryOutput } from "@/server/tools/inventory-prompt";

const MODEL = "anthropic/claude-sonnet-5.5";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
const PHOTO = { bytes: JPEG, mimeType: "image/jpeg" };

const VALID = {
  room_type: "living room",
  items: [
    {
      name: "sofa",
      category: "furniture",
      quantity: 1,
      size_class: "bulky",
      condition: "good",
      brand: null,
      estimated_resale_usd: { low: 100, high: 250 },
      confidence: 0.95,
      notes: null,
    },
  ],
};

function catalog(overrides: Record<string, unknown> = {}) {
  return parsePricingTable({
    data: [
      {
        id: MODEL,
        pricing: { prompt: "0.000002", completion: "0.00001" },
        architecture: { input_modalities: ["text", "image"] },
        supported_parameters: ["max_tokens", "response_format", "structured_outputs"],
        ...overrides,
      },
    ],
  });
}

function reply(content: string, extra: Record<string, unknown> = {}) {
  return {
    model: MODEL,
    choices: [{ finish_reason: "stop", message: { content } }],
    usage: { prompt_tokens: 3000, completion_tokens: 900, cost: 0.015 },
    ...extra,
  };
}

type FetchFn = typeof fetch;
function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function setup(responses: Array<() => Response | Promise<Response>>, opts: { cap?: number; pricing?: ReturnType<typeof catalog>; timeoutMs?: number } = {}) {
  const queue = [...responses];
  const fetchMock = vi.fn<FetchFn>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected fetch");
    return next();
  });
  const openRouter: OpenRouterConfig = {
    apiKey: "test-key",
    baseUrl: "https://openrouter.test/api/v1",
    timeoutMs: opts.timeoutMs ?? 5_000,
    maxAttempts: 3,
    fetch: fetchMock,
    sleep: async () => {},
  };
  const ledger = new SpendLedger(opts.cap ?? 1);
  const deps: IdentifyItemsDeps = {
    openRouter,
    ledger,
    pricing: opts.pricing ?? catalog(),
    model: MODEL,
    maxTokens: 4000,
    reasoningEffort: "low",
    now: () => new Date("2026-10-24T12:00:00.000Z"),
  };
  return { deps, fetchMock, ledger };
}

function sentBody(fetchMock: ReturnType<typeof vi.fn<FetchFn>>, call = 0) {
  return JSON.parse(String(fetchMock.mock.calls[call][1]?.body));
}

describe("parseInventoryOutput", () => {
  it("accepts JSON wrapped in a markdown fence with surrounding prose", () => {
    const result = parseInventoryOutput("Here you go:\n```json\n" + JSON.stringify(VALID, null, 2) + "\n```\nDone.");
    expect(result.ok).toBe(true);
  });

  it("accepts an empty items array", () => {
    const result = parseInventoryOutput(JSON.stringify({ room_type: "closet", items: [] }));
    expect(result).toEqual({ ok: true, value: { room_type: "closet", items: [] } });
  });

  it("reports empty, invalid JSON and schema violations as typed failures", () => {
    expect(parseInventoryOutput("   ")).toMatchObject({ ok: false, kind: "empty" });
    expect(parseInventoryOutput(JSON.stringify(VALID).slice(0, 60))).toMatchObject({ ok: false, kind: "json" });
    const bad = { ...VALID, items: [{ ...VALID.items[0], category: "vehicle", quantity: 0 }] };
    const result = parseInventoryOutput(JSON.stringify(bad));
    expect(result).toMatchObject({ ok: false, kind: "schema" });
    expect(!result.ok && result.detail).toContain("items.0.category");
    expect(!result.ok && result.detail).toContain("items.0.quantity");
  });
});

describe("identifyItemsFromPhoto", () => {
  it("returns proposed items with the owner, hash of the original bytes and the reported cost", async () => {
    const { deps, fetchMock, ledger } = setup([() => jsonResponse(reply(JSON.stringify(VALID)))]);
    const result = await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "user-a" }, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { inventory } = result;
    expect(inventory.ownerId).toBe("user-a");
    expect(inventory.photo.sha256).toBe(createHash("sha256").update(JPEG).digest("hex"));
    expect(inventory.items.map((i) => i.status)).toEqual(["proposed"]);
    expect(inventory.cost).toEqual({ usd: 0.015, source: "response" });
    expect(ledger.snapshot().spentUsd).toBeCloseTo(0.015);
    expect(ledger.snapshot().reservedUsd).toBe(0);

    const body = sentBody(fetchMock);
    expect(body.model).toBe(MODEL);
    expect(body.max_tokens).toBe(4000);
    expect(body).not.toHaveProperty("temperature");
    expect(body.response_format.type).toBe("json_schema");
    const parts = body.messages[1].content;
    expect(parts[0].type).toBe("text");
    expect(parts[1].image_url.url).toBe(`data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`);
  });

  it("rejects unsupported, mislabelled, empty and oversized photos without calling the provider", async () => {
    const { deps, fetchMock } = setup([]);
    const cases = [
      { bytes: JPEG, mimeType: "image/gif" },
      { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), mimeType: "image/jpeg" },
      { bytes: new Uint8Array(), mimeType: "image/jpeg" },
      { bytes: (() => { const big = new Uint8Array(10 * 1024 * 1024 + 1); big.set(JPEG); return big; })(), mimeType: "image/jpeg" },
    ];
    for (const photo of cases) {
      const result = await identifyItemsFromPhoto({ photo, ownerId: "user-a" }, deps);
      expect(result).toMatchObject({ ok: false, failure: { kind: "invalid_photo", costUsd: 0 } });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats finish_reason length as a truncation failure and still charges the cost", async () => {
    const truncated = reply('{"room_type": "kitchen", "items": [', {});
    truncated.choices[0].finish_reason = "length";
    const { deps, ledger } = setup([() => jsonResponse(truncated)]);
    const result = await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "user-a" }, deps);
    expect(result).toMatchObject({ ok: false, failure: { kind: "truncated", costUsd: 0.015, costSource: "response" } });
    expect(ledger.snapshot().spentUsd).toBeCloseTo(0.015);
  });

  it("turns schema-violating output into invalid_output without a repair call", async () => {
    const { deps, fetchMock } = setup([() => jsonResponse(reply('{"room_type": "kitchen"}'))]);
    const result = await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "user-a" }, deps);
    expect(result).toMatchObject({ ok: false, failure: { kind: "invalid_output" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses before calling when pricing is missing, the model lacks image input, or the cap is too small", async () => {
    const missing = setup([], { pricing: parsePricingTable({ data: [] }) });
    expect(await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, missing.deps)).toMatchObject({
      ok: false,
      failure: { kind: "pricing_missing" },
    });
    const textOnly = setup([], { pricing: catalog({ architecture: { input_modalities: ["text"] } }) });
    expect(await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, textOnly.deps)).toMatchObject({
      ok: false,
      failure: { kind: "model_unsupported" },
    });
    const tiny = setup([], { cap: 0.001 });
    expect(await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, tiny.deps)).toMatchObject({
      ok: false,
      failure: { kind: "budget_refused", costUsd: 0 },
    });
    for (const s of [missing, textOnly, tiny]) expect(s.fetchMock).not.toHaveBeenCalled();
  });

  it("retries 429 and 5xx up to three attempts, but never a 400 or an error inside a 200 body", async () => {
    const retried = setup([
      () => jsonResponse({ error: { code: 429, message: "slow down" } }, 429, { "retry-after": "1" }),
      () => jsonResponse(reply(JSON.stringify(VALID))),
    ]);
    const ok = await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, retried.deps);
    expect(ok).toMatchObject({ ok: true, inventory: { attempts: 2 } });

    const down = setup([1, 2, 3].map(() => () => jsonResponse({ error: { code: 502, message: "down" } }, 502)));
    expect(await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, down.deps)).toMatchObject({
      ok: false,
      failure: { kind: "provider_error", attempts: 3, costUsd: 0 },
    });
    expect(down.fetchMock).toHaveBeenCalledTimes(3);

    const bad = setup([() => jsonResponse({ error: { code: 400, message: "bad" } }, 400)]);
    expect(await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, bad.deps)).toMatchObject({
      ok: false,
      failure: { kind: "provider_error", attempts: 1 },
    });
    expect(bad.fetchMock).toHaveBeenCalledTimes(1);

    const midStream = setup([() => jsonResponse({ error: { code: 502, message: "provider died" } }, 200)]);
    const failed = await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, midStream.deps);
    expect(midStream.fetchMock).toHaveBeenCalledTimes(1);
    // Generation may have been billed without a usage block, so the worst case is charged.
    expect(failed).toMatchObject({ ok: false, failure: { kind: "provider_error", costSource: "worst_case" } });
    expect(midStream.ledger.snapshot().spentUsd).toBeGreaterThan(0);
  });

  it("aborts a hung request at the timeout and charges the worst case", async () => {
    const { deps, fetchMock, ledger } = setup([], { timeoutMs: 20 });
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const result = await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, deps);
    expect(result).toMatchObject({ ok: false, failure: { kind: "timeout", costSource: "worst_case", attempts: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ledger.snapshot().spentUsd).toBeGreaterThan(0);
    expect(ledger.snapshot().reservedUsd).toBe(0);
  });
});

describe("loadIdentifyItemsDeps", () => {
  it("fails loudly without an API key or a spend cap, before any network call", async () => {
    const fetchMock = vi.fn<FetchFn>();
    await expect(loadIdentifyItemsDeps({ env: { OPENROUTER_SPEND_CAP_USD: "1" }, fetch: fetchMock })).rejects.toThrow(
      OpenRouterConfigError,
    );
    await expect(loadIdentifyItemsDeps({ env: { OPENROUTER_API_KEY: "k" }, fetch: fetchMock })).rejects.toThrow(
      SpendCapConfigError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("identifyItemsFromPhoto spend safety", () => {
  const worstCase = (ledger: SpendLedger) => ledger.snapshot().entries[0].reservedUsd;

  it("charges the reserved worst case when a successful reply has no usage block", async () => {
    const { usage: _omit, ...noUsage } = reply(JSON.stringify(VALID));
    void _omit;
    const { deps, ledger } = setup([() => jsonResponse(noUsage)]);
    const result = await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, deps);
    expect(ledger.snapshot().spentUsd).toBeGreaterThan(0);
    expect(ledger.snapshot().spentUsd).toBe(worstCase(ledger));
    expect(result).toMatchObject({ ok: true, inventory: { cost: { source: "worst_case" } } });
    if (result.ok) expect(result.inventory.warnings.join(" ")).toMatch(/worst case/);
  });

  it("warns when the reported cost exceeds the reservation", async () => {
    const pricey = reply(JSON.stringify(VALID));
    pricey.usage.cost = 5;
    const { deps, ledger } = setup([() => jsonResponse(pricey)], { cap: 10 });
    const result = await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, deps);
    expect(ledger.snapshot().overshootUsd).toBeGreaterThan(0);
    expect(result.ok && result.inventory.warnings.join(" ")).toMatch(/exceeded its reserved worst case/);
  });

  it("sums usage billed on retried attempts", async () => {
    const { deps, ledger } = setup([
      () => jsonResponse({ error: { code: 502, message: "down" }, usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.01 } }, 502),
      () => jsonResponse(reply(JSON.stringify(VALID))),
    ]);
    const result = await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, deps);
    expect(result).toMatchObject({ ok: true, inventory: { cost: { usd: 0.025 } } });
    expect(ledger.snapshot().spentUsd).toBeCloseTo(0.025);
  });

  it("turns a negative reported cost into a typed failure without leaking the reservation", async () => {
    const negative = reply(JSON.stringify(VALID));
    negative.usage.cost = -1;
    const { deps, ledger } = setup([() => jsonResponse(negative)]);
    const result = await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, deps);
    expect(result).toMatchObject({ ok: false, failure: { kind: "provider_error", costSource: "worst_case" } });
    expect(ledger.snapshot().reservedUsd).toBe(0);
  });

  it("rejects an inverted resale range as invalid output", async () => {
    const inverted = { ...VALID, items: [{ ...VALID.items[0], estimated_resale_usd: { low: 300, high: 100 } }] };
    const { deps } = setup([() => jsonResponse(reply(JSON.stringify(inverted)))]);
    expect(await identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u" }, deps)).toMatchObject({ ok: false, failure: { kind: "invalid_output" } });
  });

  it("stops a paid call when the caller aborts, and charges the worst case", async () => {
    const { deps, fetchMock, ledger } = setup([]);
    fetchMock.mockImplementation(
      (_url, init) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    );
    const controller = new AbortController();
    const pending = identifyItemsFromPhoto({ photo: PHOTO, ownerId: "u", signal: controller.signal }, deps);
    setTimeout(() => controller.abort(), 5);
    expect(await pending).toMatchObject({ ok: false, failure: { kind: "aborted", costSource: "worst_case" } });
    expect(ledger.snapshot().reservedUsd).toBe(0);
  });
});

describe("photo and input validation", () => {
  const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), 0, 0]);

  it("accepts a real WebP signature and rejects a buffer shorter than the signature", async () => {
    const ok = setup([() => jsonResponse(reply(JSON.stringify(VALID)))]);
    expect(await identifyItemsFromPhoto({ photo: { bytes: webp, mimeType: "image/webp" }, ownerId: "u" }, ok.deps)).toMatchObject({ ok: true });
    const short = setup([]);
    expect(await identifyItemsFromPhoto({ photo: { bytes: new Uint8Array([0xff, 0xd8]), mimeType: "image/jpeg" }, ownerId: "u" }, short.deps)).toMatchObject({
      ok: false,
      failure: { kind: "invalid_photo" },
    });
  });

  it("rejects a photo above the smallest provider limit (5 MB base64)", async () => {
    const { deps } = setup([]);
    const big = new Uint8Array(3_750_001);
    big.set(JPEG);
    expect(await identifyItemsFromPhoto({ photo: { bytes: big, mimeType: "image/jpeg" }, ownerId: "u" }, deps)).toMatchObject({
      ok: false,
      failure: { kind: "invalid_photo" },
    });
  });

  it("rejects a blank ownerId", async () => {
    const { deps } = setup([]);
    await expect(identifyItemsFromPhoto({ photo: PHOTO, ownerId: "  " }, deps)).rejects.toThrow();
  });

  it("validates the photo before loading any configuration or pricing", async () => {
    const result = await identifyItemsFromPhoto({ photo: { bytes: JPEG, mimeType: "image/gif" }, ownerId: "u" });
    expect(result).toMatchObject({ ok: false, failure: { kind: "invalid_photo" } });
  });
});
