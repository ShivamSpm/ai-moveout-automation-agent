import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./db/database.types";
import { env } from "./env";

export type Db = SupabaseClient<Database>;

// User-scoped client: every query runs as the signed-in renter, so RLS applies.
export async function userClient(): Promise<Db> {
  const store = await cookies();
  return createServerClient<Database>(env.supabaseUrl(), env.supabasePublishableKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component; the proxy refreshes the session cookie.
        }
      },
    },
  });
}

// Client bound to a bearer access token (MCP and tests). Still user-scoped.
export function tokenClient(accessToken: string): Db {
  return createClient<Database>(env.supabaseUrl(), env.supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Secret-key client. Used only to call owner-scoped database functions
// (credentials, Muse bridge) with an owner id the server resolved itself from
// a verified session or connector token. Never pass a model- or
// client-supplied user id here.
export function serviceClient() {
  return createClient<Database>(env.supabaseUrl(), env.supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
