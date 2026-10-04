import { afterEach, describe, expect, it, vi } from "vitest";

import { isProviderConfigured } from "./provider";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isProviderConfigured", () => {
  it("requires the rawg env key", () => {
    vi.stubEnv("RAWG_API_KEY", "");
    expect(isProviderConfigured("rawg")).toBe(false);

    vi.stubEnv("RAWG_API_KEY", "key");
    expect(isProviderConfigured("rawg")).toBe(true);
  });

  it("requires both IGDB env vars", () => {
    vi.stubEnv("IGDB_CLIENT_ID", "id");
    vi.stubEnv("IGDB_CLIENT_SECRET", "");
    expect(isProviderConfigured("igdb")).toBe(false);

    vi.stubEnv("IGDB_CLIENT_SECRET", "secret");
    expect(isProviderConfigured("igdb")).toBe(true);
  });

  it("requires the steam and gamespot env keys", () => {
    vi.stubEnv("STEAM_WEB_API_KEY", "");
    vi.stubEnv("GAMESPOT_API_KEY", "");
    expect(isProviderConfigured("steam")).toBe(false);
    expect(isProviderConfigured("gamespot")).toBe(false);

    vi.stubEnv("STEAM_WEB_API_KEY", "s");
    vi.stubEnv("GAMESPOT_API_KEY", "g");
    expect(isProviderConfigured("steam")).toBe(true);
    expect(isProviderConfigured("gamespot")).toBe(true);
  });

  it("treats freetogame and any other provider as configured", () => {
    vi.stubEnv("RAWG_API_KEY", "");
    expect(isProviderConfigured("freetogame")).toBe(true);
    expect(isProviderConfigured("internal")).toBe(true);
  });
});
