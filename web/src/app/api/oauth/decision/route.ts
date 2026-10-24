import { userClient } from "@/server/supabase";

// Consent decision for the Supabase OAuth 2.1 server (Claude, Muse and other
// MCP clients signing the renter in).
export async function POST(request: Request) {
  const form = await request.formData();
  const authorizationId = String(form.get("authorization_id") ?? "");
  const decision = form.get("decision");
  const db = await userClient();
  const { data: user } = await db.auth.getUser();
  if (!user.user) return Response.redirect(new URL(`/login?next=/oauth/consent?authorization_id=${authorizationId}`, request.url), 303);
  const result =
    decision === "approve"
      ? await db.auth.oauth.approveAuthorization(authorizationId)
      : await db.auth.oauth.denyAuthorization(authorizationId);
  if (result.error || !result.data?.redirect_url) {
    return Response.json({ error: result.error?.message ?? "Authorization failed" }, { status: 400 });
  }
  return Response.redirect(result.data.redirect_url, 303);
}
