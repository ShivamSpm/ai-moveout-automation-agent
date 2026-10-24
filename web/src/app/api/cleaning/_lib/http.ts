import "server-only";
import { AuthError, requireUser } from "@/server/auth";
import { CatalogUnavailableError } from "@/server/integrations/cleaning-catalog";
import { CleaningToolError, createCleaningContext, type CleaningContext, type CleaningErrorCode } from "@/server/tools/cleaning";

const MAX_BODY_CHARS = 64_000;


const STATUS: Record<CleaningErrorCode, number> = {
  invalid_request: 400,
  not_found: 404,
  conflict: 409,
  quote_expired: 409,
  slot_unavailable: 409,
};

// Session identity is the only authority for simulated service state.
export async function resolveOwnerId(): Promise<string> {
  return (await requireUser()).user.id;
}
export async function cleaningContext(): Promise<CleaningContext> {
  return createCleaningContext(await resolveOwnerId());
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
  if (error instanceof AuthError) return simulatedJson({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
  if (error instanceof CleaningToolError) {
    return simulatedJson({ error: { code: error.code, message: error.message } }, STATUS[error.code]);
  }
  if (error instanceof CatalogUnavailableError) {
    console.error(error);
    return simulatedJson({ error: { code: "catalog_unavailable", message: "The cleaning provider catalog is unavailable" } }, 503);
  }
  throw error;
}
