import { MOVING_SEED_COLUMNS, type MovingProviderRow } from "../../src/server/integrations/moving-catalog";

// Renders fixture rows as the VALUES tuples seeded by the moving_providers migration. The drift test
// checks the migration contains exactly these tuples; the same function wrote them.

const ARRAY_TYPES: Partial<Record<keyof MovingProviderRow, string>> = {
  service_zips: "text[]",
  crew_sizes: "smallint[]",
  works_weekdays: "smallint[]",
};

function literal(column: keyof MovingProviderRow, value: unknown): string {
  if (value === null) return "null";
  const arrayType = ARRAY_TYPES[column];
  if (arrayType === "text[]") return `array[${(value as string[]).map((v) => `'${v}'`).join(",")}]::text[]`;
  if (arrayType) return `array[${(value as number[]).join(",")}]::${arrayType}`;
  if (column === "id") return `'${value}'::uuid`;
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  return String(value);
}

export function renderMovingSeedRow(row: MovingProviderRow): string {
  return `(${MOVING_SEED_COLUMNS.map((column) => literal(column, row[column])).join(", ")})`;
}
