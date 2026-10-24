import "server-only";

import type { User } from "@supabase/supabase-js";
import { tokenClient, userClient, type Db } from "./supabase";

// Identity always comes from the verified session, never from tool arguments.
export interface ToolContext {
  db: Db;
  user: User;
}

export class AuthError extends Error {
  status = 401;
}

export async function requireUser(): Promise<ToolContext> {
  const db = await userClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new AuthError("Sign in required");
  return { db, user: data.user };
}

export async function requireBearer(header: string | null): Promise<ToolContext> {
  const token = header?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new AuthError("Bearer token required");
  const db = tokenClient(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new AuthError("Invalid token");
  return { db, user: data.user };
}
