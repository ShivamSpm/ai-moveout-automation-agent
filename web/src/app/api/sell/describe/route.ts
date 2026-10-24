import { AuthError, requireUser } from "@/server/auth";
import { isConfigured } from "@/server/integrations/openrouter";
import { slidingWindow } from "@/server/rate-limit";
import { describeItemPhoto } from "@/server/tools/describe-item";

// POST /api/sell/describe  multipart { photo } -> { title, description }
// A suggestion for the renter to edit; nothing is stored.

export const maxDuration = 60;

const perRenter = slidingWindow(20, 10 * 60_000);

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = (await requireUser()).user.id;
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: "Sign in first" }, { status: 401 });
    throw error;
  }
  if (!perRenter.check(userId).allowed) return Response.json({ error: "Too many photos; try again shortly" }, { status: 429 });
  if (!isConfigured()) return Response.json({ error: "Photo suggestions need OPENROUTER_API_KEY" }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File)) return Response.json({ error: "Attach one photo as \"photo\"" }, { status: 400 });
  try {
    const result = await describeItemPhoto({ bytes: new Uint8Array(await photo.arrayBuffer()), mimeType: photo.type });
    if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
    return Response.json(result.value);
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not describe the photo" }, { status: 503 });
  }
}
