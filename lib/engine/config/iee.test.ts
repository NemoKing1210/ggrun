import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { IeeConfigSchema, IeeEntryConfigSchema } from "./iee";

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

  it("defaults catch-up off, entries empty and events empty", () => {
    const parsed = IeeConfigSchema.parse({});
    expect(parsed.catchUp).toEqual(DEFAULT_SEASON_CONFIG.iee.catchUp);
    expect(parsed.entries).toEqual({});
    expect(parsed.events).toEqual([]);
  });

  it("lets events and entries be enumerated", () => {
    expect(IeeConfigSchema.parse({ events: ["e1", "e2"] }).events).toEqual(["e1", "e2"]);
    expect(IeeConfigSchema.parse({ entries: { shield: {} } }).entries.shield?.enabled).toBe(true);
  });
});
