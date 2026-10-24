import { z } from "zod";

// What the agent container returns when it searches for cleaning (or moving)
// services and books one. The web app only displays these; the agent owns the
// search, the quotes and the choice. Extra fields are ignored, so the agent can
// add more without breaking the page.

export const ServiceKindSchema = z.enum(["cleaning", "movers"]);
export type ServiceKind = z.infer<typeof ServiceKindSchema>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const ProviderSchema = z.object({
  id: z.string().min(1), // e.g. Google Maps place id
  name: z.string().min(1),
  rating: z.number().min(0).max(5).nullable(),
  review_count: z.number().int().min(0).nullable(),
  neighborhood: z.string().nullable(),
  website: z.string().nullable(),
  maps_url: z.string().nullable(),
});
export type Provider = z.infer<typeof ProviderSchema>;

export const QuoteSchema = z.object({
  provider: ProviderSchema,
  price_usd: z.number().min(0),
  earliest_date: IsoDate, // first day they can come
  includes: z.array(z.string()),
  before_deadline: z.boolean(),
  within_budget: z.boolean(),
  note: z.string(), // why the agent ranked it where it did
  simulated: z.boolean(), // true until real quotes come from the provider
});
export type Quote = z.infer<typeof QuoteSchema>;

export const ServiceSearchResultSchema = z.object({
  kind: ServiceKindSchema,
  location: z.string(), // city-level area searched, never the street address
  deadline: IsoDate, // the service has to be done by this day
  budget_usd: z.number().min(0).nullable(),
  home: z.object({ bedrooms: z.number().min(0), sqft: z.number().min(0) }),
  source: z.enum(["apify", "sample"]), // where the provider list came from
  searched_at: z.string(),
  quotes: z.array(QuoteSchema),
  recommended_id: z.string().nullable(), // provider.id the agent picked
  explanation: z.string(), // one or two sentences for the user
});
export type ServiceSearchResult = z.infer<typeof ServiceSearchResultSchema>;

/** Request body the web app sends to book the option the user approved. */
export const BookingRequestSchema = z.object({
  kind: ServiceKindSchema,
  provider_id: z.string().min(1),
  price_usd: z.number().min(0),
  date: IsoDate,
  idempotency_key: z.string().min(8),
});
export type BookingRequest = z.infer<typeof BookingRequestSchema>;

export const BookingResultSchema = z.object({
  order_ref: z.string(),
  status: z.enum(["simulated", "requested", "booked"]),
  provider_website: z.string().nullable(),
  message: z.string(),
});
export type BookingResult = z.infer<typeof BookingResultSchema>;
