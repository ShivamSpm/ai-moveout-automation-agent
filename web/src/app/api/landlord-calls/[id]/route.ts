import { AuthError, requireUser } from "@/server/auth";
import { refreshLandlordCall } from "@/server/landlord-calls";

// GET /api/landlord-calls/:id: the call's current state. While it's in progress
// this checks Bland; when it ends, the checklist is extracted and saved once.
export async function GET(_request: Request, { params }: RouteContext<"/api/landlord-calls/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown call" }, { status: 404 });
  try {
    const ctx = await requireUser();
    return Response.json(await refreshLandlordCall(ctx, id));
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: "Sign in required" }, { status: 401 });
    console.error(error);
    return Response.json({ error: "Could not check the call" }, { status: 502 });
  }
}
