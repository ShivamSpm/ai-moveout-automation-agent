import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CleaningRequestInput, ExclusionCode, FindCleaningQuotesResult } from "@/contracts/cleaning";
import { CLEANING_CATALOG_FIXTURE } from "@/server/integrations/cleaning-catalog-fixture";
import {
  CatalogUnavailableError,
  FixtureCleaningCatalog,
  SupabaseCleaningCatalog,
  catalogFromEnv,
  type CleaningProviderCatalog,
} from "@/server/integrations/cleaning-catalog";
import { SimulatedCleaningMarketplace } from "@/server/integrations/cleaning-simulator";
import {
  InMemoryCleaningRepository,
  approveCleaningBooking,
  findCleaningQuotes,
  proposeCleaningBooking,
  type CleaningContext,
} from "@/server/tools/cleaning";
import { renderSeedRow } from "./cleaning-catalog-sql";

const NOW = new Date("2026-11-02T17:00:00Z");
const SUPABASE_URL = "https://example-project.supabase.co";
const ENDPOINT = `${SUPABASE_URL}/rest/v1/cleaning_providers?select=*&active=eq.true`;

function request(overrides: Partial<CleaningRequestInput> = {}): CleaningRequestInput {
  return {
    requesterRole: "renter",
    serviceArea: { kind: "zip", zip: "94110" },
    bedrooms: 2,
    bathrooms: 1,
    leaseRequirements: {},
    itemsRemaining: { count: 0, hasBulky: false },
    window: { earliestStart: "2026-11-09T15:00:00Z", latestFinish: "2026-11-14T02:00:00Z" },
    ...overrides,
  };
}

function ctx(catalog: CleaningProviderCatalog = new FixtureCleaningCatalog()): CleaningContext {
  return { ownerId: "owner-a", now: () => NOW, repository: new InMemoryCleaningRepository(), provider: new SimulatedCleaningMarketplace(catalog) };
}

function codesFor(result: FindCleaningQuotesResult, slug: string): ExclusionCode[] {
  return result.excluded.find((e) => e.provider.id === slug)?.reasons.map((r) => r.code) ?? [];
}

const matched = (result: FindCleaningQuotesResult) => result.matches.map((q) => q.providerId);

