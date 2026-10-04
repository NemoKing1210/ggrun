import { describe, expect, it } from "vitest";

import { BOT_TARGET_STRATEGIES as ENGINE_STRATEGIES } from "@/lib/engine";
import {
  BOT_TARGET_STRATEGIES as SCHEMA_STRATEGIES,
  DEFAULT_BOT_RUN_CONFIG,
  normalizeBotConfig,
} from "@/db/schema/bots";

/**
 * The strategy list and the config shape exist in two places by necessity —
 * the schema is JSONB and may not import the engine, and the engine may not
 * import the schema. This is the seam that keeps the two copies honest.
 */
describe("bot config", () => {
  it("states the target strategies identically in the schema and the engine", () => {
    expect([...ENGINE_STRATEGIES]).toEqual([...SCHEMA_STRATEGIES]);
  });

  it("completes a run config stored before the item policy existed", () => {
    const legacy = {
      botCount: 2,
      actionsPerTick: 1,
      tickIntervalMs: 1000,
      passWeight: 1,
      dropWeight: 1,
      rerollWeight: 1,
      enableRoll: true,
      enableResolve: true,
      stopOnError: false,
    };
    expect(normalizeBotConfig(legacy)).toEqual({
      ...DEFAULT_BOT_RUN_CONFIG,
      botCount: 2,
      actionsPerTick: 1,
      tickIntervalMs: 1000,
      passWeight: 1,
      dropWeight: 1,
      rerollWeight: 1,
    });
  });

  it("keeps a valid stored strategy and falls back on an unknown one", () => {
    expect(normalizeBotConfig({ targetStrategy: "nearest" }).targetStrategy).toBe("nearest");
    expect(normalizeBotConfig({ targetStrategy: "chaos" }).targetStrategy).toBe(
      DEFAULT_BOT_RUN_CONFIG.targetStrategy,
    );
  });

  it("clamps numbers and falls back for a non-object", () => {
    expect(normalizeBotConfig({ itemChance: 500 }).itemChance).toBe(100);
    expect(normalizeBotConfig({ botCount: 0 }).botCount).toBe(1);
    expect(normalizeBotConfig(null)).toEqual(DEFAULT_BOT_RUN_CONFIG);
    expect(normalizeBotConfig("nonsense")).toEqual(DEFAULT_BOT_RUN_CONFIG);
  });
});
