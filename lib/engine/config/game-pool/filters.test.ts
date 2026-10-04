import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "../defaults";
import { GamePoolFiltersSchema } from "./filters";

describe("GamePoolFiltersSchema — defaults", () => {
  it("opens with no facet filters and the metacritic ordering", () => {
    const parsed = GamePoolFiltersSchema.parse({});
    expect(parsed.genres).toEqual([]);
    expect(parsed.platforms).toEqual([]);
    expect(parsed.tags).toEqual([]);
    expect(parsed.esrb).toEqual([]);
    expect(parsed.players).toBe("any");
    expect(parsed.onlyWithCover).toBe(false);
    expect(parsed.ordering).toBe("-metacritic");
    expect(parsed.searchQuery).toBeNull();
    for (const bound of ["metacriticMin", "metacriticMax", "ratingMin", "ratingMax", "yearMin", "yearMax"] as const) {
      expect(parsed[bound]).toBeNull();
    }
  });

  it("leaves primaryTag absent so the season transform can supply it", () => {
    expect(GamePoolFiltersSchema.parse({}).primaryTag).toBeUndefined();
    expect(GamePoolFiltersSchema.parse({ primaryTag: null }).primaryTag).toBeNull();
    expect(GamePoolFiltersSchema.parse({ primaryTag: "horror" }).primaryTag).toBe("horror");
  });
});

describe("GamePoolFiltersSchema — bounds", () => {
  it("caps metacritic at 100 on both ends", () => {
    expect(GamePoolFiltersSchema.parse({ metacriticMin: 100 }).metacriticMin).toBe(100);
    expect(GamePoolFiltersSchema.parse({ metacriticMax: 0 }).metacriticMax).toBe(0);
    expect(() => GamePoolFiltersSchema.parse({ metacriticMin: 101 })).toThrow();
    expect(() => GamePoolFiltersSchema.parse({ metacriticMax: 101 })).toThrow();
    expect(() => GamePoolFiltersSchema.parse({ metacriticMin: -1 })).toThrow();
  });

  it("keeps ratings inside 0..5", () => {
    expect(GamePoolFiltersSchema.parse({ ratingMin: 0 }).ratingMin).toBe(0);
    expect(GamePoolFiltersSchema.parse({ ratingMax: 5 }).ratingMax).toBe(5);
    expect(() => GamePoolFiltersSchema.parse({ ratingMin: -0.1 })).toThrow();
    expect(() => GamePoolFiltersSchema.parse({ ratingMax: 5.1 })).toThrow();
  });

  it("will not look for games released before 1970", () => {
    expect(GamePoolFiltersSchema.parse({ yearMin: 1970 }).yearMin).toBe(1970);
    expect(() => GamePoolFiltersSchema.parse({ yearMin: 1969 })).toThrow();
  });

  it("accepts exactly the four player modes", () => {
    for (const players of ["any", "single", "multi", "coop"] as const) {
      expect(GamePoolFiltersSchema.parse({ players }).players).toBe(players);
    }
    expect(() => GamePoolFiltersSchema.parse({ players: "solo" })).toThrow();
  });

  it("rejects blank facet entries", () => {
    expect(() => GamePoolFiltersSchema.parse({ genres: [""] })).toThrow();
    expect(() => GamePoolFiltersSchema.parse({ tags: [""] })).toThrow();
    expect(() => GamePoolFiltersSchema.parse({ esrb: [""] })).toThrow();
    expect(() => GamePoolFiltersSchema.parse({ primaryTag: "" })).toThrow();
  });
});

describe("GamePoolFiltersSchema — the shipped default", () => {
  it("parses the default season filters unchanged", () => {
    const { primaryTag, ...defaults } = DEFAULT_SEASON_CONFIG.gamePool.filters;
    expect(primaryTag).toBeNull();
    expect(GamePoolFiltersSchema.parse(defaults)).toMatchObject(defaults);
  });
});
