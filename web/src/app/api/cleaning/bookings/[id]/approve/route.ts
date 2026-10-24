import { ApproveCleaningBookingInputSchema } from "@/contracts/cleaning";
import { approveCleaningBooking } from "@/server/tools/cleaning";
import { badRequest, cleaningContext, errorResponse, readJson, simulatedJson } from "../../../_lib/http";

// POST /api/cleaning/bookings/:id/approve  { payloadHash, idempotencyKey } -> simulated BookingResult.
// Called from the user's approve action: the hash binds it to the exact proposal they reviewed.
const bodySchema = ApproveCleaningBookingInputSchema.omit({ proposalId: true });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest("Expected a JSON body { payloadHash, idempotencyKey }");
  try {
    const result = await approveCleaningBooking({ proposalId: id, ...parsed.data }, cleaningContext(request));
    return simulatedJson({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
