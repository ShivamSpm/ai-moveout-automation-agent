"use server";

import { z } from "zod";
import { moveDetailsSchema, type MoveDetailsState } from "@/lib/move-details-schema";
import { AuthError, requireUser } from "@/server/auth";
import { updateMove } from "@/server/marketplace";

export async function saveMoveDetails(_previous: MoveDetailsState, form: FormData): Promise<MoveDetailsState> {
  const parsed = moveDetailsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const d = parsed.data;
  try {
    // Identity comes from the session, never from the form.
    const ctx = await requireUser();
    await updateMove(ctx, {
      renterName: d.renterName,
      moveOutDate: d.moveOutDate,
      addressPrivate: d.address,
      zip: d.zip,
      bedrooms: d.bedrooms,
      bathrooms: d.bathrooms,
      sqft: d.sqft ?? null,
      landlordName: d.landlordName,
      landlordPhone: d.landlordPhone,
      landlordEmail: d.landlordEmail ?? null,
    });
    return { status: "saved" };
  } catch (error) {
    if (error instanceof AuthError) return { status: "error", message: "Your session expired. Sign in again to save." };
    console.error(error);
    return { status: "error", message: "Your move details could not be saved. Please try again." };
  }
}
