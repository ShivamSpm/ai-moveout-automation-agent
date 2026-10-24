"use server";

import { redirect } from "next/navigation";
import { userClient } from "@/server/supabase";

// Same-origin paths only. Parsing (rather than prefix checks) also rejects
// "/\\evil.example", which browsers treat as a protocol-relative URL.
function safeNext(next: FormDataEntryValue | null): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.includes("\\")) return "/muse";
  try {
    const url = new URL(next, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return "/muse";
    // Check the normalized result too: "/..//evil.example" normalizes to "//evil.example".
    const out = `${url.pathname}${url.search}${url.hash}`;
    return out.startsWith("/") && !out.startsWith("//") && !out.includes("\\") ? out : "/muse";
  } catch {
    return "/muse";
  }
}

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
