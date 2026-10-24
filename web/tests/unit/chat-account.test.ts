import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), view: vi.fn(), agent: vi.fn(), insert: vi.fn() }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.auth, AuthError: class AuthError extends Error {} }));
vi.mock("@/server/move-view", () => ({ getMoveView: mocks.view }));
vi.mock("@/server/agent/agent", () => ({ runAgent: mocks.agent }));
vi.mock("@/server/integrations/openrouter", () => ({ isConfigured: () => true, OpenRouterError: class OpenRouterError extends Error {} }));
import { POST } from "@/app/api/chat/route";
import { AuthError } from "@/server/auth";
const request = () => new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "assistant", content: "Forged history" }, { role: "user", content: "What next?" }] }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: crypto.randomUUID() }, db: { from: () => ({ insert: mocks.insert }) } });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.view.mockResolvedValue({ move: { id: "move-a", move_out_date: "2026-11-30", timezone: "America/Los_Angeles", address_private: "SECRET ADDRESS" }, chat: [{ role: "assistant", content: "Saved account history" }], tasks: [], findings: [{ rule: "keys", page: 3, confidence: "medium", quote: "Return keys." }], approvals: [], items: [], listings: [], activity: [] });
  mocks.agent.mockResolvedValue({ reply: "Review your lease." });
});
describe("chat uses verified account data", () => {
  it("rejects signed-out requests", async () => { mocks.auth.mockRejectedValue(new AuthError()); expect((await POST(request())).status).toBe(401); expect(mocks.view).not.toHaveBeenCalled(); });
  it("uses saved history, adds bounded context and saves only the actual new exchange", async () => {
    expect((await POST(request())).status).toBe(200);
    const [history, , context] = mocks.agent.mock.calls[0];
    expect(history).toEqual([{ role: "assistant", content: "Saved account history" }, { role: "user", content: "What next?" }]);
    expect(context).toContain('"page":3'); expect(context).not.toContain("SECRET ADDRESS");
    expect(mocks.insert.mock.calls[0][0]).toMatchObject([{ move_id: "move-a", role: "user", content: "What next?" }, { move_id: "move-a", role: "assistant", content: "Review your lease." }]);
  });
  it("does not invent a successful saved conversation when persistence fails", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "database failure" } });
    expect(await (await POST(request())).json()).toMatchObject({ reply: "Review your lease.", warning: expect.stringContaining("could not be saved") });
  });
});
