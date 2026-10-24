import "server-only";
import { AuthError, requireUser } from "@/server/auth";
import { CatalogUnavailableError } from "@/server/integrations/postgrest-catalog";
import { SimulatedServiceError, type ServiceErrorCode } from "@/server/tools/simulated-booking";

// HTTP helpers shared by the simulated service routes (cleaning, moving).

const MAX_BODY_CHARS = 64_000;

const STATUS: Record<ServiceErrorCode, number> = {
  invalid_request: 400,
  not_found: 404,
  conflict: 409,
  quote_expired: 409,
  slot_unavailable: 409,
};

// Session identity is the only authority for simulated service state; never take an owner id
// from the request body or from model output. Throws AuthError when nobody is signed in.
export async function resolveOwnerId(): Promise<string> {
  return (await requireUser()).user.id;
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

/** Maps the typed errors the simulated service tools throw; anything else is a bug and propagates. */
export function errorResponse(error: unknown, catalogLabel = "provider catalog"): Response {
  if (error instanceof AuthError) return simulatedJson({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
  if (error instanceof SimulatedServiceError) {
    return simulatedJson({ error: { code: error.code, message: error.message } }, STATUS[error.code]);
  }
  if (error instanceof CatalogUnavailableError) {
    console.error(error);
    return simulatedJson({ error: { code: "catalog_unavailable", message: `The ${catalogLabel} is unavailable` } }, 503);
  }
  throw error;
}
