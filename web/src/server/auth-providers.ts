import "server-only";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { env } from "./env";

const settingsSchema = z.object({ external: z.object({ google: z.boolean().optional(), azure: z.boolean().optional() }) });

export async function enabledAuthProviders() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 120 });
  try {
    const response = await fetch(`${env.supabaseUrl()}/auth/v1/settings`, {
      headers: { apikey: env.supabasePublishableKey() }, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { google: false, azure: false };
    const settings = settingsSchema.parse(await response.json());
    return { google: settings.external.google === true, azure: settings.external.azure === true };
  } catch {
    return { google: false, azure: false };
  }
}
