import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { RerollsConfigSchema } from "./rerolls";

describe("RerollsConfigSchema", () => {
  it("fills every field from the season defaults", () => {
    expect(RerollsConfigSchema.parse({})).toEqual(DEFAULT_SEASON_CONFIG.rerolls);
  });

  it("allows a zero per-game limit but not a negative one", () => {
    expect(RerollsConfigSchema.parse({ limitPerGame: 0 }).limitPerGame).toBe(0);
    expect(RerollsConfigSchema.parse({ limitPerGame: 5 }).limitPerGame).toBe(5);
    expect(() => RerollsConfigSchema.parse({ limitPerGame: -1 })).toThrow();
    expect(() => RerollsConfigSchema.parse({ limitPerGame: 1.5 })).toThrow();
  });

  it("carries the allowed and approval flags", () => {
    expect(RerollsConfigSchema.parse({ allowed: false }).allowed).toBe(false);
    expect(RerollsConfigSchema.parse({ requireApproval: false }).requireApproval).toBe(false);
    expect(() => RerollsConfigSchema.parse({ allowed: "no" })).toThrow();
  });
});
