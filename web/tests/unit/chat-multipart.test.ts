import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), view: vi.fn(), agent: vi.fn(), insert: vi.fn() }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.auth, AuthError: class AuthError extends Error {} }));
vi.mock("@/server/move-view", () => ({ getMoveView: mocks.view }));
vi.mock("@/server/agent/agent", () => ({ runAgent: mocks.agent }));
vi.mock("@/server/integrations/openrouter", () => ({ isConfigured: () => true, OpenRouterError: class OpenRouterError extends Error {} }));
import { POST } from "@/app/api/chat/route";
import { TOOL_DEFINITIONS } from "@/server/agent/tools";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
function multipart(photo?: Blob) {
  const form = new FormData();
  form.set("message", "What is in this photo?");
  if (photo) form.set("photo", photo, "room.png");
  return new Request("http://localhost/api/chat", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner-a" }, db: { from: () => ({ insert: mocks.insert }) } });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.view.mockResolvedValue({ move: { id: "move-a" }, chat: [], tasks: [], findings: [], approvals: [], items: [], listings: [], activity: [] });
  mocks.agent.mockResolvedValue({ reply: "A sofa.", events: [{ type: "tool_error", tool: "x", message: "y" }] });
});

describe("chat multipart", () => {
  it("passes the photo and server owner to the agent and returns events without saving them", async () => {
    const res = await POST(multipart(new Blob([PNG], { type: "image/png" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "A sofa.", events: [{ type: "tool_error", tool: "x", message: "y" }] });
    const turn = mocks.agent.mock.calls[0][3];
    expect(turn.ownerId).toBe("owner-a");
    expect(turn.photo.mimeType).toBe("image/png");
    expect(mocks.insert.mock.calls[0][0].map((r: { content: string }) => r.content)).toEqual(["What is in this photo?", "A sofa."]);
  });

  it("rejects a photo whose bytes do not match its type", async () => {
    const res = await POST(multipart(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    expect(res.status).toBe(400);
    expect(mocks.agent).not.toHaveBeenCalled();
  });

  it("derives tool parameter schemas from the zod inputs", () => {
    const cleaning = TOOL_DEFINITIONS.find((t) => t.function.name === "find_cleaning_quotes")!.function.parameters;
    expect(cleaning).toMatchObject({ type: "object", properties: expect.objectContaining({ bedrooms: expect.anything(), serviceArea: expect.anything() }) });
    expect(cleaning.required).toEqual(expect.arrayContaining(["requesterRole", "bedrooms"]));
  });
});
