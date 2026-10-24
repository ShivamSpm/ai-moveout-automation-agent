"use server";

import { z } from "zod";
import { AuthError, requireUser } from "@/server/auth";
import { bookCleaning } from "@/server/services";
import { CleaningToolError } from "@/server/tools/cleaning";

const Choice = z.object({
  providerId: z.string().min(1).max(100),
  slotStart: z.iso.datetime({ offset: true }),
  totalUsd: z.number().min(0).max(100_000),
});

export type BookState =
  | { status: "idle" }
  | { status: "booked"; code: string; providerName: string; slotStart: string; totalUsd: number; disclaimer: string }
  | { status: "error"; message: string };

// The renter reviewed one company, time and price on /services and approved it.
export async function bookCleaningAction(input: unknown): Promise<BookState> {
  const choice = Choice.safeParse(input);
  if (!choice.success) return { status: "error", message: "Pick a company and a time first." };
  try {
    const ctx = await requireUser();
    const result = await bookCleaning(ctx, choice.data);
    if (result.status === "changed") return { status: "error", message: result.message };
    if (result.status === "rejected") return { status: "error", message: result.message };
    return {
      status: "booked",
      code: result.confirmationCode,
      providerName: result.providerName,
      slotStart: result.slot.start,
      totalUsd: result.estimateTotalUsd,
      disclaimer: result.disclaimer,
    };
  } catch (error) {
    if (error instanceof AuthError) return { status: "error", message: "Sign in again to book." };
    if (error instanceof CleaningToolError) return { status: "error", message: error.message };
    console.error(error);
    return { status: "error", message: "The booking could not be completed. Please try again." };
  }
}
