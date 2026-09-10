import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG, IeeEntryConfigSchema, SeasonConfigSchema } from "./config";

/**
 * The whole "tier 2 costs no migration" claim rests on these: a season row
 * written before IEE existed must still parse, and must come back with the
 * subsystem switched off.
 */
describe("SeasonConfigSchema — backward compatibility", () => {
  it("parses a legacy config that has no iee key", () => {
    const legacy = {
      dice: { sides: 6, passDiceCount: 1, dropDiceCount: 2, dropStreakMultiplier: true },
      points: { startingBalance: 0, bonusAddsToRollOnPass: true, resetBalanceAfterUse: true },
      board: { size: 40, loop: false },
      rerolls: { allowed: true, limitPerGame: 1, requireApproval: true },
    };
    const parsed = SeasonConfigSchema.parse(legacy);
    expect(parsed.iee).toEqual(DEFAULT_SEASON_CONFIG.iee);
    expect(parsed.iee.enabled).toBe(false);
    expect(parsed.dice.sides).toBe(6);
  });

  it("leaves other stages untouched when only iee is provided", () => {
    const parsed = SeasonConfigSchema.parse({ iee: { enabled: true } });
    expect(parsed.iee.enabled).toBe(true);
    expect(parsed.iee.inventorySize).toBe(DEFAULT_SEASON_CONFIG.iee.inventorySize);
    expect(parsed.board).toEqual(DEFAULT_SEASON_CONFIG.board);
    expect(parsed.gamePool).toEqual(DEFAULT_SEASON_CONFIG.gamePool);
  });
});

describe("IeeEntryConfigSchema", () => {
  it("treats an empty object as 'in the pool with catalog defaults'", () => {
    expect(IeeEntryConfigSchema.parse({})).toEqual({
      enabled: true,
      weight: 100,
      polarityOverride: null,
      maxPerSeason: null,
      maxPerPlayer: null,
      cooldownRolls: 0,
      minPosition: 0,
      unlockAfterMove: 0,
      paramOverrides: {},
      durationOverride: null,
      targetOverride: null,
    });
  });

  it("keeps param overrides as a scalar bag", () => {
    const parsed = IeeEntryConfigSchema.parse({
      paramOverrides: { steps: 2, label: "x", loud: true },
    });
    expect(parsed.paramOverrides).toEqual({ steps: 2, label: "x", loud: true });
  });

  it("rejects out-of-range tuning", () => {
    expect(() => IeeEntryConfigSchema.parse({ weight: -1 })).toThrow();
    expect(() => IeeEntryConfigSchema.parse({ cooldownRolls: 1.5 })).toThrow();
    expect(() => IeeEntryConfigSchema.parse({ polarityOverride: "sideways" })).toThrow();
  });

  it("rejects an invalid catch-up multiplier", () => {
    expect(() => SeasonConfigSchema.parse({ iee: { catchUp: { maxMultiplier: 9 } } })).toThrow();
  });
});
