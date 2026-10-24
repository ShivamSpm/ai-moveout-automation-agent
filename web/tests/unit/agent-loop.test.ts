import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_MODEL_ROUNDS, ROUND_LIMIT_REPLY, SPEND_CAP_REPLY, runToolLoop, type LoopDeps } from "@/server/agent/loop";
import { clearQuotes, rememberQuotes } from "@/server/agent/quote-store";
import { TOOL_DEFINITIONS, type ToolEnv, type ToolServices } from "@/server/agent/tools";
import { SpendLedger } from "@/server/integrations/spend-ledger";
import type { CleaningQuote } from "@/contracts/cleaning";

const pricing = { prompt: 1e-6, completion: 1e-6, image: 0, request: 0, internalReasoning: null };

function reply(message: Record<string, unknown>, cost = 0.001) {
  return new Response(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5, cost } }), { status: 200 });
}
const toolCall = (name: string, args: unknown, id = "call_1") => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

function setup(responses: Response[], cap = 10) {
  const fetchMock = vi.fn(async () => responses.shift() ?? reply({ content: "done" }));
  const deps: LoopDeps = { apiKey: "k", baseUrl: "https://openrouter.test/api/v1", model: "m", fetch: fetchMock as unknown as typeof fetch, ledger: new SpendLedger(cap), pricing };
  const services: ToolServices = {
    identify: vi.fn(),
    findCleaning: vi.fn(),
    findMoving: vi.fn(),
    proposeCleaning: vi.fn(async ({ quote, slotId }) => ({ proposalId: "cbp_1", quote, slotId }) as never),
    proposeMoving: vi.fn(),
  };
  const env: ToolEnv = { ownerId: "owner-a", photo: null, services };
  const sentBodies = () => fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
  return { deps, env, services, fetchMock, sentBodies };
}

const system = [{ role: "system" as const, content: "sys" }, { role: "user" as const, content: "hi" }];

beforeEach(() => clearQuotes());

describe("agent tool loop", () => {
  it("runs a tool_calls round then returns the final answer with the events", async () => {
    const quote = { quoteId: "q1", slots: [{ slotId: "s1", start: "a", end: "b" }] } as unknown as CleaningQuote;
    rememberQuotes("owner-a", [{ service: "cleaning", quote }]);
    const t = setup([reply({ content: null, tool_calls: [toolCall("propose_cleaning_booking", { quoteId: "q1", slotId: "s1" })] }), reply({ content: "Approve it on the card." })]);
    const result = await runToolLoop(system, t.env, t.deps);
    expect(result.reply).toBe("Approve it on the card.");
    expect(result.events).toMatchObject([{ type: "booking_proposal", service: "cleaning", data: { proposalId: "cbp_1" } }]);
    expect(t.services.proposeCleaning).toHaveBeenCalledWith({ quote, slotId: "s1" });
    const second = t.sentBodies()[1];
    expect(second.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_1" });
    expect(second.messages.at(-1).content).toContain("must approve");
  });

  it("returns invalid tool arguments to the model instead of calling the service", async () => {
    const t = setup([reply({ content: null, tool_calls: [toolCall("find_cleaning_quotes", { bedrooms: 2 })] }), reply({ content: "What is your ZIP code?" })]);
    const result = await runToolLoop(system, t.env, t.deps);
    expect(result.reply).toBe("What is your ZIP code?");
    expect(t.services.findCleaning).not.toHaveBeenCalled();
    const toolMessage = t.sentBodies()[1].messages.at(-1);
    expect(JSON.parse(toolMessage.content)).toMatchObject({ ok: false, error: "invalid_arguments" });
    expect(JSON.parse(toolMessage.content).issues.length).toBeGreaterThan(0);
  });

  it("stops after the round limit", async () => {
    const loopForever = Array.from({ length: 10 }, (_, i) => reply({ content: null, tool_calls: [toolCall("identify_items_in_photo", {}, `c${i}`)] }));
    const t = setup(loopForever);
    const result = await runToolLoop(system, t.env, t.deps);
    expect(t.fetchMock).toHaveBeenCalledTimes(MAX_MODEL_ROUNDS);
    expect(result.reply).toBe(ROUND_LIMIT_REPLY);
  });

  it("gives tool_error for a quoteId this owner never received", async () => {
    rememberQuotes("owner-b", [{ service: "cleaning", quote: { quoteId: "q-other", slots: [] } as unknown as CleaningQuote }]);
    const t = setup([reply({ content: null, tool_calls: [toolCall("propose_cleaning_booking", { quoteId: "q-other", slotId: "s1" })] }), reply({ content: "Let me search first." })]);
    const result = await runToolLoop(system, t.env, t.deps);
    expect(result.events).toMatchObject([{ type: "tool_error", tool: "propose_cleaning_booking" }]);
    expect(t.services.proposeCleaning).not.toHaveBeenCalled();
  });

  it("turns a tool exception into a tool_error event", async () => {
    const t = setup([reply({ content: null, tool_calls: [toolCall("identify_items_in_photo", {})] }), reply({ content: "Sorry." })]);
    t.env.photo = { bytes: new Uint8Array([1]), mimeType: "image/png" };
    vi.mocked(t.services.identify).mockRejectedValue(new Error("boom"));
    const result = await runToolLoop(system, t.env, t.deps);
    expect(result.reply).toBe("Sorry.");
    expect(result.events).toMatchObject([{ type: "tool_error", tool: "identify_items_in_photo" }]);
  });

  it("never exposes an approve tool", async () => {
    expect(TOOL_DEFINITIONS.map((t) => t.function.name).filter((n) => /approve/i.test(n))).toEqual([]);
    const t = setup([reply({ content: "ok" })]);
    await runToolLoop(system, t.env, t.deps);
    expect(JSON.stringify(t.sentBodies()[0].tools)).not.toMatch(/"name":"[^"]*approve/i);
  });

  it("stops with a friendly reply when the spend cap is reached", async () => {
    const t = setup([reply({ content: null, tool_calls: [toolCall("identify_items_in_photo", {})] }, 0.009)], 0.01);
    const result = await runToolLoop(system, t.env, t.deps);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe(SPEND_CAP_REPLY);
    const none = setup([], 0);
    expect((await runToolLoop(system, none.env, none.deps)).reply).toBe(SPEND_CAP_REPLY);
    expect(none.fetchMock).not.toHaveBeenCalled();
  });
});
