import { timingSafeEqual } from "node:crypto";
import { TelegramError } from "@/server/integrations/telegram";
import { applyPriceDrops } from "@/server/selling/telegram-sales";

// GET /api/cron/price-drops: run daily by Vercel Cron (web/vercel.json), which
// sends "Authorization: Bearer $CRON_SECRET". Lowers live Telegram listings
// toward their minimum as move-out approaches; never below it.

export const maxDuration = 60;

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    return Response.json(await applyPriceDrops());
  } catch (error) {
    if (error instanceof TelegramError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
