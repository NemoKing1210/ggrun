import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/http/external-fetch", () => ({
  fetchExternal: vi.fn(),
}));

import { DEFAULT_SEASON_CONFIG } from "@/lib/engine/config/defaults";
import type { GamePoolFilters } from "@/lib/engine/types";
import { fetchExternal } from "@/lib/infrastructure/http/external-fetch";

import { freetogameProvider } from "./freetogame";

const fetchMock = vi.mocked(fetchExternal);

function filters(over: Partial<GamePoolFilters> = {}): GamePoolFilters {
  return { ...DEFAULT_SEASON_CONFIG.gamePool.filters, ...over };
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function f2gItem(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: "Action Hero",
    thumbnail: "https://cdn.example/1.jpg",
    short_description: "short",
    genre: "Action",
    platform: "PC (Windows)",
    release_date: "2020-01-01",
    game_url: "https://www.freetogame.com/g/1",
    ...over,
  };
}

/** A deterministic, non-repeating sequence so shuffle/sample never hang. */
function sequence(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.spyOn(Math, "random").mockImplementation(sequence());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("freetogameProvider.search", () => {
  it("maps a list answer into an ExternalGame and asks the filter endpoint", async () => {
    fetchMock.mockResolvedValue(jsonRes([f2gItem()]));

    const games = await freetogameProvider.search({ filters: filters({ genres: ["action"] }) });

    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://www.freetogame.com/api/filter?tag=action&sort-by=popularity",
    );
    expect(games).toEqual([
      {
        externalId: "freetogame:1",
        title: "Action Hero",
        genres: ["action"],
        platforms: ["pc"],
        coverUrl: "https://cdn.example/1.jpg",
        metacritic: null,
        rating: null,
        releasedAt: "2020-01-01",
        esrb: null,
        tags: [],
        description: "short",
        playtimeHours: null,
        stores: [{ store: "FreeToGame", url: "https://www.freetogame.com/g/1" }],
      },
    ]);
  });

  it("hits the unfiltered games endpoint when nothing narrows the filter", async () => {
    fetchMock.mockResolvedValue(jsonRes([]));

    await freetogameProvider.search({ filters: filters() });

    expect(fetchMock.mock.calls[0]![0]).toBe("https://www.freetogame.com/api/games?sort-by=popularity");
  });

  it("maps the ordering onto FreeToGame's sort-by values", async () => {
    // A Response body can only be read once, so each call needs its own.
    fetchMock.mockImplementation(() => Promise.resolve(jsonRes([])));

    await freetogameProvider.search({ filters: filters({ ordering: "released" }) });
    await freetogameProvider.search({ filters: filters({ ordering: "name" }) });
    await freetogameProvider.search({ filters: filters({ ordering: "-name" }) });
    await freetogameProvider.search({ filters: filters({ ordering: "-added" }) });

    expect(fetchMock.mock.calls[0]![0]).toContain("sort-by=release-date");
    expect(fetchMock.mock.calls[1]![0]).toContain("sort-by=alphabetical");
    expect(fetchMock.mock.calls[2]![0]).toContain("sort-by=alphabetical");
    expect(fetchMock.mock.calls[3]![0]).toContain("sort-by=popularity");
  });

  it("translates a web-only platform filter to FreeToGame's browser value", async () => {
    fetchMock.mockResolvedValue(jsonRes([]));

    await freetogameProvider.search({ filters: filters({ platforms: ["web"] }) });

    expect(fetchMock.mock.calls[0]![0]).toContain("platform=browser");
  });

  it("returns nothing without fetching when FreeToGame cannot answer the filter", async () => {
    await expect(freetogameProvider.search({ filters: filters({ platforms: ["nintendo-switch"] }) })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a 201 object (nothing matched) as an empty result", async () => {
    fetchMock.mockResolvedValue(jsonRes({ status: 0 }, 201));

    await expect(freetogameProvider.search({ filters: filters({ genres: ["action"] }) })).resolves.toEqual([]);
  });

  it("returns nothing when a request errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue(jsonRes({}, 503));

    await expect(freetogameProvider.search({ filters: filters({ genres: ["action"] }) })).resolves.toEqual([]);
  });

  it("post-filters by title because the API has no name search", async () => {
    fetchMock.mockResolvedValue(
      jsonRes([
        f2gItem({ id: 1, title: "Action Hero" }),
        f2gItem({ id: 2, title: "Puzzle Master", genre: "Puzzle" }),
      ]),
    );

    const games = await freetogameProvider.search({ filters: filters({ genres: ["action"], searchQuery: "  HERO " }) });

    expect(games.map((g) => g.title)).toEqual(["Action Hero"]);
  });

  it("drops undated and out-of-range games by year", async () => {
    fetchMock.mockResolvedValue(
      jsonRes([
        f2gItem({ id: 1, title: "Old", release_date: "2001-01-01" }),
        f2gItem({ id: 2, title: "Right", release_date: "2015-01-01" }),
        f2gItem({ id: 3, title: "Undated", release_date: null }),
      ]),
    );

    const games = await freetogameProvider.search({ filters: filters({ genres: ["action"], yearMin: 2010, yearMax: 2020 }) });

    expect(games.map((g) => g.title)).toEqual(["Right"]);
  });

  it("returns at most pageSize games", async () => {
    fetchMock.mockResolvedValue(
      jsonRes(Array.from({ length: 5 }, (_, i) => f2gItem({ id: i + 1, title: `Game ${i + 1}` }))),
    );

    const games = await freetogameProvider.search({ filters: filters({ genres: ["action"] }), pageSize: 2 });

    expect(games).toHaveLength(2);
  });
});

describe("freetogameProvider.getById", () => {
  it("returns null on an error response", async () => {
    fetchMock.mockResolvedValue(jsonRes({}, 404));

    await expect(freetogameProvider.getById("freetogame:1")).resolves.toBeNull();
  });

  it("returns null when the answer carries no id", async () => {
    fetchMock.mockResolvedValue(jsonRes({ title: "orphan" }));

    await expect(freetogameProvider.getById("freetogame:1")).resolves.toBeNull();
  });

  it("strips the prefix and prefers the full description", async () => {
    fetchMock.mockResolvedValue(jsonRes(f2gItem({ description: "  the long story  " })));

    const game = await freetogameProvider.getById("freetogame:1");

    expect(fetchMock.mock.calls[0]![0]).toBe("https://www.freetogame.com/api/game?id=1");
    expect(game!.externalId).toBe("freetogame:1");
    expect(game!.description).toBe("the long story");
  });

  it("falls back to the short description when there is no full one", async () => {
    fetchMock.mockResolvedValue(jsonRes(f2gItem()));

    const game = await freetogameProvider.getById("freetogame:1");

    expect(game!.description).toBe("short");
  });

  it("keeps a web-browser game on the web platform", async () => {
    fetchMock.mockResolvedValue(jsonRes(f2gItem({ platform: "Web Browser" })));

    const game = await freetogameProvider.getById("freetogame:1");

    expect(game!.platforms).toEqual(["web"]);
  });
});
