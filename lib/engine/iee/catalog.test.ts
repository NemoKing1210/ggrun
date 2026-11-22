import { describe, expect, it } from "vitest";

import { RARITY_WEIGHT } from "../types/iee";
import {
  catalogCandidate,
  catalogEntryConfig,
  catalogPickInputs,
  catalogRarity,
  defaultCatalogEntry,
  poolPolarity,
  poolSlot,
  RARITY_TIER,
  type CatalogSubject,
} from "./catalog";

const SWAMP: CatalogSubject = {
  entryId: "11111111-1111-4111-8111-111111111111",
  revisionId: "22222222-2222-5222-8222-222222222222",
  kind: "effect",
  key: "swamp",
  character: "penalty",
  rarity: "common",
  tags: ["movement"],
  stacking: "refresh",
};

const SCROLL: CatalogSubject = {
  entryId: "33333333-3333-4333-8333-333333333333",
  revisionId: "44444444-4444-5444-8444-444444444444",
  kind: "item",
  key: "hex_scroll",
  character: "bonus",
  rarity: "rare",
  tags: ["directed"],
  stacking: null,
};

describe("a catalog row by default — the entry's own pool, rarity and weight", () => {
  it("attaches enabled, on the pool its character names, at its rarity's weight, untuned", () => {
    expect(defaultCatalogEntry(SWAMP)).toEqual({
      entryId: SWAMP.entryId,
      revisionId: SWAMP.revisionId,
      enabled: true,
      pool: "penalty",
      rarity: null,
      weight: RARITY_WEIGHT.common,
      maxPerSeason: null,
      maxPerPlayer: null,
      cooldownRolls: 0,
      minPosition: 0,
      unlockAfterMove: 0,
      paramOverrides: {},
      durationOverride: null,
      targetOverride: null,
    });
    expect(defaultCatalogEntry(SCROLL).weight).toBe(RARITY_WEIGHT.rare);
  });

  it("takes overrides over the defaults", () => {
    expect(defaultCatalogEntry(SWAMP, { enabled: false, weight: 3 })).toMatchObject({ enabled: false, weight: 3, pool: "penalty" });
  });
});

describe("folding a row into the wheel", () => {
  it("maps a pool to the wheel it feeds", () => {
    expect(poolPolarity("bonus")).toBe("positive");
    expect(poolPolarity("penalty")).toBe("negative");
  });

  it("plays the season's rarity when it sets one, the entry's otherwise", () => {
    const row = defaultCatalogEntry(SWAMP);
    expect(catalogRarity(SWAMP, row)).toBe("common");
    expect(catalogRarity(SWAMP, { ...row, rarity: "legendary" })).toBe("legendary");
    expect(RARITY_TIER).toEqual({ common: 0, rare: 1, epic: 2, legendary: 3 });
  });

  it("makes a candidate with the season's pool and rarity, tags, and an effect's stacking", () => {
    const row = { ...defaultCatalogEntry(SWAMP), pool: "bonus" as const, rarity: "epic" as const };
    expect(catalogCandidate(SWAMP, row)).toEqual({
      kind: "effect",
      key: "swamp",
      polarity: "positive",
      tier: 2,
      tags: ["movement"],
      stacking: "refresh",
      // The entry's own character, whatever pool the season moved it to.
      character: "penalty",
    });
    // An item has no stacking policy; a unique one says so (spec §6.10).
    expect(catalogCandidate(SCROLL, defaultCatalogEntry(SCROLL))).toEqual({
      kind: "item",
      key: "hex_scroll",
      polarity: "positive",
      tier: 1,
      tags: ["directed"],
      character: "bonus",
    });
    expect(catalogCandidate({ ...SCROLL, unique: true }, defaultCatalogEntry(SCROLL)).unique).toBe(true);
  });

  it("hands the picker the row's gates and tuning, the pool already folded into the candidate", () => {
    const row = defaultCatalogEntry(SWAMP, {
      enabled: false,
      weight: 9,
      maxPerSeason: 4,
      maxPerPlayer: 1,
      cooldownRolls: 2,
      minPosition: 5,
      unlockAfterMove: 3,
      paramOverrides: { steps: -2 },
      durationOverride: 4,
    });
    expect(catalogEntryConfig(row)).toEqual({
      enabled: false,
      weight: 9,
      polarityOverride: null,
      maxPerSeason: 4,
      maxPerPlayer: 1,
      cooldownRolls: 2,
      minPosition: 5,
      unlockAfterMove: 3,
      paramOverrides: { steps: -2 },
      durationOverride: 4,
      targetOverride: null,
    });
  });

  it("says how an entry drops, for the rules page", () => {
    expect(poolSlot(defaultCatalogEntry(SCROLL, { weight: 12 }))).toEqual({ enabled: true, weight: 12, polarity: "positive" });
    expect(poolSlot(defaultCatalogEntry(SWAMP, { enabled: false }))).toEqual({
      enabled: false,
      weight: RARITY_WEIGHT.common,
      polarity: "negative",
    });
  });

  it("builds the picker's inputs for a list of attached entries, keyed by key", () => {
    const rows = [
      { subject: SWAMP, row: defaultCatalogEntry(SWAMP) },
      { subject: SCROLL, row: defaultCatalogEntry(SCROLL, { weight: 7 }) },
    ];
    const { candidates, entries } = catalogPickInputs(rows);
    expect(candidates.map((c) => c.key)).toEqual(["swamp", "hex_scroll"]);
    expect(Object.keys(entries)).toEqual(["swamp", "hex_scroll"]);
    expect(entries.hex_scroll?.weight).toBe(7);
    expect(catalogPickInputs([])).toEqual({ candidates: [], entries: {} });
  });
});
