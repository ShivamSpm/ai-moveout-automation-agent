import { BookingRequestSchema } from "@/contracts/services";
import { bookService } from "@/server/services";

// POST /api/services/book: the user approved one quote; ask the agent to book it.
export async function POST(request: Request) {
  const parsed = BookingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Expected { kind, provider_id, price_usd, date, idempotency_key }" }, { status: 400 });
  }
  return Response.json(await bookService(parsed.data));
}
