"use server";

import { z } from "zod";
import { startSchema, type StartState } from "@/lib/start-schema";
import { safeNextPath } from "@/lib/safe-next";
import { requireUser } from "@/server/auth";
import { env } from "@/server/env";
import { updateMove } from "@/server/marketplace";
import { userClient } from "@/server/supabase";

export async function saveStart(_previous: StartState, form: FormData): Promise<StartState> {
  try {
    const db = await userClient();
    const { data: identity } = await db.auth.getUser();
    const parsed = startSchema(Boolean(identity.user)).safeParse(Object.fromEntries(form));
    if (!parsed.success) return { status: "error", fieldErrors: z.flattenError(parsed.error).fieldErrors };
    const input = parsed.data;
    if (!identity.user) {
      const email = input.email!;
      const password = input.password!;
      if (input.intent === "signin") {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) return { status: "existing_account", message: "Sign-in failed. Check your email and password, and confirm your account if needed." };
      } else {
        const next = safeNextPath("/start?resume=1", "/start");
        const { data, error } = await db.auth.signUp({ email, password, options: {
          emailRedirectTo: `${env.appUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
        } });
        if (error?.code === "user_already_exists" || /already (registered|exists)/i.test(error?.message ?? "") || data.user?.identities?.length === 0) {
          return { status: "existing_account", email, message: "This email already has an account. Sign in instead." };
        }
        if (error) return { status: "error", message: "Could not create your account. Please try again or sign in instead." };
        if (!data.session) return { status: "confirm_email", email };
      }
    }
    const ctx = await requireUser();
    await updateMove(ctx, {
      addressPrivate: input.address, moveOutDate: input.moveOutDate, depositCents: input.deposit,
      landlordName: input.landlordName, landlordEmail: input.landlordEmail,
    });
    return { status: "success" };
  } catch {
    return { status: "error", message: "Your move could not be saved. Please try again; if your account was created, sign in instead." };
  }
}
