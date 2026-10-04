import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { PointsConfigSchema } from "./points";

describe("PointsConfigSchema", () => {
  it("fills every field from the season defaults", () => {
    expect(PointsConfigSchema.parse({})).toEqual(DEFAULT_SEASON_CONFIG.points);
  });

  it("allows a zero starting balance but not a negative one", () => {
    expect(PointsConfigSchema.parse({ startingBalance: 0 }).startingBalance).toBe(0);
    expect(PointsConfigSchema.parse({ startingBalance: 12 }).startingBalance).toBe(12);
    expect(() => PointsConfigSchema.parse({ startingBalance: -1 })).toThrow();
    expect(() => PointsConfigSchema.parse({ startingBalance: 1.5 })).toThrow();
  });

  it("carries the two behavioural toggles", () => {
    expect(PointsConfigSchema.parse({ bonusAddsToRollOnPass: false }).bonusAddsToRollOnPass).toBe(false);
    expect(PointsConfigSchema.parse({ resetBalanceAfterUse: false }).resetBalanceAfterUse).toBe(false);
    expect(() => PointsConfigSchema.parse({ resetBalanceAfterUse: "yes" })).toThrow();
  });
});
