import { describe, expect, it } from "vitest";

import {
  BOARD_DISTRIBUTIONS,
  ESRB,
  GAME_POOL_SOURCES,
  GAME_PROVIDERS,
  GENRES,
  ORDERINGS,
  PLATFORMS,
  TAGS,
} from "./constants";

function values(list: ReadonlyArray<{ value: string }>): string[] {
  return list.map((o) => o.value);
}

function expectSlugs(list: ReadonlyArray<{ value: string; label: string }>): void {
  for (const o of list) {
    expect(o.value).toMatch(/^[a-z0-9-]+$/);
    expect(o.label.trim().length).toBeGreaterThan(0);
  }
  expect(new Set(values(list)).size).toBe(list.length);
}

describe("catalog filter constants", () => {
  it("holds unique, slug-shaped options for genres, tags and esrb", () => {
    expectSlugs(GENRES);
    expectSlugs(TAGS);
    expectSlugs(ESRB);
  });

  it("maps every platform to a unique non-empty RAWG id", () => {
    expectSlugs(PLATFORMS);
    for (const p of PLATFORMS) {
      expect(p.rawgId).toMatch(/^\d+$/);
    }
    const ids = PLATFORMS.map((p) => p.rawgId);
    expect(new Set(ids).size).toBe(ids.length);
    // The mapping rawg.ts relies on when translating platform filters.
    expect(PLATFORMS.find((p) => p.value === "pc")!.rawgId).toBe("4");
    expect(PLATFORMS.find((p) => p.value === "web")!.rawgId).toBe("171");
  });

  it("enumerates the pool sources and providers the app understands", () => {
    expect(values(GAME_POOL_SOURCES)).toEqual(["catalog", "api", "hybrid"]);
    expect(values(GAME_PROVIDERS)).toEqual(["internal", "rawg", "freetogame", "igdb", "steam", "gamespot"]);
  });

  it("enumerates the board distributions", () => {
    expect(values(BOARD_DISTRIBUTIONS)).toEqual(["random", "even", "clustered", "manual"]);
  });

  it("offers unique orderings including the default", () => {
    expect(new Set(values(ORDERINGS)).size).toBe(ORDERINGS.length);
    expect(values(ORDERINGS)).toContain("-metacritic");
    expect(values(ORDERINGS)).toContain("name");
    expect(new Set(PLATFORMS.map((p) => p.label)).size).toBe(PLATFORMS.length);
  });
});
