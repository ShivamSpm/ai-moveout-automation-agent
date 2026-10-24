import "server-only";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Telegram Bot API adapter. The bot is the account the selling agent speaks
// through: it posts approved listings to the public sale channel and chats with
// each buyer privately. https://core.telegram.org/bots/api

export class TelegramError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = "TelegramError";
  }
}

export interface TelegramConfig {
  token: string;
  botUsername: string;
  channelId: string;
  webhookSecret: string;
  fetch: typeof fetch;
}

const read = (env: Record<string, string | undefined>, name: string) => env[name]?.trim() || undefined;

export function telegramConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_CHANNEL_ID", "TELEGRAM_WEBHOOK_SECRET"].every(
    (name) => read(env, name),
  );
}

export function readTelegramConfig(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): TelegramConfig {
  const missing = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_CHANNEL_ID", "TELEGRAM_WEBHOOK_SECRET"].filter(
    (name) => !read(env, name),
  );
  if (missing.length) throw new TelegramError(`Telegram is not configured: set ${missing.join(", ")}`, 503);
  return {
    token: read(env, "TELEGRAM_BOT_TOKEN")!,
    botUsername: read(env, "TELEGRAM_BOT_USERNAME")!.replace(/^@/, ""),
    channelId: read(env, "TELEGRAM_CHANNEL_ID")!,
    webhookSecret: read(env, "TELEGRAM_WEBHOOK_SECRET")!,
    fetch: fetchImpl,
  };
}

/** Telegram sends the secret given to setWebhook in this header on every update. */
export function verifyWebhookSecret(header: string | null, config: Pick<TelegramConfig, "webhookSecret">): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(config.webhookSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const apiReply = z.object({ ok: z.boolean(), result: z.unknown().optional(), description: z.string().optional() });

async function call<T>(config: TelegramConfig, method: string, body: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await config.fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    // The request may or may not have reached Telegram; never report it as sent.
    throw new TelegramError(`Telegram ${method} did not complete: ${error instanceof Error ? error.message : error}`);
  }
  const parsed = apiReply.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new TelegramError(`Telegram ${method} returned HTTP ${res.status} with an unreadable body`);
  if (!parsed.data.ok) throw new TelegramError(`Telegram ${method} failed: ${parsed.data.description ?? res.status}`, res.status >= 500 ? 502 : 400);
  return schema.parse(parsed.data.result);
}

const sentMessage = z.object({ message_id: z.number(), chat: z.object({ id: z.number(), username: z.string().optional() }) });
export type SentMessage = z.infer<typeof sentMessage>;

export type InlineKeyboard = { inline_keyboard: { text: string; url: string }[][] };

