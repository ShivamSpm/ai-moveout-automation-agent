import { z } from "zod";
import { moveFields } from "./move-fields";

export const depositSchema = z.string().trim()
  .regex(/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/, "Enter a dollar amount, such as $3,950")
  .transform((value) => {
    const [dollars, fraction = ""] = value.replace(/[$,]/g, "").split(".");
    return Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  })
  .pipe(z.number().int().min(0).max(2147483647, "Deposit is too large"));

export function startSchema(signedIn: boolean) {
  return z.object({
    email: signedIn ? z.string().optional() : z.email("Enter your email address"),
    password: signedIn ? z.string().optional() : z.string().min(8, "Use at least 8 characters"),
    ...moveFields,
    moveOutDate: z.iso.date("Enter a valid move-out date"),
    deposit: depositSchema,
    intent: z.enum(["signup", "signin"]).default("signup"),
  });
}

// Explicit allowlist: credentials and files must never enter browser storage or action responses.
export const startDraftSchema = z.object({
  renterName: z.string().max(100).optional(), addressLine2: z.string().max(80).optional(),
  city: z.string().max(100).optional(), region: z.string().max(100).optional(), zip: z.string().max(5).optional(),
  landlordPhone: z.string().max(20).optional(), bedrooms: z.string().max(2).optional(), bathrooms: z.string().max(4).optional(), sqft: z.string().max(5).optional(),
  email: z.string().max(320), address: z.string().max(200), moveOutDate: z.string().max(10),
  propertyManagementCompany: z.string().max(160).optional(),
  deposit: z.string().max(40), landlordName: z.string().max(100), landlordEmail: z.string().max(320),
});
export type StartDraft = z.infer<typeof startDraftSchema>;
// No account needed to begin: a name is enough to open a private guest session.
export const quickStartSchema = z.object({ renterName: z.string().trim().min(1, "Enter your name").max(100) });

export type StartState = {
  status: "idle" | "error" | "confirm_email" | "existing_account" | "success" | "started";
  email?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};
