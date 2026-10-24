import { ApproveMovingBookingInputSchema } from "@/contracts/moving";
import { approveMovingBooking } from "@/server/tools/moving";
import { badRequest, errorResponse, movingContext, readJson, simulatedJson } from "../../../_lib/http";

// POST /api/moving/bookings/:id/approve  { payloadHash, idempotencyKey } -> simulated BookingResult.
// Called from the user's approve action: the hash binds it to the exact proposal they reviewed.
const bodySchema = ApproveMovingBookingInputSchema.omit({ proposalId: true });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest("Expected a JSON body { payloadHash, idempotencyKey }");
  try {
    const result = await approveMovingBooking({ proposalId: id, ...parsed.data }, await movingContext());
    return simulatedJson({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
