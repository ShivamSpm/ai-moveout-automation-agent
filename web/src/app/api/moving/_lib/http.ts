import "server-only";
import { errorResponse as serviceErrorResponse, resolveOwnerId } from "@/app/api/_lib/simulated-service";
import { createMovingContext, type MovingContext } from "@/server/tools/moving";

export { badRequest, readJson, simulatedJson } from "@/app/api/_lib/simulated-service";

export async function movingContext(): Promise<MovingContext> {
  return createMovingContext(await resolveOwnerId());
}

/** Maps the typed errors the moving tools throw; anything else is a bug and propagates. */
export function errorResponse(error: unknown): Response {
  return serviceErrorResponse(error, "moving provider catalog");
}