describe("catalog filtering", () => {
  it("matches several companies for a plain request and never lists inactive ones", async () => {
    const result = await findCleaningQuotes(request(), ctx());
    expect(result.catalogSource).toBe("fixture");
    expect(result.matches.length).toBeGreaterThanOrEqual(3);
    const listed = [...matched(result), ...result.excluded.map((e) => e.provider.id)];
    expect(listed).not.toContain("sparrowgate-cleaning");
    expect(listed).toHaveLength(CLEANING_CATALOG_FIXTURE.filter((row) => row.active).length);
  });

  const rules: Array<[ExclusionCode, Partial<CleaningRequestInput>, string[]]> = [
    ["outside_service_area", {}, ["brassbell-cleaners", "saltmarsh-sweep", "mistral-hill-housekeeping"]],
    ["carpet_not_offered", { leaseRequirements: { carpetCleaning: true } }, ["otterbay-shine", "tallowpine-cleaners"]],
    ["inside_appliances_not_offered", { leaseRequirements: { insideAppliances: true } }, ["bluefinch-cleaning-collective"]],
    ["windows_not_offered", { leaseRequirements: { windows: true } }, ["bluefinch-cleaning-collective"]],
    ["walls_not_offered", { leaseRequirements: { walls: true } }, ["otterbay-shine", "juniper-fog-cleaning"]],
    ["pets_not_accepted", { access: { pets: true } }, ["kitefield-cleaning", "tallowpine-cleaners"]],
    ["insufficient_notice", {}, ["wrenmoor-move-out-crew"]],
    ["no_availability", {}, ["hollowreed-home-services"]],
  ];

  it.each(rules)("excludes with %s", async (code, extra, slugs) => {
    const result = await findCleaningQuotes(request(extra), ctx());
    for (const slug of slugs) {
      expect(codesFor(result, slug), slug).toContain(code);
      expect(matched(result)).not.toContain(slug);
    }
    for (const entry of result.excluded) {
      for (const reason of entry.reasons) expect(reason.detail.length).toBeGreaterThan(0);
    }
  });

  it("lists every rule a company fails, not just the first", async () => {
    const result = await findCleaningQuotes(request({ leaseRequirements: { carpetCleaning: true }, access: { pets: true } }), ctx());
    expect(codesFor(result, "tallowpine-cleaners")).toEqual(["carpet_not_offered", "pets_not_accepted"]);
  });

  it("excludes over-budget companies with the quote attached", async () => {
    const result = await findCleaningQuotes(request({ maxBudgetUsd: 200 }), ctx());
    const over = result.excluded.filter((e) => e.reasons.some((r) => r.code === "over_budget"));
    expect(over.length).toBeGreaterThan(0);
    for (const entry of over) expect(entry.quote!.priceUsd.totalUsd).toBeGreaterThan(200);
    for (const quote of result.matches) expect(quote.priceUsd.totalUsd).toBeLessThanOrEqual(200);
  });

  it("offers only slots that start at or after item removal (SERV-06)", async () => {
    const removal = "2026-11-11T20:00:00Z";
    const result = await findCleaningQuotes(
      request({ itemsRemaining: { count: 3, hasBulky: true, removalCompleteBy: removal }, window: { earliestStart: removal, latestFinish: "2026-11-14T02:00:00Z" } }),
      ctx(),
    );
    const slots = result.matches.flatMap((q) => q.slots);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) expect(Date.parse(slot.start)).toBeGreaterThanOrEqual(Date.parse(removal));
  });

  it("offers afternoon slots when the window starts at local noon, and books one", async () => {
    // 2026-11-09 12:00 to 18:00 PST.
    const c = ctx();
    const result = await findCleaningQuotes(request({ window: { earliestStart: "2026-11-09T20:00:00Z", latestFinish: "2026-11-10T02:00:00Z" } }), c);
    expect(result.matches.length).toBeGreaterThan(0);
    for (const slot of result.matches.flatMap((q) => q.slots)) {
      expect(Date.parse(slot.start)).toBeGreaterThanOrEqual(Date.parse("2026-11-09T20:00:00Z"));
      expect(Date.parse(slot.end)).toBeLessThanOrEqual(Date.parse("2026-11-10T02:00:00Z"));
    }
    const quote = result.matches[0];
    const proposal = await proposeCleaningBooking({ quote, slotId: quote.slots[quote.slots.length - 1].slotId }, c);
    const booked = await approveCleaningBooking(
      { proposalId: proposal.id, payloadHash: proposal.payloadHash, idempotencyKey: proposal.idempotencyKey },
      c,
    );
    expect(booked.status).toBe("simulated_confirmed");
  });

  it("skips the ZIP rule for a city and says so", async () => {
    const result = await findCleaningQuotes(request({ serviceArea: { kind: "city", city: "San Francisco" } }), ctx());
    expect(result.excluded.flatMap((e) => e.reasons.map((r) => r.code))).not.toContain("outside_service_area");
    expect(result.warnings.join(" ")).toMatch(/ZIP/);
  });
});

