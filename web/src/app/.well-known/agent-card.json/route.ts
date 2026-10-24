import { connection } from "next/server";
import { agentCard } from "@/server/muse/a2a";

// Rendered per request so each deployment or tunnel advertises its own URL.
export async function GET() {
  await connection();
  return Response.json(agentCard(), { headers: { "cache-control": "public, max-age=300" } });
}
