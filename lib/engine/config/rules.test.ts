import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { RulesConfigSchema } from "./rules";

describe("RulesConfigSchema", () => {
  it("defaults to auto, like the season default", () => {
    expect(RulesConfigSchema.parse({})).toEqual({
      mode: DEFAULT_SEASON_CONFIG.rules.mode,
    });
    expect(RulesConfigSchema.parse({}).mode).toBe("auto");
  });

  it("accepts manual", () => {
    expect(RulesConfigSchema.parse({ mode: "manual" }).mode).toBe("manual");
  });

  it("rejects any other mode", () => {
    expect(() => RulesConfigSchema.parse({ mode: "hybrid" })).toThrow();
  });
});
