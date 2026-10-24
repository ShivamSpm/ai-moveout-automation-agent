import { z } from "zod";
import { CLEANING_CATALOG_FIXTURE } from "./cleaning-catalog-fixture";
import {
  FixtureCatalog,
  PostgrestCatalog,
  supabaseCatalogEnv,
  tableNotFoundWarning,
  type ProviderCatalog,
} from "./postgrest-catalog";

export {
  CATALOG_SOURCES,
  CatalogUnavailableError,
  type CatalogListing,
  type CatalogSource,
} from "./postgrest-catalog";

const usd = z.number().finite().min(0);
const hour = z.number().int();

/** One row of public.cleaning_providers. Unknown columns are dropped so additive migrations do not break reads. */
export const ProviderRowSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
    display_name: z.string().min(1).max(120),
    service_zips: z.array(z.string().regex(/^\d{5}$/)).min(1),
    base_usd: usd,
    per_bedroom_usd: usd,
    per_bathroom_usd: usd,
    deep_clean_usd: usd,
    carpet_usd_per_room: usd,
    inside_appliances_usd: usd,
    windows_usd: usd,
    walls_usd: usd,
    pet_surcharge_usd: usd,
    no_elevator_surcharge_usd: usd,
    bulky_items_surcharge_usd: usd,
    rush_pct: z.number().finite().min(0).max(100),
    rush_window_hours: hour.min(0),
    offers_carpet: z.boolean(),
    offers_inside_appliances: z.boolean(),
    offers_windows: z.boolean(),
    offers_walls: z.boolean(),
    accepts_pets: z.boolean(),
    min_notice_hours: hour.min(0),
    works_weekdays: z.array(hour.min(0).max(6)).min(1),
    day_start_hour: hour.min(0).max(23),
    day_end_hour: hour.min(1).max(24),
    max_jobs_per_day: hour.min(1),
    rating: z.number().min(0).max(5),
    review_count: hour.min(0),
    cancellation_policy: z.string().min(1).max(500),
    notes: z.string().max(500).nullable(),
    is_simulated: z.literal(true),
    active: z.boolean(),
  })
  .refine((row) => row.day_start_hour < row.day_end_hour, { message: "day_start_hour must be before day_end_hour" });
export type ProviderRow = z.infer<typeof ProviderRowSchema>;

export type CleaningProviderCatalog = ProviderCatalog<ProviderRow>;

export const TABLE_NOT_FOUND_WARNING = tableNotFoundWarning("cleaning_providers");

export interface SupabaseCatalogOptions {
  url: string;
  publishableKey: string;
  /** Used, and labeled, only when the table does not exist yet. */
  fallback?: CleaningProviderCatalog;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Reads public.cleaning_providers through PostgREST with the publishable key; RLS limits it to active rows. */
export class SupabaseCleaningCatalog extends PostgrestCatalog<ProviderRow> {
  constructor({ fallback = new FixtureCleaningCatalog(), ...options }: SupabaseCatalogOptions) {
    super({ ...options, table: "cleaning_providers", schema: ProviderRowSchema, fallback });
  }
}

/** The same rows the migration seeds, for tests and for when Supabase is not configured. */
export class FixtureCleaningCatalog extends FixtureCatalog<ProviderRow> {
  constructor(rows: readonly unknown[] = CLEANING_CATALOG_FIXTURE) {
    super("cleaning_providers", ProviderRowSchema, rows);
  }
}

/**
 * Supabase when its URL and publishable key are set, otherwise the fixture.
 * CLEANING_CATALOG_SOURCE=fixture forces the fixture, e.g. before the migration is applied.
 */
export function catalogFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): CleaningProviderCatalog {
  const config = supabaseCatalogEnv(env, "CLEANING_CATALOG_SOURCE");
  return config ? new SupabaseCleaningCatalog({ ...config, fetch: fetchImpl }) : new FixtureCleaningCatalog();
}
