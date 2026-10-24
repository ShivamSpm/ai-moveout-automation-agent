import { z } from "zod";

import { moveFields } from "./move-fields";
import { depositSchema } from "./start-schema";
export { PHONE_PATTERN } from "./move-fields";
export const moveDetailsSchema = z.object({ ...moveFields, moveOutDate: z.iso.date("Pick your move-out day"), deposit: depositSchema });

export type MoveDetails = z.infer<typeof moveDetailsSchema>;

export type MoveDetailsState = {
  status: "idle" | "error" | "saved";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};
