import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MOVING_CATALOG_FIXTURE } from "@/server/integrations/moving-catalog-fixture";
import {
  FixtureMovingCatalog,
  SupabaseMovingCatalog,
  movingCatalogFromEnv,
} from "@/server/integrations/moving-catalog";
import { CatalogUnavailableError } from "@/server/integrations/postgrest-catalog";
import { renderMovingSeedRow } from "./moving-catalog-sql";

const SUPABASE_URL = "https://example-project.supabase.co";

describe("moving catalog adapters", () => {
  it("reads moving_providers through PostgREST with only the publishable key", async () => {
    const fetchMock = vi.fn(async () => Response.json(MOVING_CATALOG_FIXTURE.filter((r) => r.active)));
    const catalog = new SupabaseMovingCatalog({ url: `${SUPABASE_URL}/`, publishableKey: "sb_publishable_test", fetch: fetchMock });
    const listing = await catalog.listActive();
    expect(listing.source).toBe("supabase");
    expect(listing.rows).toHaveLength(MOVING_CATALOG_FIXTURE.filter((r) => r.active).length);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/moving_providers?select=*&active=eq.true`);
    expect(init.headers).toMatchObject({ apikey: "sb_publishable_test" });
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("falls back to the labeled fixture only when the table is missing (PGRST205)", async () => {
    const missing = vi.fn(async () => Response.json({ code: "PGRST205", message: "Could not find the table" }, { status: 404 }));
    const listing = await new SupabaseMovingCatalog({ url: SUPABASE_URL, publishableKey: "k", fetch: missing as unknown as typeof fetch }).listActive();
    expect(listing.source).toBe("fixture");
    expect(listing.warnings[0]).toMatch(/moving_providers table was not found in Supabase/);
    for (const status of [401, 403, 500]) {
      const failing = vi.fn(async () => Response.json({ message: "no" }, { status }));
      await expect(new SupabaseMovingCatalog({ url: SUPABASE_URL, publishableKey: "k", fetch: failing as unknown as typeof fetch }).listActive()).rejects.toMatchObject({ kind: "http", status });
    }
  });

  it("skips an invalid row with a warning and rejects an all-invalid catalog", async () => {
    const rows = [{ ...MOVING_CATALOG_FIXTURE[0], crew_sizes: [] }, ...MOVING_CATALOG_FIXTURE.slice(1)];
    const listing = await new FixtureMovingCatalog(rows).listActive();
    expect(listing.warnings).toHaveLength(1);
    expect(listing.warnings[0]).toContain(MOVING_CATALOG_FIXTURE[0].slug);
    expect(listing.warnings[0]).toContain("crew_sizes");
    await expect(new FixtureMovingCatalog([{ ...MOVING_CATALOG_FIXTURE[0], is_simulated: false }]).listActive()).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it("picks the catalog from the environment", () => {
    expect(movingCatalogFromEnv({}).source).toBe("fixture");
    const env = { NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" };
    expect(movingCatalogFromEnv(env).source).toBe("supabase");
    expect(movingCatalogFromEnv({ ...env, MOVING_CATALOG_SOURCE: "fixture" }).source).toBe("fixture");
  });
});

describe("moving_providers migration", () => {
  const dir = path.resolve(__dirname, "../../../supabase/migrations");
  const file = readdirSync(dir).find((name) => /^\d{14}_moving_providers\.sql$/.test(name));
  const sql = file ? readFileSync(path.join(dir, file), "utf8") : "";

  it("sorts after the cleaning migration and seeds exactly the fixture rows", () => {
    expect(file).toBeDefined();
    expect(file).toBe("20261024233100_moving_providers.sql");
    // Ordered after the cleaning catalog it builds on; later migrations may follow it.
    const cleaning = readdirSync(dir).find((name) => /^\d{14}_cleaning_providers\.sql$/.test(name));
    expect(cleaning).toBeDefined();
    expect(Number(file!.slice(0, 14))).toBeGreaterThan(Number(cleaning!.slice(0, 14)));
    for (const row of MOVING_CATALOG_FIXTURE) expect(sql, row.slug).toContain(renderMovingSeedRow(row));
    expect(sql.match(/'::uuid/g)).toHaveLength(MOVING_CATALOG_FIXTURE.length);
    expect(MOVING_CATALOG_FIXTURE.length).toBeGreaterThanOrEqual(12);
    for (const row of MOVING_CATALOG_FIXTURE) expect(row.display_name).toMatch(/\(fictional\)$/);
  });

  it("is read-only for clients and mirrors the zod checks", () => {
    expect(sql).toMatch(/alter table public\.moving_providers enable row level security;/);
    expect(sql.match(/create policy/g)).toHaveLength(1);
    expect(sql).toMatch(/for select to anon, authenticated\s+using \(active\);/);
    expect(sql).not.toMatch(/for (insert|update|delete|all)\b/);
    expect(sql).toMatch(/revoke all on public\.moving_providers from anon, authenticated;/);
    expect(sql).toMatch(/using gin \(service_zips\)/);
    expect(sql).toMatch(/check \(is_simulated\)/);
    expect(sql).toContain("array_to_string(service_zips, ',') ~ '^[0-9]{5}(,[0-9]{5})*$'");
    expect(sql).toMatch(/cancellation_policy text not null check \(length\(cancellation_policy\) between 1 and 500\)/);
  });

  it("holds no contact details or street addresses in the seed", () => {
    expect(sql.indexOf("insert into")).toBeGreaterThan(0);
    const seed = sql.slice(sql.indexOf("insert into")).replace(/'[0-9a-f-]{36}'::uuid/g, "");
    expect(seed).not.toMatch(/@|https?:\/\/|\(\d{3}\)|\d{3}-\d{4}|\b\d+ [A-Z][a-z]+ (St|Ave|Blvd|Street|Avenue)\b/);
  });
});
