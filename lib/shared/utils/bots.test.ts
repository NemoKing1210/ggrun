import { describe, expect, it } from "vitest";

import { isBotUser, isBotUsername } from "./bots";

describe("isBotUsername", () => {
  it("accepts the bot_<8 hex>_<index> shape", () => {
    expect(isBotUsername("bot_deadbeef_0")).toBe(true);
    expect(isBotUsername("bot_0123abcd_42")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isBotUsername("BOT_DEADBEEF_1")).toBe(true);
    expect(isBotUsername("Bot_DeadBeef_1")).toBe(true);
  });

  it("rejects a prefix or suffix that breaks the shape", () => {
    expect(isBotUsername("notbot_deadbeef_0")).toBe(false);
    expect(isBotUsername("bot_deadbeef_0x")).toBe(false);
    expect(isBotUsername("xbot_deadbeef_0")).toBe(false);
  });

  it("rejects an 8-char run that is not hex", () => {
    expect(isBotUsername("bot_zzzzzzzz_0")).toBe(false);
    expect(isBotUsername("bot_1234abcd_0")).toBe(true);
  });

  it("rejects the wrong hex-prefix length", () => {
    expect(isBotUsername("bot_1234abc_0")).toBe(false);
    expect(isBotUsername("bot_1234abcde_0")).toBe(false);
  });

  it("requires a non-empty numeric index", () => {
    expect(isBotUsername("bot_deadbeef")).toBe(false);
    expect(isBotUsername("bot_deadbeef_")).toBe(false);
  });

  it("treats empty, null, and undefined usernames as non-bots", () => {
    expect(isBotUsername("")).toBe(false);
    expect(isBotUsername(null)).toBe(false);
    expect(isBotUsername(undefined)).toBe(false);
  });
});

describe("isBotUser", () => {
  it("delegates to the username check", () => {
    expect(isBotUser({ username: "bot_deadbeef_7" })).toBe(true);
    expect(isBotUser({ username: "alice" })).toBe(false);
  });

  it("treats a missing user as a non-bot", () => {
    expect(isBotUser(null)).toBe(false);
    expect(isBotUser(undefined)).toBe(false);
  });
});
