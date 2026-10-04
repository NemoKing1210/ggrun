import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { BoardConfigSchema } from "./board";

describe("BoardConfigSchema", () => {
  it("fills every field from the season defaults", () => {
    expect(BoardConfigSchema.parse({})).toEqual(DEFAULT_SEASON_CONFIG.board);
  });

  it("keeps size inside 1..200", () => {
    expect(BoardConfigSchema.parse({ size: 1 }).size).toBe(1);
    expect(BoardConfigSchema.parse({ size: 200 }).size).toBe(200);
    expect(() => BoardConfigSchema.parse({ size: 0 })).toThrow();
    expect(() => BoardConfigSchema.parse({ size: 201 })).toThrow();
    expect(() => BoardConfigSchema.parse({ size: 2.5 })).toThrow();
  });

  it("keeps every count inside 0..100", () => {
    for (const field of ["bonusCount", "penaltyCount", "teleportCount", "eventCount"] as const) {
      expect(BoardConfigSchema.parse({ [field]: 0 })[field]).toBe(0);
      expect(BoardConfigSchema.parse({ [field]: 100 })[field]).toBe(100);
      expect(() => BoardConfigSchema.parse({ [field]: -1 })).toThrow();
      expect(() => BoardConfigSchema.parse({ [field]: 101 })).toThrow();
    }
  });

  it("accepts exactly the four named distributions", () => {
    for (const distribution of ["random", "even", "clustered", "manual"] as const) {
      expect(BoardConfigSchema.parse({ distribution }).distribution).toBe(distribution);
    }
    expect(() => BoardConfigSchema.parse({ distribution: "spiral" })).toThrow();
  });

  it("rejects a non-boolean flag", () => {
    expect(() => BoardConfigSchema.parse({ loop: "yes" })).toThrow();
    expect(() => BoardConfigSchema.parse({ regenerateOnSave: 1 })).toThrow();
  });
});
