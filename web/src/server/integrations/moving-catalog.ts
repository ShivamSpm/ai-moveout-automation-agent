import { z } from "zod";
import { MOVING_CATALOG_FIXTURE } from "./moving-catalog-fixture";
import {
  FixtureCatalog,
  PostgrestCatalog,
  supabaseCatalogEnv,
  type ProviderCatalog,
} from "./postgrest-catalog";

const usd = z.number().finite().min(0);
const int = z.number().int();

/**
 * One row of public.moving_providers. Unknown columns are dropped so additive migrations do not
 * break reads; every check here has a matching CHECK constraint in the migration.
 */
export const MovingProviderRowSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
    display_name: z.string().min(1).max(120),
    /** Origin ZIPs the company picks up from. */
    service_zips: z.array(z.string().regex(/^\d{5}$/)).min(1),
    max_distance_miles: int.min(1).max(3_000),
    hourly_rate_per_mover_usd: usd,
    min_hours: z.number().min(0).max(12),
    crew_sizes: z.array(int.min(1).max(12)).min(1),
    truck_capacity_cuft: int.min(100).max(3_000),
    max_trucks: int.min(1).max(4),
    truck_fee_usd: usd,
    travel_fee_usd: usd,
    packing_usd_per_box: usd,
    materials_usd_per_box: usd,
    unpacking_usd_per_box: usd,
    stairs_fee_per_flight_usd: usd,
    long_carry_fee_per_50ft_usd: usd,
    parking_permit_fee_usd: usd,
    disassembly_usd_per_item: usd,
    handles_piano: z.boolean(),
    piano_fee_usd: usd,
    handles_safe: z.boolean(),
    safe_fee_usd: usd,
    handles_pool_table: z.boolean(),
    pool_table_fee_usd: usd,
    handles_artwork: z.boolean(),
    artwork_fee_usd: usd,
    handles_appliance: z.boolean(),
    appliance_fee_usd: usd,
    handles_aquarium: z.boolean(),
    aquarium_fee_usd: usd,
    offers_packing: z.boolean(),
    offers_unpacking: z.boolean(),
    offers_disassembly: z.boolean(),
    offers_storage: z.boolean(),
    storage_usd_per_100cuft_month: usd,
    offers_full_value: z.boolean(),
    /** Full-value protection costs max(full_value_min_usd, declared value * full_value_pct / 100). */
    full_value_pct: z.number().min(0).max(100),
    full_value_min_usd: usd,
    rush_pct: z.number().min(0).max(100),
    rush_window_hours: int.min(0),
    min_notice_hours: int.min(0),
    works_weekdays: z.array(int.min(0).max(6)).min(1),
    day_start_hour: int.min(0).max(23),
    day_end_hour: int.min(1).max(24),
    max_jobs_per_day: int.min(1),
    rating: z.number().min(0).max(5),
    review_count: int.min(0),
    cancellation_policy: z.string().min(1).max(500),
    deposit_pct: z.number().min(0).max(100),
    notes: z.string().max(500).nullable(),
    is_simulated: z.literal(true),
    active: z.boolean(),
  })
  .refine((row) => row.day_start_hour < row.day_end_hour, { message: "day_start_hour must be before day_end_hour" });
export type MovingProviderRow = z.infer<typeof MovingProviderRowSchema>;

/** Column order of the migration's seed INSERT; is_simulated is left to its default. */
export const MOVING_SEED_COLUMNS = Object.keys(MovingProviderRowSchema.shape).filter(
  (column) => column !== "is_simulated",
) as (keyof MovingProviderRow)[];

export type MovingProviderCatalog = ProviderCatalog<MovingProviderRow>;

export interface SupabaseMovingCatalogOptions {
  url: string;
  publishableKey: string;
  fallback?: MovingProviderCatalog;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Reads public.moving_providers through PostgREST with the publishable key; RLS limits it to active rows. */
export class SupabaseMovingCatalog extends PostgrestCatalog<MovingProviderRow> {
  constructor({ fallback = new FixtureMovingCatalog(), ...options }: SupabaseMovingCatalogOptions) {
    super({ ...options, table: "moving_providers", schema: MovingProviderRowSchema, fallback });
  }
}

/** The same rows the migration seeds, for tests and for when Supabase is not configured. */
export class FixtureMovingCatalog extends FixtureCatalog<MovingProviderRow> {
  constructor(rows: readonly unknown[] = MOVING_CATALOG_FIXTURE) {
    super("moving_providers", MovingProviderRowSchema, rows);
  }
}

/** Supabase when configured, otherwise the fixture; MOVING_CATALOG_SOURCE=fixture forces the fixture. */
export function movingCatalogFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): MovingProviderCatalog {
  const config = supabaseCatalogEnv(env, "MOVING_CATALOG_SOURCE");
  return config ? new SupabaseMovingCatalog({ ...config, fetch: fetchImpl }) : new FixtureMovingCatalog();
}
