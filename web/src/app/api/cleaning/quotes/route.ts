import type { CleaningRequestInput } from "@/contracts/cleaning";
import { findCleaningQuotes } from "@/server/tools/cleaning";
import { badRequest, cleaningContext, errorResponse, readJson, simulatedJson } from "../_lib/http";

// POST /api/cleaning/quotes  CleaningRequest -> simulated quotes from the cleaning provider catalog.
// The tool validates the body with CleaningRequestSchema; nothing is reserved or booked.
export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === null) return badRequest("Expected a JSON CleaningRequest body");
  try {
    const result = await findCleaningQuotes(body as CleaningRequestInput, await cleaningContext());
    return simulatedJson({ ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
