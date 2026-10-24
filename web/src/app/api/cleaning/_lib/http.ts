import "server-only";
import { CatalogUnavailableError } from "@/server/integrations/cleaning-catalog";
import { CleaningToolError, createCleaningContext, type CleaningContext, type CleaningErrorCode } from "@/server/tools/cleaning";

const MAX_BODY_CHARS = 64_000;
const DEMO_OWNER_ID = "demo-renter";

const STATUS: Record<CleaningErrorCode, number> = {
  invalid_request: 400,
  not_found: 404,
  conflict: 409,
  quote_expired: 409,
  slot_unavailable: 409,
};

/**
 * The only place a cleaning route learns who is calling. Auth is not on main yet, so every caller
 * is one demo renter. Swap in the Supabase session user here (auth.getUser() on the server) once
 * login lands; never take an owner id from the request body or from model output.
 */
export function resolveOwnerId(request: Request): string {
  void request;
  return DEMO_OWNER_ID;
}

export function cleaningContext(request: Request): CleaningContext {
  return createCleaningContext(resolveOwnerId(request));
}

/** The parsed JSON body, or null when it is missing, too large or not JSON. */
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY_CHARS) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function simulatedJson(body: Record<string, unknown>, status = 200): Response {
  return Response.json({ ...body, simulated: true }, { status });
}

export function badRequest(message: string): Response {
  return simulatedJson({ error: { code: "invalid_request", message } }, 400);
}

/** Maps the typed errors the cleaning tools throw; anything else is a bug and propagates. */
export function errorResponse(error: unknown): Response {
  if (error instanceof CleaningToolError) {
    return simulatedJson({ error: { code: error.code, message: error.message } }, STATUS[error.code]);
  }
  if (error instanceof CatalogUnavailableError) {
    console.error(error);
    return simulatedJson({ error: { code: "catalog_unavailable", message: "The cleaning provider catalog is unavailable" } }, 503);
  }
  throw error;
}
