import type { ProposeMovingBookingInput } from "@/contracts/moving";
import { proposeMovingBooking } from "@/server/tools/moving";
import { badRequest, errorResponse, movingContext, readJson, simulatedJson } from "../_lib/http";

// POST /api/moving/bookings  { quote, slotId } -> a pending_review proposal for the user to approve.
// Proposing books nothing; the quote must match one issued to this owner.
export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === null) return badRequest("Expected a JSON body { quote, slotId }");
  try {
    const proposal = await proposeMovingBooking(body as ProposeMovingBookingInput, await movingContext());
    return simulatedJson({ proposal }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
