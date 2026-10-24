"use server";

import { z } from "zod";
import { AuthError, requireUser } from "@/server/auth";
import { selectService, type SavedSelection } from "@/server/services";

const Choice = z.object({
  kind: z.enum(["cleaning", "moving"]),
  providerId: z.string().min(1).max(100),
  totalUsd: z.number().min(0).max(100_000),
});

export type SelectResult = { ok: true; saved: SavedSelection } | { ok: false; message: string };

// The renter tapped Select on one company in a section of /services.
export async function selectServiceAction(input: unknown): Promise<SelectResult> {
  const choice = Choice.safeParse(input);
  if (!choice.success) return { ok: false, message: "Pick a company first." };
  try {
    const ctx = await requireUser();
    const { kind, ...pick } = choice.data;
    return await selectService(ctx, kind, pick);
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: "Sign in again to save your choice." };
    console.error(error);
    return { ok: false, message: "Your choice couldn't be saved. Please try again." };
  }
}
