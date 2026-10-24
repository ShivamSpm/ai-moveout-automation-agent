import { describe, expect, it, vi } from "vitest";
import {
  channelPostUrl,
  readTelegramConfig,
  sendMessage,
  startLink,
  TelegramError,
  toBuyerEvent,
  verifyWebhookSecret,
  type TelegramUpdate,
} from "@/server/integrations/telegram";

const env = {
  TELEGRAM_BOT_TOKEN: "123:abc",
  TELEGRAM_BOT_USERNAME: "@VacateSaleBot",
  TELEGRAM_CHANNEL_ID: "@vacate_sale",
  TELEGRAM_WEBHOOK_SECRET: "s3cret-value",
};
const LISTING = "0b1e7f52-4a59-4c3e-9d0e-6a3f5b2c1d00";

const update = (text: string | undefined, chatType = "private"): TelegramUpdate => ({
  update_id: 1,
  message: { message_id: 5, date: 0, chat: { id: 42, type: chatType }, from: { id: 42, is_bot: false, first_name: "Sam", username: "sam_buys" }, text },
});

describe("Telegram config", () => {
  it("names every missing variable", () => {
    expect(() => readTelegramConfig({})).toThrow(/TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_CHANNEL_ID, TELEGRAM_WEBHOOK_SECRET/);
  });

  it("builds deep links and public post links", () => {
    const config = readTelegramConfig(env);
    expect(startLink(config, LISTING)).toBe(`https://t.me/VacateSaleBot?start=${LISTING}`);
    expect(channelPostUrl(config, 7)).toBe("https://t.me/vacate_sale/7");
    expect(channelPostUrl({ channelId: "-1001234" }, 7)).toBeNull();
  });

  it("checks the webhook secret header exactly", () => {
    const config = readTelegramConfig(env);
    expect(verifyWebhookSecret("s3cret-value", config)).toBe(true);
    expect(verifyWebhookSecret("s3cret-valuE", config)).toBe(false);
    expect(verifyWebhookSecret(null, config)).toBe(false);
  });
});

describe("toBuyerEvent", () => {
  it("reads a /start deep link with a listing id", () => {
    expect(toBuyerEvent(update(`/start ${LISTING.toUpperCase()}`))).toEqual({ kind: "start", chatId: "42", buyerLabel: "@sam_buys", listingId: LISTING });
  });

  it("treats a /start without a valid id as a start with no listing", () => {
    expect(toBuyerEvent(update("/start hello"))).toMatchObject({ kind: "start", listingId: null });
  });

  it("passes text through and ignores groups, channels and bots", () => {
    expect(toBuyerEvent(update("Is it available?"))).toMatchObject({ kind: "text", text: "Is it available?" });
    expect(toBuyerEvent(update("hi", "group"))).toEqual({ kind: "ignored" });
    expect(toBuyerEvent(update(undefined))).toEqual({ kind: "unsupported", chatId: "42" });
  });
});

describe("sendMessage", () => {
  it("posts to the Bot API and returns the sent message", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, result: { message_id: 9, chat: { id: 42 } } }));
    const config = readTelegramConfig(env, fetchMock as unknown as typeof fetch);
    await expect(sendMessage(config, "42", "hello")).resolves.toMatchObject({ message_id: 9 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(JSON.parse(String(init.body))).toMatchObject({ chat_id: "42", text: "hello" });
  });

  it("surfaces Telegram's error description", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: false, description: "Forbidden: bot was blocked by the user" }, { status: 403 }));
    const config = readTelegramConfig(env, fetchMock as unknown as typeof fetch);
    await expect(sendMessage(config, "42", "hello")).rejects.toThrow(TelegramError);
    await expect(sendMessage(config, "42", "hello")).rejects.toThrow(/blocked by the user/);
  });
});
