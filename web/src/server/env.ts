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
  appUrl: () => read("APP_URL") ?? "http://localhost:3000",
  openRouterKey: () => read("OPENROUTER_API_KEY"),
  openRouterModel: () => read("OPENROUTER_MODEL") ?? "anthropic/claude-sonnet-5.5",
  googleClientId: () => read("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => read("GOOGLE_CLIENT_SECRET"),
};

function required(name: string): string {
  const value = read(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function providerStatus() {
  return {
    model: env.openRouterKey() ? "configured" : "not_configured",
    google: env.googleClientId() && env.googleClientSecret() ? "configured" : "not_configured",
  } as const;
}
