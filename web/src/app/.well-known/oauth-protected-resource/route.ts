import { connection } from "next/server";
import { env } from "@/server/env";

// RFC 9728 metadata so MCP clients (Claude, Muse) discover the Supabase
// OAuth 2.1 server and sign the renter in with their own account.
export async function GET() {
  await connection();
  return Response.json({
    resource: `${env.appUrl()}/api/mcp`,
    authorization_servers: [`${env.supabaseUrl()}/auth/v1`],
    bearer_methods_supported: ["header"],
    resource_name: "Vacate move-out agent",
  });
}
