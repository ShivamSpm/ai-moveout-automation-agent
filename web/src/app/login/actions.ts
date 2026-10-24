"use server";

import { redirect } from "next/navigation";
import { friendlyAuthError } from "@/lib/auth-errors";
import { safeNextPath } from "@/lib/safe-next";
import { env } from "@/server/env";
import { userClient } from "@/server/supabase";

const safeNext = (next: FormDataEntryValue | null) => safeNextPath(next, "/muse");
const back = (next: string, query: string) => `/login?${query}&next=${encodeURIComponent(next)}`;

export async function signIn(form: FormData) {
  const db = await userClient();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const mode = form.get("mode");
  const next = safeNext(form.get("next"));

  if (mode === "signup") {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      // The confirmation link comes back through /auth/callback on this site, not Supabase's default URL.
      options: { emailRedirectTo: `${env.appUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) redirect(back(next, `error=${encodeURIComponent(friendlyAuthError(error))}`));
    // Supabase hides existing accounts by returning a user with no identities.
    if (data.user?.identities?.length === 0) {
      redirect(back(next, `error=${encodeURIComponent(friendlyAuthError({ code: "user_already_exists" }))}`));
    }
    // Email confirmation is on: no session until the link is opened.
    if (!data.session) redirect(back(next, "notice=confirm"));
    redirect(next);
  }

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) redirect(back(next, `error=${encodeURIComponent(friendlyAuthError(error))}`));
  redirect(next);
}

export async function signOut() {
  const db = await userClient();
  await db.auth.signOut();
  redirect("/login");
}
