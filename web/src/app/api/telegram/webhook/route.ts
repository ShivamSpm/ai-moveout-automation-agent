import { after } from "next/server";
import { readTelegramConfig, TelegramError, TelegramUpdate, verifyWebhookSecret } from "@/server/integrations/telegram";
import { handleTelegramUpdate } from "@/server/selling/telegram-sales";

// POST /api/telegram/webhook: Telegram delivers buyer messages here (set with
// setWebhook and a secret_token; see web/README.md). It answers 200 at once and
// handles the update after the response, so a slow model call never makes
// Telegram redeliver; repeated update_ids are ignored anyway.

export const maxDuration = 60;

export async function POST(request: Request) {
  let config;
  try {
    config = readTelegramConfig();
  } catch (error) {
    if (error instanceof TelegramError) return Response.json({ error: error.message }, { status: 503 });
    throw error;
  }
  if (!verifyWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token"), config)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const update = TelegramUpdate.safeParse(await request.json().catch(() => null));
  if (!update.success) return Response.json({ ok: true, ignored: "unrecognized update" });
  after(async () => {
    try {
      await handleTelegramUpdate(update.data);
    } catch (error) {
      console.error("telegram update failed", update.data.update_id, error);
    }
  });
  return Response.json({ ok: true });
}
