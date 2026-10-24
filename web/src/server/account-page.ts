import "server-only";
import { redirect } from "next/navigation";
import { AuthError, requireUser } from "./auth";
export async function accountPageUser(next: string) {
  try { return await requireUser(); }
  catch (error) { if (error instanceof AuthError) redirect(`/login?next=${encodeURIComponent(next)}`); throw error; }
}
