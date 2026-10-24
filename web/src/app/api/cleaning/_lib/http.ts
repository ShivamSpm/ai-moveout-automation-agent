import "server-only";
import { errorResponse as serviceErrorResponse, resolveOwnerId } from "@/app/api/_lib/simulated-service";
import { createCleaningContext, type CleaningContext } from "@/server/tools/cleaning";

export { badRequest, readJson, resolveOwnerId, simulatedJson } from "@/app/api/_lib/simulated-service";

export async function cleaningContext(): Promise<CleaningContext> {
  return createCleaningContext(await resolveOwnerId());
}

/** Maps the typed errors the cleaning tools throw; anything else is a bug and propagates. */
export function errorResponse(error: unknown): Response {
  return serviceErrorResponse(error, "cleaning provider catalog");
}
