import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/modules/site-settings/repository/site-settings", () => ({
  getSiteSettings: vi.fn(),
}));

import { getSiteSettings } from "@/lib/modules/site-settings/repository/site-settings";

import {
  getEffectiveProviderKeys,
  isProviderConfiguredAsync,
  listAvailableProviders,
  maskKey,
} from "./keys";

const settings = vi.mocked(getSiteSettings);

/** A full key row; tests override only the columns they care about. */
function dbRow(over: Record<string, unknown> = {}): never {
  return {
    rawgApiKey: null,
    igdbClientId: null,
    igdbClientSecret: null,
    steamApiKey: null,
    gamespotApiKey: null,
    ...over,
  } as never;
}

beforeEach(() => {
  settings.mockReset();
  settings.mockResolvedValue(dbRow());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("maskKey", () => {
  it("returns null for a missing or blank key", () => {
    expect(maskKey(null)).toBeNull();
    expect(maskKey(undefined)).toBeNull();
    expect(maskKey("")).toBeNull();
    expect(maskKey("   ")).toBeNull();
  });

  it("hides everything when the key is too short to reveal a tail", () => {
    expect(maskKey("abcd")).toBe("••••");
    expect(maskKey("a")).toBe("••••");
  });

  it("reveals only the last four characters", () => {
    expect(maskKey("abcdefgh")).toBe("••••efgh");
    expect(maskKey("  abcdefgh  ")).toBe("••••efgh");
  });
});

describe("getEffectiveProviderKeys", () => {
  it("falls back to the environment when the DB columns are empty", async () => {
    vi.stubEnv("RAWG_API_KEY", "env-rawg");
    vi.stubEnv("IGDB_CLIENT_ID", "env-igdb-id");
    vi.stubEnv("IGDB_CLIENT_SECRET", "env-igdb-secret");
    vi.stubEnv("STEAM_WEB_API_KEY", "env-steam");
    vi.stubEnv("GAMESPOT_API_KEY", "env-gs");

    await expect(getEffectiveProviderKeys()).resolves.toEqual({
      rawgApiKey: "env-rawg",
      igdbClientId: "env-igdb-id",
      igdbClientSecret: "env-igdb-secret",
      steamApiKey: "env-steam",
      gamespotApiKey: "env-gs",
    });
  });

  it("lets a non-empty DB value win over the environment", async () => {
    vi.stubEnv("RAWG_API_KEY", "env-rawg");
    settings.mockResolvedValue(dbRow({ rawgApiKey: "db-rawg" }));

    const keys = await getEffectiveProviderKeys();
    expect(keys.rawgApiKey).toBe("db-rawg");
  });

  it("trims values from both sources and treats blanks as absent", async () => {
    vi.stubEnv("RAWG_API_KEY", "  env-rawg  ");
    vi.stubEnv("STEAM_WEB_API_KEY", "   ");
    settings.mockResolvedValue(dbRow({ rawgApiKey: "   ", igdbClientId: "  id  " }));

    const keys = await getEffectiveProviderKeys();
    expect(keys.rawgApiKey).toBe("env-rawg");
    expect(keys.steamApiKey).toBeNull();
    expect(keys.igdbClientId).toBe("id");
  });

  it("ignores non-string DB columns on old rows", async () => {
    settings.mockResolvedValue(dbRow({ rawgApiKey: 123, gamespotApiKey: null }));

    const keys = await getEffectiveProviderKeys();
    expect(keys.rawgApiKey).toBeNull();
  });

  it("returns the environment when reading settings throws", async () => {
    vi.stubEnv("GAMESPOT_API_KEY", "env-gs");
    settings.mockRejectedValue(new Error("db down"));

    const keys = await getEffectiveProviderKeys();
    expect(keys.gamespotApiKey).toBe("env-gs");
  });
});

describe("isProviderConfiguredAsync", () => {
  it("requires a key for rawg, steam and gamespot", async () => {
    settings.mockResolvedValue(dbRow({ rawgApiKey: "k", gamespotApiKey: "g" }));

    await expect(isProviderConfiguredAsync("rawg")).resolves.toBe(true);
    await expect(isProviderConfiguredAsync("steam")).resolves.toBe(false);
    await expect(isProviderConfiguredAsync("gamespot")).resolves.toBe(true);
  });

  it("requires both IGDB credentials", async () => {
    settings.mockResolvedValue(dbRow({ igdbClientId: "id" }));
    await expect(isProviderConfiguredAsync("igdb")).resolves.toBe(false);

    settings.mockResolvedValue(dbRow({ igdbClientId: "id", igdbClientSecret: "secret" }));
    await expect(isProviderConfiguredAsync("igdb")).resolves.toBe(true);
  });

  it("treats freetogame and unknown providers as configured", async () => {
    settings.mockResolvedValue(dbRow());
    await expect(isProviderConfiguredAsync("freetogame")).resolves.toBe(true);
    await expect(isProviderConfiguredAsync("internal")).resolves.toBe(true);
  });
});

describe("listAvailableProviders", () => {
  it("always offers freetogame, and adds the others only when keyed", async () => {
    settings.mockResolvedValue(dbRow({ rawgApiKey: "k", igdbClientId: "id", igdbClientSecret: "s" }));

    await expect(listAvailableProviders()).resolves.toEqual([
      { id: "freetogame", label: "FreeToGame" },
      { id: "rawg", label: "RAWG" },
      { id: "igdb", label: "IGDB" },
    ]);
  });

  it("omits a provider whose key is missing", async () => {
    settings.mockResolvedValue(dbRow({ steamApiKey: "s", gamespotApiKey: "g" }));

    await expect(listAvailableProviders()).resolves.toEqual([
      { id: "freetogame", label: "FreeToGame" },
      { id: "steam", label: "Steam" },
      { id: "gamespot", label: "GameSpot" },
    ]);
  });
});
