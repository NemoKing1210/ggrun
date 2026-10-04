import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { DiceConfigSchema } from "./dice";

describe("DiceConfigSchema", () => {
  it("fills every field from the season defaults", () => {
    expect(DiceConfigSchema.parse({})).toEqual(DEFAULT_SEASON_CONFIG.dice);
  });

  it("requires at least two sides", () => {
    expect(DiceConfigSchema.parse({ sides: 2 }).sides).toBe(2);
    expect(DiceConfigSchema.parse({ sides: 20 }).sides).toBe(20);
    expect(() => DiceConfigSchema.parse({ sides: 1 })).toThrow();
    expect(() => DiceConfigSchema.parse({ sides: 2.5 })).toThrow();
  });

  it("keeps both dice counts non-negative integers", () => {
    expect(DiceConfigSchema.parse({ passDiceCount: 0 }).passDiceCount).toBe(0);
    expect(DiceConfigSchema.parse({ dropDiceCount: 0 }).dropDiceCount).toBe(0);
    expect(() => DiceConfigSchema.parse({ passDiceCount: -1 })).toThrow();
    expect(() => DiceConfigSchema.parse({ dropDiceCount: -1 })).toThrow();
    expect(() => DiceConfigSchema.parse({ passDiceCount: 0.5 })).toThrow();
  });
});
