import { describe, expect, it } from "vitest";

import { DEFAULT_SEASON_CONFIG } from "@/lib/engine/config/defaults";
import type { GamePoolFilters } from "@/lib/engine/types";

import { hardProviderFilters } from "./primary-filters";

function filters(over: Partial<GamePoolFilters> = {}): GamePoolFilters {
  return { ...DEFAULT_SEASON_CONFIG.gamePool.filters, ...over };
}

describe("hardProviderFilters edge cases", () => {
  it("uses the primary tag's equivalent slugs, whichever direction they go", () => {
    expect(hardProviderFilters(filters({ primaryTag: "roguelite" }))).toMatchObject({
      genres: [],
      tags: ["roguelite", "roguelike"],
    });
  });

  it("treats a value that is neither a known genre nor tag as a tag", () => {
    expect(hardProviderFilters(filters({ primaryTag: "some-new-tag" }))).toMatchObject({
      genres: [],
      tags: ["some-new-tag"],
    });
  });

  it("resolves a genre primary tag to a genre requirement", () => {
    expect(hardProviderFilters(filters({ primaryTag: "rpg", genres: ["action"], tags: ["horror"] }))).toMatchObject({
      genres: ["rpg"],
      tags: [],
    });
  });

  it("returns the very same object when the primary tag is an empty string", () => {
    const f = filters({ primaryTag: "" });
    expect(hardProviderFilters(f)).toBe(f);
  });
});
