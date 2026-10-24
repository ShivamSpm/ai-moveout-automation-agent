import type { ProposeCleaningBookingInput } from "@/contracts/cleaning";
import { proposeCleaningBooking } from "@/server/tools/cleaning";
import { badRequest, cleaningContext, errorResponse, readJson, simulatedJson } from "../_lib/http";

// POST /api/cleaning/bookings  { quote, slotId } -> a pending_review proposal for the user to approve.
// Proposing books nothing; the quote must match one issued to this owner.
export async function POST(request: Request) {
  try {
    const ctx = await cleaningContext();
    const body = await readJson(request);
    if (body === null) return badRequest("Expected a JSON body { quote, slotId }");
    const proposal = await proposeCleaningBooking(body as ProposeCleaningBookingInput, ctx);
    return simulatedJson({ proposal }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
