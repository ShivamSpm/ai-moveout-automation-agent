import { z } from "zod";
import { CLEANING_CATALOG_FIXTURE } from "./cleaning-catalog-fixture";

export const CATALOG_SOURCES = ["supabase", "fixture"] as const;
export type CatalogSource = (typeof CATALOG_SOURCES)[number];

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

export class CatalogUnavailableError extends Error {
  override name = "CatalogUnavailableError";
  constructor(
    readonly kind: "http" | "network" | "invalid_payload",
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface CatalogListing {
  /** Where these rows came from; shown with every result so fixture data never passes as database data. */
  source: CatalogSource;
  rows: ProviderRow[];
  /** Skipped rows and fallbacks, for the user and the operator. */
  warnings: string[];
}

export interface CleaningProviderCatalog {
  /** The configured source; a listing may still report "fixture" after a labeled fallback. */
  readonly source: CatalogSource;
  listActive(): Promise<CatalogListing>;
}

/**
 * Validates rows one at a time: an invalid row is skipped with a warning naming its slug and field,
 * so one bad row cannot take the catalog down. A non-empty payload with no valid row is an error.
 */
function parseRows(payload: unknown, source: CatalogSource): CatalogListing {
  if (!Array.isArray(payload)) throw new CatalogUnavailableError("invalid_payload", "cleaning_providers did not return an array");
  const rows: ProviderRow[] = [];
  const warnings: string[] = [];
  payload.forEach((raw: unknown, index) => {
    const parsed = ProviderRowSchema.safeParse(raw);
    if (parsed.success) {
      if (parsed.data.active) rows.push(parsed.data);
      return;
    }
    const slug = (raw as { slug?: unknown } | null)?.slug;
    const name = typeof slug === "string" && /^[a-z0-9-]{1,60}$/.test(slug) ? slug : `row #${index}`;
    const issue = parsed.error.issues[0];
    warnings.push(`Skipped catalog row "${name}": ${issue?.path.join(".") || "(row)"} ${issue?.message ?? "is invalid"}`);
  });
  if (payload.length > 0 && rows.length === 0 && warnings.length === payload.length) {
    throw new CatalogUnavailableError("invalid_payload", `every cleaning_providers row failed validation; first: ${warnings[0]}`);
  }
  return { source, rows, warnings };
}

export const TABLE_NOT_FOUND_WARNING =
  "The cleaning_providers table was not found in Supabase (migration not applied), so the built-in fixture catalog was used.";

/** PostgREST answers 404 with code PGRST205 when the table in the URI is not in its schema cache. */
async function isTableMissing(response: Response): Promise<boolean> {
  if (response.status !== 404) return false;
  const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
  return body === null || body.code === undefined || body.code === "PGRST205";
}

export interface SupabaseCatalogOptions {
  url: string;
  publishableKey: string;
  /** Used, and labeled, only when the table does not exist yet. */
  fallback?: CleaningProviderCatalog;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Reads the public catalog through PostgREST with the publishable key; RLS limits it to active rows. */
export class SupabaseCleaningCatalog implements CleaningProviderCatalog {
  readonly source = "supabase" as const;
  readonly #endpoint: string;
  readonly #key: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #fallback: CleaningProviderCatalog;

  constructor({ url, publishableKey, fallback = new FixtureCleaningCatalog(), fetch: fetchImpl = fetch, timeoutMs = 5000 }: SupabaseCatalogOptions) {
    this.#fallback = fallback;
    this.#endpoint = `${url.replace(/\/+$/, "")}/rest/v1/cleaning_providers?select=*&active=eq.true`;
    this.#key = publishableKey;
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
  }

  async listActive(): Promise<CatalogListing> {
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "GET",
        headers: { apikey: this.#key, Accept: "application/json" },
        signal: AbortSignal.timeout(this.#timeoutMs),
        cache: "no-store",
      });
    } catch (error) {
      throw new CatalogUnavailableError("network", `cleaning_providers request failed: ${(error as Error).name}`);
    }
    if (await isTableMissing(response)) {
      const listing = await this.#fallback.listActive();
      return { ...listing, warnings: [TABLE_NOT_FOUND_WARNING, ...listing.warnings] };
    }
    // Auth, permission and server errors are not "not provisioned": no fallback, so they surface as 503.
    if (!response.ok) throw new CatalogUnavailableError("http", `cleaning_providers returned HTTP ${response.status}`, response.status);
    const payload: unknown = await response.json().catch(() => null);
    return parseRows(payload, this.source);
  }
}

/** The same rows the migration seeds, for tests and for when Supabase is not configured. */
export class FixtureCleaningCatalog implements CleaningProviderCatalog {
  readonly source = "fixture" as const;
  constructor(private readonly rows: readonly unknown[] = CLEANING_CATALOG_FIXTURE) {}
  async listActive(): Promise<CatalogListing> {
    return parseRows(structuredClone(this.rows), this.source);
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
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (env.CLEANING_CATALOG_SOURCE?.trim() === "fixture" || !url || !key) return new FixtureCleaningCatalog();
  return new SupabaseCleaningCatalog({ url, publishableKey: key, fetch: fetchImpl });
}
