import type { ProviderRow } from "../../src/server/integrations/cleaning-catalog";

// Renders fixture rows as the VALUES tuples seeded by the cleaning_providers migration. The drift
// test checks the migration contains exactly these tuples; the same function wrote them.

export const SEED_COLUMNS = [
  "id",
  "slug",
  "display_name",
  "service_zips",
  "base_usd",
  "per_bedroom_usd",
  "per_bathroom_usd",
  "deep_clean_usd",
  "carpet_usd_per_room",
  "inside_appliances_usd",
  "windows_usd",
  "walls_usd",
  "pet_surcharge_usd",
  "no_elevator_surcharge_usd",
  "bulky_items_surcharge_usd",
  "rush_pct",
  "rush_window_hours",
  "offers_carpet",
  "offers_inside_appliances",
  "offers_windows",
  "offers_walls",
  "accepts_pets",
  "min_notice_hours",
  "works_weekdays",
  "day_start_hour",
  "day_end_hour",
  "max_jobs_per_day",
  "rating",
  "review_count",
  "cancellation_policy",
  "notes",
  "active",
] as const satisfies readonly (keyof ProviderRow)[];

function literal(column: (typeof SEED_COLUMNS)[number], value: unknown): string {
  if (value === null) return "null";
  if (column === "service_zips") return `array[${(value as string[]).map((zip) => `'${zip}'`).join(",")}]::text[]`;
  if (column === "works_weekdays") return `array[${(value as number[]).join(",")}]::smallint[]`;
  if (column === "id") return `'${value}'::uuid`;
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  return String(value);
}

export function renderSeedRow(row: ProviderRow): string {
  return `(${SEED_COLUMNS.map((column) => literal(column, row[column])).join(", ")})`;
}
