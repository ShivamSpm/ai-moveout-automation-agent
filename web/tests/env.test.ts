import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/server/env";

describe("env.appUrl", () => {
  beforeEach(() => {
    for (const key of ["APP_URL", "VERCEL_ENV", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_BRANCH_URL", "VERCEL_URL"]) {
      vi.stubEnv(key, undefined);
    }
  });
  afterEach(() => vi.unstubAllEnvs());

  it("prefers the explicit APP_URL override", () => {
    vi.stubEnv("APP_URL", " https://override.example.test ");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "production.example.test");
    expect(env.appUrl()).toBe("https://override.example.test");
  });
  it("uses the production custom domain supplied by Vercel", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "production.example.test");
    vi.stubEnv("VERCEL_URL", "deployment.vercel.app");
    expect(env.appUrl()).toBe("https://production.example.test");
  });
  it("uses the branch alias on previews even when production is supplied", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "production.example.test");
    vi.stubEnv("VERCEL_BRANCH_URL", "project-git-feature.vercel.app");
    vi.stubEnv("VERCEL_URL", "deployment.vercel.app");
    expect(env.appUrl()).toBe("https://project-git-feature.vercel.app");
  });
  it("falls back to localhost without deployment configuration", () => {
    expect(env.appUrl()).toBe("http://localhost:3000");
  });
});
