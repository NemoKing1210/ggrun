import { describe, expect, it } from "vitest";

import { isValidUrlForNetwork } from "./networks";

describe("isValidUrlForNetwork", () => {
  it("accepts an empty or whitespace-only url for any network", () => {
    expect(isValidUrlForNetwork("twitch", "")).toBe(true);
    expect(isValidUrlForNetwork("github", "   ")).toBe(true);
  });

  it("always accepts a custom url, even malformed", () => {
    expect(isValidUrlForNetwork("custom", "anything at all")).toBe(true);
    expect(isValidUrlForNetwork("custom", "")).toBe(true);
  });

  it("rejects a malformed url for a known network", () => {
    expect(isValidUrlForNetwork("twitch", "not a url")).toBe(false);
    expect(isValidUrlForNetwork("github", "https://")).toBe(false);
  });

  it("accepts the exact host and a real subdomain", () => {
    expect(isValidUrlForNetwork("github", "https://github.com/octocat")).toBe(true);
    expect(isValidUrlForNetwork("github", "https://gist.github.com/abc")).toBe(true);
    expect(isValidUrlForNetwork("twitch", "https://www.twitch.tv/streamer")).toBe(true);
  });

  it("rejects lookalike hosts that merely contain the allowed host", () => {
    expect(isValidUrlForNetwork("twitch", "https://twitch.tv.evil.com")).toBe(false);
    expect(isValidUrlForNetwork("twitch", "https://evil-twitch.tv")).toBe(false);
    expect(isValidUrlForNetwork("github", "https://github.com.evil.example")).toBe(false);
  });

  it("honours the multi-host networks", () => {
    expect(isValidUrlForNetwork("steam", "https://steamcommunity.com/id/x")).toBe(true);
    expect(isValidUrlForNetwork("steam", "https://store.steampowered.com/app/1")).toBe(true);
    expect(isValidUrlForNetwork("steam", "https://example.com")).toBe(false);
    expect(isValidUrlForNetwork("discord", "https://discord.gg/invite")).toBe(true);
    expect(isValidUrlForNetwork("x", "https://twitter.com/user")).toBe(true);
    expect(isValidUrlForNetwork("youtube", "https://youtu.be/abc")).toBe(true);
    expect(isValidUrlForNetwork("youtube", "https://m.youtube.com/watch")).toBe(true);
  });

  it("is case-insensitive on the host", () => {
    expect(isValidUrlForNetwork("twitch", "HTTPS://TWITCH.TV/Foo")).toBe(true);
  });
});
