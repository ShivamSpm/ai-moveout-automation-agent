import { getMoveView } from "@/server/move-view";
import { renterContext } from "@/lib/move-summary";
import type { ToolContext } from "@/server/auth";
import { runAgent, type AgentMessage } from "@/server/agent/agent";
import { AuthError, requireUser } from "@/server/auth";
import { isConfigured, OpenRouterError } from "@/server/integrations/openrouter";
import { slidingWindow } from "@/server/rate-limit";
import { photoProblem } from "@/server/tools/identify-items";
import type { ToolPhoto } from "@/server/agent/tools";
import { CHAT_MESSAGE_FIELD, CHAT_PHOTO_FIELD, type ChatResponse } from "@/contracts/agent-events";

// POST /api/chat  { messages: [{ role: "user" | "assistant", content }] }, or multipart with
// "message" and an optional "photo" -> ChatResponse { reply, events, warning? }
// Signed-in renters only: every call spends model credits.
// Saved history comes from the authenticated account; only the latest submitted turn is accepted.

export const maxDuration = 60;

const MAX_MESSAGES = 40;
const MAX_CHARS = 10_000;
// Model or catalog configuration missing; matched by name so route tests can mock the modules.
const CONFIG_ERRORS = new Set(["OpenRouterConfigError", "SpendCapConfigError", "MissingPricingError"]);
const perRenter = slidingWindow(20, 10 * 60_000);

export async function POST(request: Request) {
  let ctx: ToolContext;
  try {
    ctx = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: "Sign in to chat" }, { status: 401 });
    throw error;
  }
  const limited = perRenter.check(ctx.user.id);
  if (!limited.allowed) {
    return Response.json(
      { error: "Too many messages; try again shortly" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  if (!isConfigured()) {
    return Response.json({ error: "Agent not configured: set OPENROUTER_API_KEY" }, { status: 503 });
  }

  const parsed = await parseRequest(request);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  const { messages, photo } = parsed;

  try {
    const view = await getMoveView(ctx);
    if (!view.move) return Response.json({ error: "Save your move details first" }, { status: 409 });
    // Prior assistant turns come only from the saved conversation, never client claims.
    const history = view.chat.filter((m): m is AgentMessage => m.role === "user" || m.role === "assistant");
    const latest = messages[messages.length - 1];
    const result = await runAgent([...history, latest], request.signal, renterContext(view), { ownerId: ctx.user.id, photo });
    const savedAt = Date.now();
    const saved = await ctx.db.from("chat_messages").insert([
      { move_id: view.move.id, role: "user", content: latest.content, created_at: new Date(savedAt).toISOString() },
      { move_id: view.move.id, role: "assistant", content: result.reply, created_at: new Date(savedAt + 1).toISOString() },
    ]);
    const body: ChatResponse = {
      reply: result.reply,
      events: result.events ?? [],
      ...(saved.error ? { warning: "Reply received, but this conversation could not be saved. It may be missing after refresh." } : {}),
    };
    return Response.json(body);
  } catch (error) {
    if (error instanceof Error && CONFIG_ERRORS.has(error.name)) {
      console.error(error);
      return Response.json({ error: "Agent not configured" }, { status: 503 });
    }
    if (error instanceof OpenRouterError) {
      console.error(error);
      return Response.json({ error: "The model call failed" }, { status: 502 });
    }
    throw error;
  }
}

type ParsedRequest = { messages: AgentMessage[]; photo: ToolPhoto | null } | { error: string };

async function parseRequest(request: Request): Promise<ParsedRequest> {
  if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const messages = parseMessages(await request.json().catch(() => null));
    return messages ? { messages, photo: null } : { error: "Expected { messages: [{ role, content }] } ending with a user message" };
  }
  const form = await request.formData().catch(() => null);
  if (!form) return { error: "Malformed multipart body" };
  const message = form.get(CHAT_MESSAGE_FIELD);
  if (typeof message !== "string" || !message.trim() || message.length > MAX_CHARS) {
    return { error: `Expected a non-empty "${CHAT_MESSAGE_FIELD}" field of at most ${MAX_CHARS} characters` };
  }
  const file = form.get(CHAT_PHOTO_FIELD);
  let photo: ToolPhoto | null = null;
  if (file !== null) {
    if (typeof file === "string") return { error: `"${CHAT_PHOTO_FIELD}" must be a file` };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const problem = photoProblem(bytes, file.type);
    if (problem) return { error: problem };
    photo = { bytes, mimeType: file.type };
  }
  return { messages: [{ role: "user", content: message }], photo };
}

function parseMessages(body: unknown): AgentMessage[] | null {
  const raw = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;

  const messages: AgentMessage[] = [];
  for (const m of raw) {
    const { role, content } = (m ?? {}) as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || !content.trim() || content.length > MAX_CHARS) return null;
    messages.push({ role, content });
  }
  return messages[messages.length - 1].role === "user" ? messages : null;
}
