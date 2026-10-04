import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/http/external-fetch", () => ({
  fetchExternal: vi.fn(),
}));
vi.mock("./keys", () => ({
  getEffectiveProviderKeys: vi.fn(),
}));

import { DEFAULT_SEASON_CONFIG } from "@/lib/engine/config/defaults";
import type { GamePoolFilters } from "@/lib/engine/types";
import { fetchExternal } from "@/lib/infrastructure/http/external-fetch";

import { getEffectiveProviderKeys } from "./keys";
import type { ProviderKeys } from "./keys";
import { rawgProvider } from "./rawg";

const fetchMock = vi.mocked(fetchExternal);
const keysMock = vi.mocked(getEffectiveProviderKeys);

function filters(over: Partial<GamePoolFilters> = {}): GamePoolFilters {
  return { ...DEFAULT_SEASON_CONFIG.gamePool.filters, ...over };
}

const KEYS: ProviderKeys = {
  rawgApiKey: "test-key",
  igdbClientId: null,
  igdbClientSecret: null,
  steamApiKey: null,
  gamespotApiKey: null,
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Hades",
    genres: [{ slug: "action" }, { slug: "rpg" }],
    platforms: [{ platform: { slug: "pc" } }],
    background_image: "https://img.example/hades.jpg",
    metacritic: 93,
    rating: 4.5,
    released: "2020-09-17",
    esrb_rating: { slug: "teen" },
    tags: Array.from({ length: 12 }, (_, i) => ({ slug: `tag-${i}` })),
    playtime: 21,
    website: "https://supergiantgames.com",
    stores: [
      { url: "https://store.steampowered.com/app/1145360", store: { slug: "steam", name: "Steam" } },
      { url: null, store: { slug: "gog", name: "GOG" } },
      { url: "https://gog.com/game", store: { slug: "gog", name: "" } },
    ],
    ...over,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  keysMock.mockReset();
  keysMock.mockResolvedValue(KEYS);
});

describe("rawgProvider.search", () => {
  it("returns nothing without an API key, without fetching", async () => {
    keysMock.mockResolvedValue({ ...KEYS, rawgApiKey: null });

    await expect(rawgProvider.search({ filters: filters() })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps the provider row into an ExternalGame", async () => {
    fetchMock.mockResolvedValue(jsonRes({ results: [row()] }));

    const [game] = await rawgProvider.search({ filters: filters() });

    expect(game).toEqual({
      externalId: "rawg:1",
      title: "Hades",
      genres: ["action", "rpg"],
      platforms: ["pc"],
      coverUrl: "https://img.example/hades.jpg",
      metacritic: 93,
      rating: 4.5,
      releasedAt: "2020-09-17",
      esrb: "teen",
      tags: Array.from({ length: 10 }, (_, i) => `tag-${i}`),
      playtimeHours: 21,
      website: "https://supergiantgames.com",
      stores: [{ store: "Steam", url: "https://store.steampowered.com/app/1145360" }],
    });
  });

  it("tolerates a row with no esrb, stores or playtime", async () => {
    fetchMock.mockResolvedValue(
      jsonRes({
        results: [
          row({ esrb_rating: null, stores: null, playtime: undefined, website: undefined, metacritic: null, rating: null }),
        ],
      }),
    );

    const [game] = await rawgProvider.search({ filters: filters() });

    expect(game!.esrb).toBeNull();
    expect(game!.stores).toEqual([]);
    expect(game!.playtimeHours).toBeNull();
    expect(game!.website).toBeNull();
    expect(game!.metacritic).toBeNull();
  });

  it("builds the request from the filters, mapping platforms to RAWG ids", async () => {
    fetchMock.mockResolvedValue(jsonRes({ results: [] }));

    await rawgProvider.search({
      filters: filters({
        genres: ["action", "rpg"],
        tags: ["horror"],
        platforms: ["pc", "playstation5", "not-a-platform"],
        searchQuery: "hades",
        metacriticMin: 70,
        yearMin: 2010,
        yearMax: 2020,
        esrb: ["teen"],
      }),
      pageSize: 5,
      page: 2,
    });

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/api/games");
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(url.searchParams.get("page_size")).toBe("5");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("genres")).toBe("action,rpg");
    expect(url.searchParams.get("tags")).toBe("horror");
    // pc and playstation5 map to their RAWG ids; an unknown slug passes through
    expect(url.searchParams.get("platforms")).toBe("4,187,not-a-platform");
    expect(url.searchParams.get("search")).toBe("hades");
    expect(url.searchParams.get("metacritic")).toBe("70,100");
    expect(url.searchParams.get("dates")).toBe("2010-01-01,2020-12-31");
    expect(url.searchParams.get("esrb")).toBe("teen");
    expect(url.searchParams.get("ordering")).toBe("-metacritic");
  });

  it("omits numeric and search params that are not set", async () => {
    fetchMock.mockResolvedValue(jsonRes({ results: [] }));

    await rawgProvider.search({ filters: filters({ ordering: "" }) });

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.has("metacritic")).toBe(false);
    expect(url.searchParams.has("dates")).toBe(false);
    expect(url.searchParams.has("search")).toBe(false);
    // an empty ordering still gets the default
    expect(url.searchParams.get("ordering")).toBe("-metacritic");
  });

  it("opens the year range to its defaults when only one bound is set", async () => {
    fetchMock.mockResolvedValue(jsonRes({ results: [] }));

    await rawgProvider.search({ filters: filters({ yearMax: 2020 }) });

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get("dates")).toBe(`1970-01-01,2020-12-31`);
  });

  it("uses no-store for a zero cache TTL and seconds otherwise", async () => {
    // A Response body can only be read once, so each call needs its own.
    fetchMock.mockImplementation(() => Promise.resolve(jsonRes({ results: [] })));

    await rawgProvider.search({ filters: filters(), cacheTtlHours: 0 });
    expect(fetchMock.mock.calls[0]![1]).toEqual({ cache: "no-store" });

    await rawgProvider.search({ filters: filters(), cacheTtlHours: 2 });
    expect(fetchMock.mock.calls[1]![1]).toEqual({ next: { revalidate: 7200 } });
  });

  it("returns nothing when the API responds with an error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue(jsonRes({}, 500));

    await expect(rawgProvider.search({ filters: filters() })).resolves.toEqual([]);
  });
});

describe("rawgProvider.getById", () => {
  it("returns null without a key or on an error response", async () => {
    keysMock.mockResolvedValue({ ...KEYS, rawgApiKey: null });
    await expect(rawgProvider.getById("rawg:1")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    keysMock.mockResolvedValue(KEYS);
    fetchMock.mockResolvedValue(jsonRes({}, 404));
    await expect(rawgProvider.getById("rawg:1")).resolves.toBeNull();
  });

  it("strips the rawg: prefix and maps the detail row", async () => {
    fetchMock.mockResolvedValue(jsonRes(row({ description_raw: "  A great game  " })));

    const game = await rawgProvider.getById("rawg:1145360");

    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.rawg.io/api/games/1145360?key=test-key");
    expect(game).toMatchObject({ externalId: "rawg:1", description: "A great game" });
  });

  it("normalises a blank description to null", async () => {
    fetchMock.mockResolvedValue(jsonRes(row({ description_raw: "   " })));

    const game = await rawgProvider.getById("rawg:1");
    expect(game!.description).toBeNull();
  });
});
