import "server-only";

import { requireBearer } from "../auth";
import { resolveConnector } from "../muse/bridge";
import { appLink } from "../links";
import type { Caller } from "./mcp";

// vac_ tokens are Muse executor credentials; anything else must be a valid
// Supabase user access token (issued directly or by the OAuth 2.1 server).
export async function resolveCaller(authorization: string | null): Promise<Caller> {
  if (/^Bearer\s+vac_/.test(authorization ?? "")) {
    return { kind: "executor", owner: await resolveConnector(authorization) };
  }
  return { kind: "renter", ctx: await requireBearer(authorization) };
}

export function unauthorized(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": `Bearer resource_metadata="${appLink("/.well-known/oauth-protected-resource")}"`,
    },
  });
}
