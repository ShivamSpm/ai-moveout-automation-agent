import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/server/connector/mcp";
import { resolveCaller, unauthorized } from "@/server/connector/identity";

// Stateless Streamable HTTP MCP endpoint: a fresh server per request, bound to
// the caller verified from the Authorization header.
async function handle(request: Request) {
  let caller;
  try {
    caller = await resolveCaller(request.headers.get("authorization"));
  } catch (e) {
    return unauthorized(e instanceof Error ? e.message : "Unauthorized");
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = buildMcpServer(caller);
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
