import { a2aTransport, callContext } from "@/server/muse/a2a";
import { BridgeError } from "@/server/muse/bridge";
import { resolveCaller } from "@/server/connector/identity";

// A2A 1.0 JSON-RPC endpoint for the renter's Muse agent (or any A2A client).
export async function POST(request: Request) {
  let ownerId: string;
  try {
    const caller = await resolveCaller(request.headers.get("authorization"));
    ownerId = caller.kind === "executor" ? caller.owner.ownerId : caller.ctx.user.id;
  } catch (e) {
    const status = e instanceof BridgeError ? e.status : 401;
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: e instanceof Error ? e.message : "Unauthorized" } },
      { status },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const version = request.headers.get("a2a-version") ?? new URL(request.url).searchParams.get("A2A-Version");
  const result = await a2aTransport().handle(body as Record<string, unknown>, callContext({ ownerId }, version));
  if (typeof (result as AsyncGenerator)[Symbol.asyncIterator] === "function") {
    return Response.json(
      { jsonrpc: "2.0", id: (body as { id?: unknown }).id ?? null, error: { code: -32004, message: "Streaming is not supported" } },
    );
  }
  return Response.json(result);
}

