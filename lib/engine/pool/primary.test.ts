import { describe, expect, it } from "vitest";

import { matchesPrimaryTag, primaryTagSlugs, secondaryScore, splitPoolFilters } from "./primary";

/**
 * "If we picked Horror, the player expects horror games."
 *
 * The Horror template used to be a broad filter — (action or adventure) and
 * (horror or survival or atmospheric or zombie) — and Naraka: Bladepoint, an
 * action/survival battle royale, passed it. A season now has one primary tag
 * that every game must carry; the other genres and tags only rank.
 */

const NARAKA = { genres: ["shooter", "action"], tags: ["survival"] };
const PHASMO = { genres: ["action"], tags: ["horror", "co-op"] };

describe("matchesPrimaryTag", () => {
  it("rejects the game that prompted the change", () => {
    expect(matchesPrimaryTag(NARAKA, "horror")).toBe(false);
    expect(matchesPrimaryTag(PHASMO, "horror")).toBe(true);
  });

  // Providers disagree on which is which: RAWG files "indie" as a genre and
  // "horror" as a tag; a primary tag is found in either column.
  it("finds the primary tag as a genre or as a tag", () => {
    expect(matchesPrimaryTag({ genres: ["indie"], tags: [] }, "indie")).toBe(true);
    expect(matchesPrimaryTag({ genres: [], tags: ["indie"] }, "indie")).toBe(true);
  });

  it("matches the whole value, not a part of it", () => {
    // Equality, not substring: a slug that merely contains the word is not the tag.
    expect(matchesPrimaryTag({ genres: ["indie-rpg"], tags: [] }, "indie")).toBe(false);
  });

  it("treats roguelike and roguelite as one", () => {
    expect(matchesPrimaryTag({ genres: [], tags: ["roguelite"] }, "roguelike")).toBe(true);
    expect(matchesPrimaryTag({ genres: [], tags: ["roguelike"] }, "roguelite")).toBe(true);
  });

  it("lets everything through when there is no primary tag", () => {
    expect(matchesPrimaryTag(NARAKA, null)).toBe(true);
    expect(matchesPrimaryTag(NARAKA, undefined)).toBe(true);
    expect(primaryTagSlugs(null)).toEqual([]);
  });
});

describe("splitPoolFilters", () => {
  const horror = { genres: ["action", "adventure"], tags: ["horror", "survival", "atmospheric", "zombie"] };

  it("changes nothing for a season without a primary tag", () => {
    expect(splitPoolFilters({ ...horror, primaryTag: null })).toEqual({
      primary: [],
      hardGenres: ["action", "adventure"],
      hardTags: ["horror", "survival", "atmospheric", "zombie"],
      soft: [],
    });
    // a season saved before primary tags existed, read raw
    expect(splitPoolFilters(horror).hardTags).toHaveLength(4);
  });

  it("makes the primary tag the only requirement and ranks by the rest", () => {
    expect(splitPoolFilters({ ...horror, primaryTag: "horror" })).toEqual({
      primary: ["horror"],
      hardGenres: [],
      hardTags: [],
      soft: ["action", "adventure", "survival", "atmospheric", "zombie"],
    });
  });

  // perCellGenre: the cell the player stands on decides the genre. That is a
  // board rule, not a season preference, so it stays a requirement.
  it("keeps genres a board cell locks as a requirement", () => {
    const split = splitPoolFilters({ genres: ["rpg"], tags: ["horror", "zombie"], primaryTag: "horror" }, { cellLocked: true });
    expect(split.hardGenres).toEqual(["rpg"]);
    expect(split.soft).toEqual(["zombie"]);
  });

  it("does not rank by the primary tag or its equivalents", () => {
    const split = splitPoolFilters({ genres: [], tags: ["roguelike", "roguelite", "pixel-graphics"], primaryTag: "roguelike" });
    expect(split.soft).toEqual(["pixel-graphics"]);
  });
});

describe("secondaryScore", () => {
  it("counts the season's other values a game carries, once each", () => {
    const soft = ["action", "survival", "zombie"];
    expect(secondaryScore(PHASMO, soft)).toBe(1);
    expect(secondaryScore({ genres: ["action"], tags: ["survival", "zombie", "action"] }, soft)).toBe(3);
    expect(secondaryScore({ genres: [], tags: [] }, soft)).toBe(0);
  });
});
