import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSiteSettings: vi.fn(),
  undiciFetch: vi.fn(),
  agents: [] as Array<{ url: string; closed: boolean; close: () => Promise<void> }>,
}));

vi.mock("@/lib/modules/site-settings/repository/site-settings", () => ({
  getSiteSettings: h.getSiteSettings,
}));

vi.mock("undici", () => ({
  ProxyAgent: class {
    url: string;
    closed = false;
    constructor(url: string) {
      this.url = url;
      h.agents.push(this);
    }
    close(): Promise<void> {
      this.closed = true;
      return Promise.resolve();
    }
  },
  fetch: h.undiciFetch,
}));

import {
  fetchExternal,
  getEffectiveProxy,
  isProxyEnabled,
  resetProxyAgent,
} from "./external-fetch";

const fakeResponse = { ok: true, status: 200 } as unknown as Response;

beforeEach(() => {
  h.getSiteSettings.mockReset();
  // Default: DB unreachable, so every scenario resolves through env.
  h.getSiteSettings.mockRejectedValue(new Error("db unreachable"));
  h.undiciFetch.mockReset();
  h.undiciFetch.mockResolvedValue(fakeResponse);
  h.agents.length = 0;
  resetProxyAgent();
  vi.stubEnv("PROXY_URL", "");
});

afterEach(() => {
  resetProxyAgent();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getEffectiveProxy", () => {
  it("prefers the DB URL when the DB says the proxy is enabled", async () => {
    h.getSiteSettings.mockResolvedValue({ proxyEnabled: true, proxyUrl: " http://db-proxy:8080 " });
    vi.stubEnv("PROXY_URL", "http://env-proxy:1");

    await expect(getEffectiveProxy()).resolves.toEqual({
      url: "http://db-proxy:8080",
      enabled: true,
    });
  });

  it("falls back to the env URL when the DB is enabled but has no URL", async () => {
    h.getSiteSettings.mockResolvedValue({ proxyEnabled: true, proxyUrl: "   " });
    vi.stubEnv("PROXY_URL", "http://env-proxy:1");

    await expect(getEffectiveProxy()).resolves.toEqual({
      url: "http://env-proxy:1",
      enabled: true,
    });
  });

  it("ignores the DB URL when the DB proxy switch is off", async () => {
    h.getSiteSettings.mockResolvedValue({ proxyEnabled: false, proxyUrl: "http://db-proxy:8080" });
    vi.stubEnv("PROXY_URL", "http://env-proxy:1");

    await expect(getEffectiveProxy()).resolves.toEqual({
      url: "http://env-proxy:1",
      enabled: true,
    });
  });

  it("uses env only and trims it when the DB read throws", async () => {
    vi.stubEnv("PROXY_URL", "  http://env-proxy:9  ");
    await expect(getEffectiveProxy()).resolves.toEqual({
      url: "http://env-proxy:9",
      enabled: true,
    });
  });

  it("reports no proxy when neither source provides one", async () => {
    await expect(getEffectiveProxy()).resolves.toEqual({ url: null, enabled: false });
  });

  it("ignores a non-string DB proxyUrl and whitespace env values", async () => {
    h.getSiteSettings.mockResolvedValue({ proxyEnabled: true, proxyUrl: 42 });
    vi.stubEnv("PROXY_URL", "   ");
    await expect(getEffectiveProxy()).resolves.toEqual({ url: null, enabled: false });
  });

  it("treats a truthy non-boolean DB switch as enabled", async () => {
    h.getSiteSettings.mockResolvedValue({ proxyEnabled: 1, proxyUrl: "http://db-proxy" });
    await expect(getEffectiveProxy()).resolves.toEqual({ url: "http://db-proxy", enabled: true });
  });
});

describe("isProxyEnabled", () => {
  it("mirrors the enabled flag of the effective proxy", async () => {
    vi.stubEnv("PROXY_URL", "http://env-proxy:1");
    await expect(isProxyEnabled()).resolves.toBe(true);

    vi.stubEnv("PROXY_URL", "");
    await expect(isProxyEnabled()).resolves.toBe(false);
  });
});

describe("fetchExternal without a proxy", () => {
  it("delegates to global fetch and does not touch undici", async () => {
    const globalFetch = vi.fn().mockResolvedValue(fakeResponse);
    vi.stubGlobal("fetch", globalFetch);

    await expect(fetchExternal("https://api.test/x")).resolves.toBe(fakeResponse);

    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(h.undiciFetch).not.toHaveBeenCalled();
  });

  it("retries an idempotent GET once on a network error", async () => {
    const globalFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(fakeResponse);
    vi.stubGlobal("fetch", globalFetch);

    await expect(fetchExternal("https://api.test/x", { method: "GET" })).resolves.toBe(fakeResponse);
    expect(globalFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry a POST", async () => {
    const globalFetch = vi.fn().mockRejectedValue(new Error("socket hang up"));
    vi.stubGlobal("fetch", globalFetch);

    await expect(fetchExternal("https://api.test/x", { method: "POST" })).rejects.toThrow(
      "socket hang up",
    );
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });
});

describe("fetchExternal through a proxy", () => {
  beforeEach(() => {
    vi.stubEnv("PROXY_URL", "http://proxy:3128");
  });

  it("uses undici fetch, strips Next cache extensions and attaches the ProxyAgent", async () => {
    const init = { method: "GET", next: { revalidate: 60 }, cache: "force-cache" } as RequestInit;

    await expect(fetchExternal("https://api.test/x", init)).resolves.toBe(fakeResponse);

    expect(h.undiciFetch).toHaveBeenCalledTimes(1);
    const [target, opts] = h.undiciFetch.mock.calls[0] as [string, Record<string, unknown>];
    expect(target).toBe("https://api.test/x");
    expect(opts).not.toHaveProperty("next");
    expect(opts).not.toHaveProperty("cache");
    expect(opts.dispatcher).toBe(h.agents[0]);
    expect(h.agents[0]?.url).toBe("http://proxy:3128");
  });

  it("retries a proxied GET once but never a POST", async () => {
    h.undiciFetch.mockRejectedValueOnce(new Error("gateway reset")).mockResolvedValueOnce(fakeResponse);
    await expect(fetchExternal("https://api.test/x")).resolves.toBe(fakeResponse);
    expect(h.undiciFetch).toHaveBeenCalledTimes(2);

    h.undiciFetch.mockReset();
    h.undiciFetch.mockRejectedValue(new Error("gateway reset"));
    await expect(fetchExternal("https://api.test/x", { method: "POST" })).rejects.toThrow(
      "gateway reset",
    );
    expect(h.undiciFetch).toHaveBeenCalledTimes(1);
  });

  it("caches the agent per proxy URL and closes the old one when it changes", async () => {
    await fetchExternal("https://a.test");
    await fetchExternal("https://b.test");
    expect(h.agents).toHaveLength(1);

    vi.stubEnv("PROXY_URL", "http://proxy-2:3128");
    await fetchExternal("https://c.test");

    expect(h.agents).toHaveLength(2);
    expect(h.agents[0]?.closed).toBe(true);
    expect(h.agents[1]?.closed).toBe(false);
  });

  it("drops the cached agent on reset so the next call builds a fresh one", async () => {
    await fetchExternal("https://a.test");
    const first = h.agents[0]!;

    resetProxyAgent();
    expect(first.closed).toBe(true);

    await fetchExternal("https://b.test");
    expect(h.agents).toHaveLength(2);
    expect(h.agents[1]?.closed).toBe(false);
  });
});
