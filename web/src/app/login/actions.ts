"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";
import { userClient } from "@/server/supabase";

const safeNext = (next: FormDataEntryValue | null) => safeNextPath(next, "/muse");

export async function signIn(form: FormData) {
  const db = await userClient();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const mode = form.get("mode");
  const next = safeNext(form.get("next"));
  const { error } =
    mode === "signup"
      ? await db.auth.signUp({ email, password })
      : await db.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function signOut() {
  const db = await userClient();
  await db.auth.signOut();
  redirect("/login");
}
