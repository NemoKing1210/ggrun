import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { IeeConfigSchema, IeeEntryConfigSchema, SeasonCatalogEntrySchema } from "./iee";

describe("IeeEntryConfigSchema — per-entry bounds", () => {
  it("caps the drop weight at 10000", () => {
    expect(IeeEntryConfigSchema.parse({ weight: 0 }).weight).toBe(0);
    expect(IeeEntryConfigSchema.parse({ weight: 10_000 }).weight).toBe(10_000);
    expect(() => IeeEntryConfigSchema.parse({ weight: 10_001 })).toThrow();
  });

  it("caps the cooldown, unlock and min-position windows", () => {
    expect(IeeEntryConfigSchema.parse({ cooldownRolls: 1_000 }).cooldownRolls).toBe(1_000);
    expect(IeeEntryConfigSchema.parse({ minPosition: 200 }).minPosition).toBe(200);
    expect(IeeEntryConfigSchema.parse({ unlockAfterMove: 1_000 }).unlockAfterMove).toBe(1_000);
    expect(() => IeeEntryConfigSchema.parse({ cooldownRolls: 1_001 })).toThrow();
    expect(() => IeeEntryConfigSchema.parse({ minPosition: 201 })).toThrow();
    expect(() => IeeEntryConfigSchema.parse({ unlockAfterMove: 1_001 })).toThrow();
  });

  it("treats the per-season and per-player caps as optional non-negative integers", () => {
    expect(IeeEntryConfigSchema.parse({}).maxPerSeason).toBeNull();
    expect(IeeEntryConfigSchema.parse({ maxPerSeason: 0 }).maxPerSeason).toBe(0);
    expect(IeeEntryConfigSchema.parse({ maxPerPlayer: 5 }).maxPerPlayer).toBe(5);
    expect(() => IeeEntryConfigSchema.parse({ maxPerSeason: -1 })).toThrow();
    expect(() => IeeEntryConfigSchema.parse({ maxPerPlayer: 1.5 })).toThrow();
  });

  it("treats the duration override as optional non-negative", () => {
    expect(IeeEntryConfigSchema.parse({}).durationOverride).toBeNull();
    expect(IeeEntryConfigSchema.parse({ durationOverride: 0 }).durationOverride).toBe(0);
    expect(IeeEntryConfigSchema.parse({ durationOverride: 3 }).durationOverride).toBe(3);
    expect(() => IeeEntryConfigSchema.parse({ durationOverride: -1 })).toThrow();
  });

  it("accepts only the four target kinds or nothing", () => {
    expect(IeeEntryConfigSchema.parse({}).targetOverride).toBeNull();
    for (const targetOverride of ["self", "other", "any", "none"] as const) {
      expect(IeeEntryConfigSchema.parse({ targetOverride }).targetOverride).toBe(targetOverride);
    }
    expect(() => IeeEntryConfigSchema.parse({ targetOverride: "enemy" })).toThrow();
  });

  it("keeps param overrides to scalars", () => {
    expect(() => IeeEntryConfigSchema.parse({ paramOverrides: { nested: { a: 1 } } })).toThrow();
    expect(() => IeeEntryConfigSchema.parse({ paramOverrides: { list: [1, 2] } })).toThrow();
    expect(() => IeeEntryConfigSchema.parse({ paramOverrides: { nil: null } })).toThrow();
  });
});

