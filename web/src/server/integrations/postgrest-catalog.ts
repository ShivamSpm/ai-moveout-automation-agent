import type { z } from "zod";

// A read-only provider catalog table, read through PostgREST with the publishable key (no
// supabase-js), with a labeled in-code fixture for tests, for unconfigured environments and for a
// table whose migration has not been applied yet.

export const CATALOG_SOURCES = ["supabase", "fixture"] as const;
export type CatalogSource = (typeof CATALOG_SOURCES)[number];

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

export interface CatalogListing<Row> {
  /** Where these rows came from; shown with every result so fixture data never passes as database data. */
  source: CatalogSource;
  rows: Row[];
  /** Skipped rows and fallbacks, for the user and the operator. */
  warnings: string[];
}

export interface ProviderCatalog<Row> {
  /** The configured source; a listing may still report "fixture" after a labeled fallback. */
  readonly source: CatalogSource;
  listActive(): Promise<CatalogListing<Row>>;
}

/**
 * Validates rows one at a time: an invalid row is skipped with a warning naming its slug and field,
 * so one bad row cannot take the catalog down. A non-empty payload with no valid row is an error.
 */
export function parseCatalogRows<Row extends { active: boolean }>(
  schema: z.ZodType<Row>,
  table: string,
  payload: unknown,
  source: CatalogSource,
): CatalogListing<Row> {
  if (!Array.isArray(payload)) throw new CatalogUnavailableError("invalid_payload", `${table} did not return an array`);
  const rows: Row[] = [];
  const warnings: string[] = [];
  payload.forEach((raw: unknown, index) => {
    const parsed = schema.safeParse(raw);
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
    throw new CatalogUnavailableError("invalid_payload", `every ${table} row failed validation; first: ${warnings[0]}`);
  }
  return { source, rows, warnings };
}

export function tableNotFoundWarning(table: string): string {
  return `The ${table} table was not found in Supabase (migration not applied), so the built-in fixture catalog was used.`;
}

/** PostgREST answers 404 with code PGRST205 when the table in the URI is not in its schema cache. */
async function isTableMissing(response: Response): Promise<boolean> {
  if (response.status !== 404) return false;
  const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
  return body === null || body.code === undefined || body.code === "PGRST205";
}

export interface PostgrestCatalogOptions<Row> {
  table: string;
  schema: z.ZodType<Row>;
  url: string;
  publishableKey: string;
  /** Used, and labeled, only when the table does not exist yet. */
  fallback: ProviderCatalog<Row>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Reads `table` through PostgREST with the publishable key; RLS limits it to active rows. */
export class PostgrestCatalog<Row extends { active: boolean }> implements ProviderCatalog<Row> {
  readonly source = "supabase" as const;
  readonly #table: string;
  readonly #schema: z.ZodType<Row>;
  readonly #endpoint: string;
  readonly #key: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #fallback: ProviderCatalog<Row>;

  constructor({ table, schema, url, publishableKey, fallback, fetch: fetchImpl = fetch, timeoutMs = 5000 }: PostgrestCatalogOptions<Row>) {
    this.#table = table;
    this.#schema = schema;
    this.#fallback = fallback;
    this.#endpoint = `${url.replace(/\/+$/, "")}/rest/v1/${table}?select=*&active=eq.true`;
    this.#key = publishableKey;
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
  }

  async listActive(): Promise<CatalogListing<Row>> {
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "GET",
        headers: { apikey: this.#key, Accept: "application/json" },
        signal: AbortSignal.timeout(this.#timeoutMs),
        cache: "no-store",
      });
    } catch (error) {
      throw new CatalogUnavailableError("network", `${this.#table} request failed: ${(error as Error).name}`);
    }
    if (await isTableMissing(response)) {
      const listing = await this.#fallback.listActive();
      return { ...listing, warnings: [tableNotFoundWarning(this.#table), ...listing.warnings] };
    }
    // Auth, permission and server errors are not "not provisioned": no fallback, so they surface as 503.
    if (!response.ok) throw new CatalogUnavailableError("http", `${this.#table} returned HTTP ${response.status}`, response.status);
    const payload: unknown = await response.json().catch(() => null);
    return parseCatalogRows(this.#schema, this.#table, payload, this.source);
  }
}

/** The same rows the migration seeds, validated exactly like database rows. */
export class FixtureCatalog<Row extends { active: boolean }> implements ProviderCatalog<Row> {
  readonly source = "fixture" as const;
  constructor(
    private readonly table: string,
    private readonly schema: z.ZodType<Row>,
    private readonly rows: readonly unknown[],
  ) {}
  async listActive(): Promise<CatalogListing<Row>> {
    return parseCatalogRows(this.schema, this.table, structuredClone(this.rows), this.source);
  }
}

/**
 * The Supabase URL and publishable key when both are set and `<SERVICE>_CATALOG_SOURCE` does not
 * force the fixture (e.g. before the migration is applied); otherwise null.
 */
export function supabaseCatalogEnv(
  env: Record<string, string | undefined>,
  overrideVariable: string,
): { url: string; publishableKey: string } | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (env[overrideVariable]?.trim() === "fixture" || !url || !key) return null;
  return { url, publishableKey: key };
}
