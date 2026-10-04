import { describe, expect, it } from "vitest";

import {
  generateSeasonSlug,
  generateSeasonTitle,
  SEASON_TITLE_WORDS,
} from "./season-names";

/** Deterministic rng that walks a fixed sequence, repeating the last value. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

describe("generateSeasonTitle", () => {
  it("picks the first adjective and noun for an rng pinned at 0", () => {
    expect(generateSeasonTitle(() => 0)).toBe("Crimson Protocol");
  });

  it("picks the last entries for an rng just below 1", () => {
    expect(generateSeasonTitle(() => 0.9999)).toBe("Pulse Lumen");
  });

  it("is deterministic for the same rng sequence", () => {
    const rng = sequence([0.2, 0.7]);
    expect(generateSeasonTitle(rng)).toBe(generateSeasonTitle(sequence([0.2, 0.7])));
  });

  it("Title-Cases both words", () => {
    expect(generateSeasonTitle(() => 0)).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it("re-picks the noun when it duplicates the adjective", () => {
    // ADJECTIVES[2] and NOUNS[16] are both "Phantom"; the third call picks a fresh noun.
    const rng = sequence([2 / 30, 16 / 30, 0 / 30]);
    expect(generateSeasonTitle(rng)).toBe("Phantom Protocol");
  });

  it("stops retrying after the guard limit and returns the last pick", () => {
    // Every noun draw is NOUNS[16] ("Phantom"), equal to the adjective, so the
    // guard exhausts and the duplicate is returned rather than looping forever.
    const rng = sequence([2 / 30, 16 / 30]);
    expect(generateSeasonTitle(rng)).toBe("Phantom Phantom");
  });
});

describe("generateSeasonSlug", () => {
  it("lowercases the title and joins the words with a hyphen", () => {
    expect(generateSeasonSlug(() => 0)).toBe("crimson-protocol");
  });

  it("contains only slug-safe characters", () => {
    expect(generateSeasonSlug(() => 0.4)).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("uses the same rng sequence as the title", () => {
    const rng = sequence([0.5, 0.5]);
    expect(generateSeasonSlug(rng)).toBe(
      generateSeasonTitle(sequence([0.5, 0.5])).toLowerCase().replace(/\s+/g, "-"),
    );
  });
});

describe("SEASON_TITLE_WORDS", () => {
  it("exposes adjectives and nouns as non-empty Title-Cased word lists", () => {
    const { adjectives, nouns } = SEASON_TITLE_WORDS;
    expect(adjectives.length).toBeGreaterThan(0);
    expect(nouns.length).toBeGreaterThan(0);
    for (const word of [...adjectives, ...nouns]) {
      expect(word).toMatch(/^[A-Z][a-z]+$/);
    }
  });

  it("has no duplicate word within either list", () => {
    const { adjectives, nouns } = SEASON_TITLE_WORDS;
    expect(new Set(adjectives).size).toBe(adjectives.length);
    expect(new Set(nouns).size).toBe(nouns.length);
  });
});