describe("catalog adapters", () => {
  it("skips an invalid row with a warning naming the slug and field, and keeps the rest", async () => {
    const rows = [{ ...CLEANING_CATALOG_FIXTURE[0], service_zips: ["9411"] }, ...CLEANING_CATALOG_FIXTURE.slice(1)];
    const listing = await new FixtureCleaningCatalog(rows).listActive();
    expect(listing.rows.map((r) => r.slug)).not.toContain(CLEANING_CATALOG_FIXTURE[0].slug);
    expect(listing.rows.length).toBe(CLEANING_CATALOG_FIXTURE.filter((r) => r.active).length - 1);
    expect(listing.warnings).toHaveLength(1);
    expect(listing.warnings[0]).toContain("quillfeather-home-care");
    expect(listing.warnings[0]).toContain("service_zips");

    const result = await findCleaningQuotes(request(), ctx(new FixtureCleaningCatalog(rows)));
    expect(result.catalogWarnings.join(" ")).toContain("quillfeather-home-care");
  });

  it("rejects a catalog where every row is invalid with a typed error", async () => {
    const bad = [{ ...CLEANING_CATALOG_FIXTURE[0], rating: 7 }];
    await expect(new FixtureCleaningCatalog(bad).listActive()).rejects.toMatchObject({ kind: "invalid_payload" });
    const missing = [{ ...CLEANING_CATALOG_FIXTURE[0], slug: undefined }];
    await expect(new FixtureCleaningCatalog(missing).listActive()).rejects.toBeInstanceOf(CatalogUnavailableError);
    const notSimulated = [{ ...CLEANING_CATALOG_FIXTURE[0], is_simulated: false }];
    await expect(new FixtureCleaningCatalog(notSimulated).listActive()).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it("calls PostgREST with the publishable key and labels results as supabase", async () => {
    const fetchMock = vi.fn(async () => Response.json(CLEANING_CATALOG_FIXTURE.filter((row) => row.active)));
    const catalog = new SupabaseCleaningCatalog({ url: `${SUPABASE_URL}/`, publishableKey: "sb_publishable_test", fetch: fetchMock });
    const result = await findCleaningQuotes(request(), ctx(catalog));
    expect(result.catalogSource).toBe("supabase");
    expect(result.matches.length).toBeGreaterThan(0);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ apikey: "sb_publishable_test" });
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("falls back to the labeled fixture when the table is not in Supabase yet (PGRST205)", async () => {
    const missing = vi.fn(async () =>
      Response.json({ code: "PGRST205", message: "Could not find the table 'public.cleaning_providers' in the schema cache" }, { status: 404 }),
    );
    const catalog = new SupabaseCleaningCatalog({ url: SUPABASE_URL, publishableKey: "k", fetch: missing as unknown as typeof fetch });
    const result = await findCleaningQuotes(request(), ctx(catalog));
    expect(result.catalogSource).toBe("fixture");
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.catalogWarnings.join(" ")).toMatch(/cleaning_providers table was not found in Supabase/);
  });

  it("keeps auth, server and network failures as typed errors with no fallback", async () => {
    const make = (impl: () => Promise<Response>) =>
      new SupabaseCleaningCatalog({ url: SUPABASE_URL, publishableKey: "k", fetch: vi.fn(impl) as unknown as typeof fetch });
    for (const status of [401, 403, 500, 503]) {
      await expect(make(async () => Response.json({ message: "no" }, { status })).listActive()).rejects.toMatchObject({ kind: "http", status });
    }
    await expect(findCleaningQuotes(request(), ctx(make(async () => new Response("", { status: 401 }))))).rejects.toBeInstanceOf(
      CatalogUnavailableError,
    );
    await expect(make(async () => { throw new TypeError("fetch failed"); }).listActive()).rejects.toMatchObject({ kind: "network" });
    await expect(make(async () => Response.json({ rows: [] })).listActive()).rejects.toMatchObject({ kind: "invalid_payload" });
  });

  it("picks the catalog from the environment", () => {
    expect(catalogFromEnv({}).source).toBe("fixture");
    const env = { NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" };
    expect(catalogFromEnv(env).source).toBe("supabase");
    expect(catalogFromEnv({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL }).source).toBe("fixture");
    expect(catalogFromEnv({ ...env, CLEANING_CATALOG_SOURCE: "fixture" }).source).toBe("fixture");
  });
});

describe("cleaning_providers migration", () => {
  const dir = path.resolve(__dirname, "../../../supabase/migrations");
  const file = readdirSync(dir).find((name) => /^\d{14}_cleaning_providers\.sql$/.test(name));
  const sql = file ? readFileSync(path.join(dir, file), "utf8") : "";

  it("seeds exactly the fixture rows", () => {
    expect(file).toBeDefined();
    for (const row of CLEANING_CATALOG_FIXTURE) expect(sql, row.slug).toContain(renderSeedRow(row));
    expect(sql.match(/'::uuid/g)).toHaveLength(CLEANING_CATALOG_FIXTURE.length);
  });

  it("is read-only for clients: RLS on, one select policy, no write policies", () => {
    expect(sql).toMatch(/alter table public\.cleaning_providers enable row level security;/);
    expect(sql.match(/create policy/g)).toHaveLength(1);
    expect(sql).toMatch(/for select to anon, authenticated\s+using \(active\);/);
    expect(sql).not.toMatch(/for (insert|update|delete|all)\b/);
    expect(sql).toMatch(/check \(is_simulated\)/);
  });

  it("mirrors the zod row constraints in SQL checks", () => {
    expect(sql).toMatch(/array_position\(service_zips, null\) is null/);
    expect(sql).toContain("array_to_string(service_zips, ',') ~ '^[0-9]{5}(,[0-9]{5})*$'");
    expect(sql).toMatch(/cancellation_policy text not null check \(length\(cancellation_policy\) between 1 and 500\)/);
    expect(sql).toMatch(/notes text check \(notes is null or length\(notes\) <= 500\)/);
    expect(sql).toMatch(/revoke all on public\.cleaning_providers from anon, authenticated;/);
  });

  it("holds no contact details or street addresses in the seed", () => {
    expect(sql.indexOf("insert into")).toBeGreaterThan(0);
    const withoutIds = sql.slice(sql.indexOf("insert into")).replace(/'[0-9a-f-]{36}'::uuid/g, "");
    expect(withoutIds).not.toMatch(/@|https?:\/\/|\(\d{3}\)|\d{3}-\d{4}|\b\d+ [A-Z][a-z]+ (St|Ave|Blvd|Street|Avenue)\b/);
  });
});
