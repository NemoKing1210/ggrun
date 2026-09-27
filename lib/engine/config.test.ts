import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema } from "./config";


describe("DEFAULT_SEASON_CONFIG", () => {
  it("matches the PLAN.md section 6.2 reference for core fields", () => {
    expect(DEFAULT_SEASON_CONFIG.dice).toEqual({
      sides: 6,
      passDiceCount: 1,
      dropDiceCount: 2,
      dropStreakMultiplier: true,
    });
    expect(DEFAULT_SEASON_CONFIG.points).toEqual({
      startingBalance: 0,
      bonusAddsToRollOnPass: true,
      resetBalanceAfterUse: true,
    });
    expect(DEFAULT_SEASON_CONFIG.board.size).toBe(40);
    expect(DEFAULT_SEASON_CONFIG.board.loop).toBe(false);
    expect(DEFAULT_SEASON_CONFIG.rerolls).toEqual({ allowed: true, limitPerGame: 1, requireApproval: true });
    // Extended defaults exist
    expect(DEFAULT_SEASON_CONFIG.gamePool).toBeDefined();
    expect(DEFAULT_SEASON_CONFIG.board.bonusCount).toBeDefined();
  });
});

describe("SeasonConfigSchema", () => {
  it("fills defaults for an empty object", () => {
    expect(SeasonConfigSchema.parse({})).toEqual(DEFAULT_SEASON_CONFIG);
  });

  // `gamePool.catalog.fallbackToCatalog` was removed: an API season no longer
  // falls back to the local catalog. Every season saved before that still
  // carries the key in its jsonb config, and must keep parsing.
  it("still parses a stored config that carries the removed fallbackToCatalog key", () => {
    const parsed = SeasonConfigSchema.parse({
      gamePool: { source: "api", provider: "freetogame", catalog: { allowManualAdd: false, fallbackToCatalog: true } },
    });
    expect(parsed.gamePool.source).toBe("api");
    expect(parsed.gamePool.provider).toBe("freetogame");
    expect(parsed.gamePool.catalog).toEqual({ allowManualAdd: false });
  });

  it("overrides only provided fields", () => {
    expect(
      SeasonConfigSchema.parse({ dice: { sides: 20 }, board: { loop: true } }),
    ).toEqual({
      ...DEFAULT_SEASON_CONFIG,
      dice: { ...DEFAULT_SEASON_CONFIG.dice, sides: 20 },
      board: { ...DEFAULT_SEASON_CONFIG.board, loop: true },
    });
  });

  it("rejects invalid numbers", () => {
    expect(() => SeasonConfigSchema.parse({ dice: { sides: 1 } })).toThrow();
    expect(() =>
      SeasonConfigSchema.parse({ dice: { passDiceCount: 0.5 } }),
    ).toThrow();
    expect(() => SeasonConfigSchema.parse({ board: { size: 0 } })).toThrow();
    expect(() =>
      SeasonConfigSchema.parse({ points: { startingBalance: -1 } }),
    ).toThrow();
    expect(() =>
      SeasonConfigSchema.parse({ rerolls: { limitPerGame: -1 } }),
    ).toThrow();
  });
});
