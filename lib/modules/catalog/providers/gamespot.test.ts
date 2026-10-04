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
import { gamespotProvider } from "./gamespot";

const fetchMock = vi.mocked(fetchExternal);
const keysMock = vi.mocked(getEffectiveProviderKeys);

function filters(over: Partial<GamePoolFilters> = {}): GamePoolFilters {
  return { ...DEFAULT_SEASON_CONFIG.gamePool.filters, ...over };
}

const KEYS: ProviderKeys = {
  rawgApiKey: null,
  igdbClientId: null,
  igdbClientSecret: null,
  steamApiKey: null,
  gamespotApiKey: "gs-key",
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function gsRow(over: Record<string, unknown> = {}) {
  return {
    id: 123,
    name: "Hades",
    image: { square_tiny: "https://img.example/hades.jpg" },
    release_date: "2020-09-17",
    original_release_date: "2020-09-17",
    genres: [{ name: "Action" }, { name: "action" }, { name: "Role-Playing" }],
    platforms: [{ name: "PC" }, { name: "PlayStation 5" }],
    deck: "A dungeon crawler",
    ...over,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  keysMock.mockReset();
  keysMock.mockResolvedValue(KEYS);
});

describe("gamespotProvider.search", () => {
  it("returns nothing without an API key, without fetching", async () => {
    keysMock.mockResolvedValue({ ...KEYS, gamespotApiKey: null });

    await expect(gamespotProvider.search({ filters: filters() })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps rows, deduping genres and platforms", async () => {
    fetchMock.mockResolvedValue(jsonRes({ results: [gsRow()] }));

    const [game] = await gamespotProvider.search({ filters: filters() });

    expect(game).toEqual({
      externalId: "gamespot:123",
      title: "Hades",
      genres: ["action", "rpg"],
      platforms: ["pc", "playstation5"],
      coverUrl: "https://img.example/hades.jpg",
      metacritic: null,
      rating: null,
      releasedAt: "2020-09-17",
      esrb: null,
      tags: [],
      description: "A dungeon crawler",
      playtimeHours: null,
      stores: [],
    });
  });

  it("defaults a row with no name and no image", async () => {
    fetchMock.mockResolvedValue(jsonRes({ results: [gsRow({ name: undefined, id: undefined, image: null })] }));

    const [game] = await gamespotProvider.search({ filters: filters() });

    expect(game!.title).toBe("Untitled");
    expect(game!.externalId).toBe("gamespot:");
    expect(game!.coverUrl).toBeNull();
  });

  it("prefers original_release_date over release_date", async () => {
    fetchMock.mockResolvedValue(
      jsonRes({ results: [gsRow({ original_release_date: "2019-01-01", release_date: "2020-01-01" })] }),
    );

    const [game] = await gamespotProvider.search({ filters: filters() });
    expect(game!.releasedAt).toBe("2019-01-01");
  });

  it("builds the request params from filters", async () => {
    fetchMock.mockResolvedValue(jsonRes({ results: [] }));

    await gamespotProvider.search({
      filters: filters({ searchQuery: " hades ", ordering: "-released" }),
      pageSize: 5,
    });

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/api/games/");
    expect(url.searchParams.get("api_key")).toBe("gs-key");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("filter")).toBe("name:hades");
    expect(url.searchParams.get("sort")).toBe("original_release_date:desc");
    // pageSize is raised to the API minimum of 20
    expect(url.searchParams.get("limit")).toBe("20");
    expect(fetchMock.mock.calls[0]![1]).toEqual({ next: { revalidate: 86400 } });
  });

  it("caps the limit at 100 and sorts by name otherwise", async () => {
    fetchMock.mockResolvedValue(jsonRes({ results: [] }));

    await gamespotProvider.search({ filters: filters(), pageSize: 500 });

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("sort")).toBe("name:asc");
    expect(url.searchParams.has("filter")).toBe(false);
  });

  it("requires the primary tag when it is a genre", async () => {
    fetchMock.mockResolvedValue(
      jsonRes({
        results: [gsRow({ id: 1, name: "Action Game" }), gsRow({ id: 2, name: "Puzzle Game", genres: [{ name: "Puzzle" }] })],
      }),
    );

    const games = await gamespotProvider.search({ filters: filters({ primaryTag: "action" }) });

    expect(games.map((g) => g.title)).toEqual(["Action Game"]);
  });

  it("keeps only games on the selected platforms", async () => {
    fetchMock.mockResolvedValue(
      jsonRes({
        results: [gsRow({ id: 1, name: "On PC", platforms: [{ name: "PC" }] }), gsRow({ id: 2, name: "On Switch", platforms: [{ name: "Nintendo Switch" }] })],
      }),
    );

    const games = await gamespotProvider.search({ filters: filters({ platforms: ["pc"] }) });

    expect(games.map((g) => g.title)).toEqual(["On PC"]);
  });

  it("drops undated games and enforces the year bounds", async () => {
    fetchMock.mockResolvedValue(
      jsonRes({
        results: [
          gsRow({ id: 1, name: "Old", original_release_date: "2001-01-01" }),
          gsRow({ id: 2, name: "Just right", original_release_date: "2015-06-01" }),
          gsRow({ id: 3, name: "Too new", original_release_date: "2024-01-01" }),
          gsRow({ id: 4, name: "Undated", original_release_date: null, release_date: null }),
        ],
      }),
    );

    const games = await gamespotProvider.search({ filters: filters({ yearMin: 2010, yearMax: 2020 }) });

    expect(games.map((g) => g.title)).toEqual(["Just right"]);
  });

  it("slices to the requested page size", async () => {
    fetchMock.mockResolvedValue(
      jsonRes({
        results: [
          gsRow({ id: 1, name: "A" }),
          gsRow({ id: 2, name: "B" }),
          gsRow({ id: 3, name: "C" }),
        ],
      }),
    );

    const games = await gamespotProvider.search({ filters: filters(), pageSize: 2 });

    expect(games.map((g) => g.title)).toEqual(["A", "B"]);
  });

  it("returns nothing when the API errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue(jsonRes({}, 500));

    await expect(gamespotProvider.search({ filters: filters() })).resolves.toEqual([]);
  });
});

describe("gamespotProvider.getById", () => {
  it("returns null without a key or on an error", async () => {
    keysMock.mockResolvedValue({ ...KEYS, gamespotApiKey: null });
    await expect(gamespotProvider.getById("gamespot:1")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    keysMock.mockResolvedValue(KEYS);
    fetchMock.mockResolvedValue(jsonRes({}, 500));
    await expect(gamespotProvider.getById("gamespot:1")).resolves.toBeNull();
  });

  it("returns null when the API has no matching row", async () => {
    fetchMock.mockResolvedValue(jsonRes({ results: [] }));

    await expect(gamespotProvider.getById("gamespot:999")).resolves.toBeNull();
  });

  it("strips the gamespot: prefix and returns the first row", async () => {
    fetchMock.mockResolvedValue(jsonRes({ results: [gsRow({ id: 42, name: "Portal 2" })] }));

    const game = await gamespotProvider.getById("gamespot:42");

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get("filter")).toBe("id:42");
    expect(game).toMatchObject({ externalId: "gamespot:42", title: "Portal 2" });
  });
});
