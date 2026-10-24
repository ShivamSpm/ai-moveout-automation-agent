"use server";

import { AuthError, requireUser } from "@/server/auth";
import { CallError, startLandlordCall } from "@/server/landlord-calls";

export type PlaceCallState = { status: "idle" | "placed" | "error"; callId?: string; message?: string };

// The renter clicked "Approve & call" after reading the exact script on /calls.
export async function placeLandlordCall(): Promise<PlaceCallState> {
  try {
    const ctx = await requireUser();
    const callId = await startLandlordCall(ctx);
    return { status: "placed", callId };
  } catch (error) {
    if (error instanceof AuthError) return { status: "error", message: "Sign in again to place the call." };
    if (error instanceof CallError) return { status: "error", message: error.message };
    console.error(error);
    return { status: "error", message: "The call could not be placed. Please try again." };
  }
}
