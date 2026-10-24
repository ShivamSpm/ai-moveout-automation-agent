import { z } from "zod";
import { toE164 } from "./phone";
const optionalNumber = (schema: z.ZodNumber) => z.preprocess(v => v === "" || v === undefined ? undefined : Number(v), schema.optional());
export const PHONE_PATTERN = /^\+?[0-9 ().-]{7,20}$/;
// Accepts whatever was typed and keeps only the number, as E.164 ("+14155550134").
export const landlordPhoneSchema = z.string().trim().max(40)
  .transform((v, ctx) => {
    const e164 = toE164(v);
    if (!e164) { ctx.addIssue({ code: "custom", message: "Enter a 10-digit phone number with the area code" }); return z.NEVER; }
    return e164;
  });
export const moveFields = {
  renterName: z.string().trim().min(1, "Enter your name").max(100),
  address: z.string().trim().min(1, "Enter your street address").max(160),
  addressLine2: z.string().trim().max(80).optional(),
  city: z.string().trim().min(1, "Enter your city").max(100),
  region: z.string().trim().min(1, "Enter your state or region").max(100),
  zip: z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit ZIP code"),
  propertyManagementCompany: z.string().trim().max(160).optional(),
  landlordName: z.string().trim().min(1, "Enter the landlord or manager's name").max(100),
  landlordEmail: z.email("Enter the landlord or property manager's email"),
  landlordPhone: z.preprocess(v => v === "" ? undefined : v, landlordPhoneSchema.optional()),
  bedrooms: optionalNumber(z.number().int().min(0).max(10)),
  bathrooms: optionalNumber(z.number().min(0.5).max(10).multipleOf(0.5)),
  sqft: optionalNumber(z.number().int().min(100).max(20000)),
};
export function fullAddress(input: { address: string; addressLine2?: string; city: string; region: string; zip: string }) {
  return [input.address, input.addressLine2, input.city, `${input.region} ${input.zip}`].filter(Boolean).join(", ");
}
// Legacy full addresses remain intact if they cannot be safely split. No inferred data is written.
export function addressFields(move: { address_private: string | null; address_line1: string | null; address_line2: string | null; city: string | null; region: string | null; zip: string | null }) {
  const legacy = !move.address_line1 ? move.address_private?.match(/^(.+),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5})$/) : null;
  return { address: move.address_line1 ?? legacy?.[1] ?? move.address_private ?? "", addressLine2: move.address_line2 ?? "", city: move.city ?? legacy?.[2] ?? "", region: move.region ?? legacy?.[3] ?? "", zip: move.zip ?? legacy?.[4] ?? "" };
}