describe("IeeConfigSchema — season-level bounds", () => {
  it("caps inventory and protection windows at 100", () => {
    expect(IeeConfigSchema.parse({ inventorySize: 100 }).inventorySize).toBe(100);
    expect(IeeConfigSchema.parse({ pvpProtectionMoves: 100 }).pvpProtectionMoves).toBe(100);
    expect(() => IeeConfigSchema.parse({ inventorySize: 101 })).toThrow();
    expect(() => IeeConfigSchema.parse({ pvpProtectionMoves: 101 })).toThrow();
  });

  it("caps the nothing weight at 10000", () => {
    expect(IeeConfigSchema.parse({ nothingWeight: 10_000 }).nothingWeight).toBe(10_000);
    expect(() => IeeConfigSchema.parse({ nothingWeight: 10_001 })).toThrow();
  });

  it("keeps the catch-up multiplier between 1 and 5", () => {
    expect(IeeConfigSchema.parse({ catchUp: { maxMultiplier: 1 } }).catchUp.maxMultiplier).toBe(1);
    expect(IeeConfigSchema.parse({ catchUp: { maxMultiplier: 5 } }).catchUp.maxMultiplier).toBe(5);
    expect(() => IeeConfigSchema.parse({ catchUp: { maxMultiplier: 0.5 } })).toThrow();
    expect(() => IeeConfigSchema.parse({ catchUp: { maxMultiplier: 6 } })).toThrow();
  });

  it("defaults catch-up off, events empty and no season-wide limit", () => {
    const parsed = IeeConfigSchema.parse({});
    expect(parsed.catchUp).toEqual(DEFAULT_SEASON_CONFIG.iee.catchUp);
    expect(parsed.events).toEqual([]);
    expect(parsed).toMatchObject({
      maxActiveEffectsPerPlayer: null,
      tagLimits: {},
      disabledTags: [],
      powerCeiling: null,
      boardObjectsPerPlayer: 2,
    });
  });

  it("lets events be enumerated", () => {
    expect(IeeConfigSchema.parse({ events: ["e1", "e2"] }).events).toEqual(["e1", "e2"]);
  });

  // Stage 1 kept the season's pool in the config; the season catalog holds it
  // now (spec §4.5). An old config still parses and loses the key on save.
  it("drops the stage-1 `entries` map instead of refusing the config", () => {
    const parsed = IeeConfigSchema.parse({ enabled: true, entries: { ward: { weight: 40 } } });
    expect(parsed.enabled).toBe(true);
    expect(parsed).not.toHaveProperty("entries");
  });

  it("bounds the season-wide limits and spells tags as the documents do", () => {
    expect(IeeConfigSchema.parse({ tagLimits: { movement: 2 }, disabledTags: ["game_condition"] })).toMatchObject({
      tagLimits: { movement: 2 },
      disabledTags: ["game_condition"],
    });
    expect(() => IeeConfigSchema.parse({ maxActiveEffectsPerPlayer: -1 })).toThrow();
    expect(() => IeeConfigSchema.parse({ tagLimits: { Movement: 2 } })).toThrow();
    expect(() => IeeConfigSchema.parse({ disabledTags: ["no spaces"] })).toThrow();
    expect(() => IeeConfigSchema.parse({ boardObjectsPerPlayer: 21 })).toThrow();
    expect(IeeConfigSchema.parse({ powerCeiling: 12.5 }).powerCeiling).toBe(12.5);
  });
});

describe("SeasonCatalogEntrySchema", () => {
  const row = {
    entryId: "4a8ad97d-4287-468d-b300-5e20c2a593b0",
    revisionId: "ae91a9d4-eab3-53f3-ae80-17f7a3e24e8a",
    pool: "bonus",
    weight: 100,
  };

  it("fills the gates and tuning a wizard row leaves out", () => {
    expect(SeasonCatalogEntrySchema.parse(row)).toEqual({
      ...row,
      enabled: true,
      rarity: null,
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

  it("refuses what a catalog row cannot hold", () => {
    expect(() => SeasonCatalogEntrySchema.parse({ ...row, entryId: "lodestone" })).toThrow();
    expect(() => SeasonCatalogEntrySchema.parse({ ...row, pool: "neutral" })).toThrow();
    expect(() => SeasonCatalogEntrySchema.parse({ ...row, weight: -1 })).toThrow();
    expect(() => SeasonCatalogEntrySchema.parse({ ...row, rarity: "mythic" })).toThrow();
    expect(() => SeasonCatalogEntrySchema.parse({ ...row, extra: true })).toThrow();
  });
});
