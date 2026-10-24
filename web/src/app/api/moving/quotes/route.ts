import type { MovingRequestInput } from "@/contracts/moving";
import { findMovingQuotes } from "@/server/tools/moving";
import { badRequest, errorResponse, movingContext, readJson, simulatedJson } from "../_lib/http";

// POST /api/moving/quotes  MovingRequest -> simulated quotes from the moving provider catalog.
// The tool validates the body with MovingRequestSchema; nothing is reserved or booked.
export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === null) return badRequest("Expected a JSON MovingRequest body");
  try {
    const result = await findMovingQuotes(body as MovingRequestInput, await movingContext());
    return simulatedJson({ ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