export function sendMessage(config: TelegramConfig, chatId: string | number, text: string) {
  return call(config, "sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true } }, sentMessage);
}

/** Posts a photo by URL; Telegram downloads it, so a short-lived signed URL is enough. */
export function sendPhoto(config: TelegramConfig, chatId: string | number, photoUrl: string, caption: string, replyMarkup?: InlineKeyboard) {
  return call(config, "sendPhoto", { chat_id: chatId, photo: photoUrl, caption, reply_markup: replyMarkup }, sentMessage);
}

export function editCaption(config: TelegramConfig, chatId: string | number, messageId: number, caption: string, replyMarkup?: InlineKeyboard) {
  return call(config, "editMessageCaption", { chat_id: chatId, message_id: messageId, caption, reply_markup: replyMarkup }, z.unknown());
}

/** Deep link that opens a private chat with the bot about one listing. */
export function startLink(config: Pick<TelegramConfig, "botUsername">, listingId: string): string {
  return `https://t.me/${config.botUsername}?start=${listingId}`;
}

/** Public link to a channel post, when the channel has a public @username. */
export function channelPostUrl(config: Pick<TelegramConfig, "channelId">, messageId: number): string | null {
  return postUrl({ chatId: config.channelId }, messageId);
}

/** Link to a post in a channel or group: public by @username, or t.me/c/ for members of a private supergroup. */
export function postUrl(chat: { chatId: string; username?: string | null }, messageId: number): string | null {
  if (chat.username) return `https://t.me/${chat.username}/${messageId}`;
  if (chat.chatId.startsWith("@")) return `https://t.me/${chat.chatId.slice(1)}/${messageId}`;
  if (chat.chatId.startsWith("-100")) return `https://t.me/c/${chat.chatId.slice(4)}/${messageId}`;
  return null;
}

/** A listing's post is stored as "<chat id>/<message id>"; a bare message id means the default channel. */
export const postRef = (chatId: string, messageId: number) => `${chatId}/${messageId}`;
export function parsePostRef(ref: string, defaultChatId: string): { chatId: string; messageId: number } {
  const at = ref.lastIndexOf("/");
  return at === -1 ? { chatId: defaultChatId, messageId: Number(ref) } : { chatId: ref.slice(0, at), messageId: Number(ref.slice(at + 1)) };
}

/** Opaque, expiring server-issued credential (never an encoded owner ID). */
export function groupLinkUrl(config: Pick<TelegramConfig, "botUsername">, nonce: string): string {
  return `https://t.me/${config.botUsername}?startgroup=${nonce}`;
}

/**
 * Fallback for Telegram apps that add the bot without sending the start code:
 * the seller pastes this in the group. It names the bot so privacy mode delivers it.
 */
export function groupLinkCommand(config: Pick<TelegramConfig, "botUsername">, nonce: string): string {
  return `/link@${config.botUsername} ${nonce}`;
}

// Only the update fields the selling agent reads. Anything else is ignored.
export const TelegramUpdate = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      message_id: z.number(),
      date: z.number(),
      chat: z.object({ id: z.number(), type: z.string(), title: z.string().optional(), username: z.string().optional() }),
      from: z
        .object({ id: z.number(), is_bot: z.boolean(), first_name: z.string().optional(), username: z.string().optional() })
        .optional(),
      text: z.string().optional(),
    })
    .optional(),
});
export type TelegramUpdate = z.infer<typeof TelegramUpdate>;

export type BuyerEvent =
  | { kind: "start"; chatId: string; buyerLabel: string; listingId: string | null }
  | { kind: "text"; chatId: string; buyerLabel: string; text: string }
  | { kind: "unsupported"; chatId: string }
  | { kind: "link_identity"; code: string; userId: string }
  | { kind: "group_link"; userId: string | null; chatId: string; title: string | null; username: string | null; code: string }
  | { kind: "ignored" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalizes an update into what the agent handles: private buyer chats, plus the group-link command. */
export function toBuyerEvent(update: TelegramUpdate): BuyerEvent {
  const m = update.message;
  if (!m || m.from?.is_bot) return { kind: "ignored" };
  if (m.chat.type === "group" || m.chat.type === "supergroup") {
    // "/start@bot <code>" is sent by Telegram when someone adds the bot through the
    // add-to-group link; "/link@bot <code>" is the same code pasted by the seller.
    const link = m.text?.match(/^\/(?:start|link)(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})\s*$/);
    if (!link) return { kind: "ignored" };
    return { kind: "group_link", chatId: String(m.chat.id), title: m.chat.title ?? null, username: m.chat.username ?? null, code: link[1], userId: m.from ? String(m.from.id) : null };
  }
  if (m.chat.type !== "private") return { kind: "ignored" };
  const identity = m.text?.match(/^\/start\s+link_([a-f0-9]{48})\s*$/);
  if (identity && m.from) return { kind: "link_identity", code: identity[1], userId: String(m.from.id) };
  const chatId = String(m.chat.id);
  const buyerLabel = (m.from?.username ? `@${m.from.username}` : m.from?.first_name || `Buyer ${chatId.slice(-4)}`).slice(0, 100);
  if (!m.text) return { kind: "unsupported", chatId };
  const start = m.text.match(/^\/start(?:\s+(\S+))?\s*$/);
  if (start) return { kind: "start", chatId, buyerLabel, listingId: start[1] && UUID.test(start[1]) ? start[1].toLowerCase() : null };
  return { kind: "text", chatId, buyerLabel, text: m.text.slice(0, 2000) };
}
