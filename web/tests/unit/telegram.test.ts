import { describe, expect, it, vi } from "vitest";
import {
  channelPostUrl,
  groupLinkCommand,
  groupLinkUrl,
  parsePostRef,
  postRef,
  postUrl,
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
    expect(channelPostUrl({ channelId: "-1001234" }, 7)).toBe("https://t.me/c/1234/7");
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

describe("group linking", () => {
  const config = readTelegramConfig(env);
  it("builds a group URL with an opaque nonce", () => {
    expect(groupLinkUrl(config, "a".repeat(48))).toBe(`https://t.me/VacateSaleBot?startgroup=${"a".repeat(48)}`);
  });
  it("captures the private-start identity", () => {
    expect(toBuyerEvent(update(`/start link_${"a".repeat(48)}`))).toEqual({ kind: "link_identity", code: "a".repeat(48), userId: "42" });
  });

  it("reads the add-to-group command in a group and ignores other group messages", () => {
    const group = (text: string): TelegramUpdate => ({
      update_id: 2,
      message: { message_id: 1, date: 0, chat: { id: -100555, type: "supergroup", title: "SF Moving Sales" }, from: { id: 7, is_bot: false }, text },
    });
    expect(toBuyerEvent(group("/start@VacateSaleBot abc-123"))).toEqual({
      kind: "group_link",
      chatId: "-100555",
      title: "SF Moving Sales",
      username: null,
      code: "abc-123",
      userId: "7",
    });
    expect(toBuyerEvent(group("anyone selling a desk?"))).toEqual({ kind: "ignored" });
  });

  it("accepts the pasted /link command as the same group link", () => {
    const code = "a".repeat(48);
    expect(groupLinkCommand(config, code)).toBe(`/link@VacateSaleBot ${code}`);
    const pasted: TelegramUpdate = {
      update_id: 3,
      message: { message_id: 2, date: 0, chat: { id: -100555, type: "supergroup", title: "SF Moving Sales" }, from: { id: 7, is_bot: false }, text: groupLinkCommand(config, code) },
    };
    expect(toBuyerEvent(pasted)).toMatchObject({ kind: "group_link", chatId: "-100555", code, userId: "7" });
  });

  it("stores and links posts in groups and in the default channel", () => {
    expect(parsePostRef(postRef("-100555", 12), "@vacate_sale")).toEqual({ chatId: "-100555", messageId: 12 });
    expect(parsePostRef("12", "@vacate_sale")).toEqual({ chatId: "@vacate_sale", messageId: 12 });
    expect(postUrl({ chatId: "-100555" }, 12)).toBe("https://t.me/c/555/12");
    expect(postUrl({ chatId: "-100555", username: "sf_moving" }, 12)).toBe("https://t.me/sf_moving/12");
    expect(postUrl({ chatId: "-555" }, 12)).toBeNull();
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
