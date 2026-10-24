import { z } from "zod";

// Move details captured after sign-in. Same rules as the CHECK constraints in
// supabase/migrations/20261024221500_move_details.sql.

const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export const PHONE_PATTERN = /^\+?[0-9 ().-]{7,20}$/;

export const moveDetailsSchema = z.object({
  renterName: z.string().trim().min(1, "Enter your name").max(100),
  moveOutDate: z.iso.date("Pick your move-out day on the calendar"),
  address: z.string().trim().min(1, "Enter the address you're leaving").max(200),
  zip: z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit ZIP code"),
  bedrooms: z.coerce.number().int().min(0, "0 for a studio").max(10),
  bathrooms: z.coerce.number().min(0.5).max(10).multipleOf(0.5, "Use whole or half baths, such as 1 or 1.5"),
  sqft: z.preprocess(blankToUndefined, z.coerce.number().int().min(100, "At least 100 sq ft").max(20000).optional()),
  landlordName: z.string().trim().min(1, "Enter the landlord or manager's name").max(100),
  landlordPhone: z
    .string()
    .trim()
    .regex(PHONE_PATTERN, "Enter a phone number, such as (415) 555-0134")
    .refine((v) => v.replace(/\D/g, "").length >= 7, "Enter a phone number, such as (415) 555-0134"),
  landlordEmail: z.preprocess(blankToUndefined, z.email("Enter a valid email or leave it blank").optional()),
});

export type MoveDetails = z.infer<typeof moveDetailsSchema>;

export type MoveDetailsState = {
  status: "idle" | "error" | "saved";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};
