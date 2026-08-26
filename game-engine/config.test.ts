import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema } from "./config";
import type { SeasonConfig } from "./types";

describe("DEFAULT_SEASON_CONFIG", () => {
  it("matches the PLAN.md section 6.2 reference", () => {
    expect(DEFAULT_SEASON_CONFIG).toEqual<SeasonConfig>({
      dice: {
        sides: 6,
        passDiceCount: 1,
        dropDiceCount: 2,
        dropStreakMultiplier: true,
      },
      points: {
        startingBalance: 0,
        bonusAddsToRollOnPass: true,
        resetBalanceAfterUse: true,
      },
      board: { size: 40, loop: false },
      rerolls: { allowed: true, limitPerGame: 1 },
    });
  });
});

describe("SeasonConfigSchema", () => {
  it("fills defaults for an empty object", () => {
    expect(SeasonConfigSchema.parse({})).toEqual(DEFAULT_SEASON_CONFIG);
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
