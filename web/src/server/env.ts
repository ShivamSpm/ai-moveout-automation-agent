import "server-only";

// Server configuration. Values are read lazily so a missing provider shows up
// as a visible "not configured" state instead of crashing unrelated pages.

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY"),
  appUrl: () => read("APP_URL") ?? vercelUrl() ?? "http://localhost:3000",
  googleClientId: () => read("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => read("GOOGLE_CLIENT_SECRET"),
};

// On Vercel, advertise the URL the deployment is reached at: the production
// domain in production, the branch alias on previews. APP_URL overrides both.
function vercelUrl(): string | undefined {
  const host =
    read("VERCEL_ENV") === "production"
      ? read("VERCEL_PROJECT_PRODUCTION_URL")
      : (read("VERCEL_BRANCH_URL") ?? read("VERCEL_URL"));
  return host ? `https://${host}` : undefined;
}

function required(name: string): string {
  const value = read(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function providerStatus() {
  return {
    google: env.googleClientId() && env.googleClientSecret() ? "configured" : "not_configured",
  } as const;
}
