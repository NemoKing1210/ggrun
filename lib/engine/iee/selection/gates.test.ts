import { describe, expect, it } from "vitest";
import type { IeeConfig, IeeEntryConfig, IeePlayerSnapshot } from "../../types/iee";
import {
  effectivePolarity,
  gateCandidate,
  type GateInput,
  type PoolCandidate,
} from "./gates";

const entry = (over: Partial<IeeEntryConfig> = {}): IeeEntryConfig => ({
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
  ...over,
});

const cfg = (over: Partial<IeeConfig> = {}): IeeConfig => ({
  enabled: true,
  inventorySize: 0,
  allowTargetingOthers: true,
  pvpProtectionMoves: 0,
  revealDropsInFeed: true,
  nothingWeight: 0,
  catchUp: { enabled: false, maxMultiplier: 2 },
  events: [],
  maxActiveEffectsPerPlayer: null,
  tagLimits: {},
  disabledTags: [],
  powerCeiling: null,
  boardObjectsPerPlayer: 2,
  ...over,
});

const player = (over: Partial<IeePlayerSnapshot> = {}): IeePlayerSnapshot => ({
  seasonPlayerId: "sp-1",
  position: 10,
  balancePoints: 0,
  rollSeq: 5,
  moveCount: 5,
  rank: 1,
  status: "active",
  ...over,
});

const ITEM: PoolCandidate = {
  kind: "item",
  key: "hex_scroll",
  polarity: "positive",
  tier: 0,
};
const EFFECT: PoolCandidate = {
  kind: "effect",
  key: "slowed",
  polarity: "negative",
  tier: 0,
  stacking: "unique",
};

const counters = (over: Partial<GateInput["counters"]> = {}): GateInput["counters"] => ({
  perSeason: {},
  perPlayer: {},
  lastDropRollSeq: {},
  ...over,
});

const input = (over: Partial<GateInput> = {}): GateInput => ({
  candidate: ITEM,
  entry: entry(),
  config: cfg(),
  player: player(),
  counters: counters(),
  activeEffectKeys: [],
  heldItemCount: 0,
  seasonRollSeq: 10,
  ...over,
});

describe("effectivePolarity", () => {
  it("uses the candidate's own pool when the season is silent", () => {
    expect(effectivePolarity(ITEM, entry())).toBe("positive");
    expect(effectivePolarity(EFFECT, entry())).toBe("negative");
  });

  it("lets the season's override win over the catalog", () => {
    expect(effectivePolarity(ITEM, entry({ polarityOverride: "negative" }))).toBe("negative");
    expect(effectivePolarity(EFFECT, entry({ polarityOverride: "positive" }))).toBe("positive");
  });
});

describe("gateCandidate — eligibility", () => {
  it("returns null for a candidate that may drop", () => {
    expect(gateCandidate(input(), "positive")).toBeNull();
  });

  it("checks the switch before the pool", () => {
    expect(gateCandidate(input({ entry: entry({ enabled: false }) }), "negative")).toBe("disabled");
  });

  it("keeps a wrong-polarity candidate off the wheel", () => {
    expect(gateCandidate(input(), "negative")).toBe("polarity");
  });

  it("treats any non-positive weight as unmatchable", () => {
    expect(gateCandidate(input({ entry: entry({ weight: 0 }) }), "positive")).toBe("zero_weight");
    expect(gateCandidate(input({ entry: entry({ weight: -5 }) }), "positive")).toBe("zero_weight");
  });
});

describe("gateCandidate — season and player caps", () => {
  it("reports max_per_season only once the cap is reached", () => {
    const at = (perSeason: number) =>
      gateCandidate(
        input({
          entry: entry({ maxPerSeason: 3 }),
          counters: counters({ perSeason: { hex_scroll: perSeason } }),
        }),
        "positive",
      );
    expect(at(2)).toBeNull();
    expect(at(3)).toBe("max_per_season");
  });

  it("reports max_per_player only once the cap is reached", () => {
    const at = (perPlayer: number) =>
      gateCandidate(
        input({
          entry: entry({ maxPerPlayer: 1 }),
          counters: counters({ perPlayer: { hex_scroll: perPlayer } }),
        }),
        "positive",
      );
    expect(at(0)).toBeNull();
    expect(at(1)).toBe("max_per_player");
  });

  it("gives the season cap precedence when both are exhausted", () => {
    const both = input({
      entry: entry({ maxPerSeason: 1, maxPerPlayer: 1 }),
      counters: counters({ perSeason: { hex_scroll: 1 }, perPlayer: { hex_scroll: 1 } }),
    });
    expect(gateCandidate(both, "positive")).toBe("max_per_season");
  });
});

describe("gateCandidate — cooldown", () => {
  it("does not cool down a key that has never dropped", () => {
    expect(gateCandidate(input({ entry: entry({ cooldownRolls: 5 }) }), "positive")).toBeNull();
  });

  it("rejects inside the window and releases it exactly at the boundary", () => {
    const at = (seasonRollSeq: number) =>
      gateCandidate(
        input({
          entry: entry({ cooldownRolls: 5 }),
          counters: counters({ lastDropRollSeq: { hex_scroll: 8 } }),
          seasonRollSeq,
        }),
        "positive",
      );
    expect(at(12)).toBe("cooldown"); // 12 - 8 = 4 < 5
    expect(at(13)).toBeNull(); // 13 - 8 = 5, not < 5
  });

  it("is consulted before the position and move gates", () => {
    expect(
      gateCandidate(
        input({
          entry: entry({ cooldownRolls: 5, minPosition: 99, unlockAfterMove: 99 }),
          counters: counters({ lastDropRollSeq: { hex_scroll: 8 } }),
          seasonRollSeq: 9,
        }),
        "positive",
      ),
    ).toBe("cooldown");
  });
});

describe("gateCandidate — board and season progress", () => {
  it("requires the minimum position, and allows arrival exactly there", () => {
    const at = (position: number) =>
      gateCandidate(input({ entry: entry({ minPosition: 20 }), player: player({ position }) }), "positive");
    expect(at(19)).toBe("min_position");
    expect(at(20)).toBeNull();
  });

  it("requires the unlock move count, and allows it exactly there", () => {
    const at = (moveCount: number) =>
      gateCandidate(
        input({ entry: entry({ unlockAfterMove: 7 }), player: player({ moveCount }) }),
        "positive",
      );
    expect(at(6)).toBe("unlock_after_move");
    expect(at(7)).toBeNull();
  });

  it("checks position before the move count", () => {
    expect(
      gateCandidate(input({ entry: entry({ minPosition: 99, unlockAfterMove: 99 }) }), "positive"),
    ).toBe("min_position");
  });
});

describe("gateCandidate — duplicates and inventory", () => {
  it("keeps a unique effect off the wheel while it is active", () => {
    expect(
      gateCandidate(input({ candidate: EFFECT, activeEffectKeys: ["slowed"] }), "negative"),
    ).toBe("duplicate_unique");
  });

  it.each(["refresh", "stack"] as const)("lets a %s effect drop again while active", (stacking) => {
    expect(
      gateCandidate(
        input({ candidate: { ...EFFECT, stacking }, activeEffectKeys: ["slowed"] }),
        "negative",
      ),
    ).toBeNull();
  });

  it("blocks an item exactly when the inventory is full, and treats size 0 as unlimited", () => {
    const held = (heldItemCount: number, inventorySize: number) =>
      gateCandidate(input({ config: cfg({ inventorySize }), heldItemCount }), "positive");
    expect(held(1, 2)).toBeNull();
    expect(held(2, 2)).toBe("inventory_full");
    expect(held(99, 0)).toBeNull();
  });

  it("never lets a full inventory block an effect — effects are not carried", () => {
    expect(
      gateCandidate(
        input({ candidate: EFFECT, config: cfg({ inventorySize: 1 }), heldItemCount: 1 }),
        "negative",
      ),
    ).toBeNull();
  });
});

describe("gateCandidate — season-wide limits (spec §4.5)", () => {
  const MOVER: PoolCandidate = { ...EFFECT, key: "swamp", stacking: "stack", tags: ["movement"] };

  it("takes an entry with a disabled tag off the wheel, right after its own switch", () => {
    const tagged = input({ candidate: { ...ITEM, tags: ["directed", "dice"] }, config: cfg({ disabledTags: ["dice"] }) });
    expect(gateCandidate(tagged, "positive")).toBe("disabled_tag");
    expect(gateCandidate({ ...tagged, entry: entry({ weight: 0 }) }, "positive")).toBe("zero_weight");
    expect(gateCandidate(input({ candidate: { ...ITEM, tags: ["directed"] }, config: cfg({ disabledTags: ["dice"] }) }), "positive")).toBeNull();
    // A disabled tag outranks every counter.
    expect(
      gateCandidate({ ...tagged, entry: entry({ maxPerSeason: 0 }) }, "positive"),
    ).toBe("disabled_tag");
  });

  it("caps the effects a player carries, and treats null as no cap", () => {
    const carrying = (n: number, cap: number | null) =>
      gateCandidate(
        input({
          candidate: MOVER,
          config: cfg({ maxActiveEffectsPerPlayer: cap }),
          activeEffectKeys: Array.from({ length: n }, (_, i) => `other_${i}`),
        }),
        "negative",
      );
    expect(carrying(1, 2)).toBeNull();
    expect(carrying(2, 2)).toBe("effect_limit");
    expect(carrying(0, 0)).toBe("effect_limit");
    expect(carrying(50, null)).toBeNull();
  });

  it("never counts the effect cap against an item", () => {
    expect(
      gateCandidate(input({ config: cfg({ maxActiveEffectsPerPlayer: 0 }), activeEffectKeys: ["a", "b"] }), "positive"),
    ).toBeNull();
  });

  it("caps a tag by the player's active instances carrying it", () => {
    const limited = (count: number) =>
      gateCandidate(
        input({ candidate: MOVER, config: cfg({ tagLimits: { movement: 2 } }), activeTagCounts: { movement: count } }),
        "negative",
      );
    expect(limited(1)).toBeNull();
    expect(limited(2)).toBe("tag_limit");
    // No counts read means none held.
    expect(gateCandidate(input({ candidate: MOVER, config: cfg({ tagLimits: { movement: 1 } }) }), "negative")).toBeNull();
    // A limit on another tag does not apply.
    expect(
      gateCandidate(input({ candidate: MOVER, config: cfg({ tagLimits: { dice: 0 } }), activeTagCounts: { dice: 5 } }), "negative"),
    ).toBeNull();
  });

  it("lets a held refresh effect drop again past both limits — it extends its clock, it adds nothing", () => {
    const refresh: PoolCandidate = { ...MOVER, stacking: "refresh" };
    const full = {
      config: cfg({ maxActiveEffectsPerPlayer: 1, tagLimits: { movement: 1 } }),
      activeEffectKeys: ["swamp"],
      activeTagCounts: { movement: 1 },
    };
    expect(gateCandidate(input({ candidate: refresh, ...full }), "negative")).toBeNull();
    // A stacking effect adds an instance, so the limits hold.
    expect(gateCandidate(input({ candidate: MOVER, ...full }), "negative")).toBe("effect_limit");
    // Not held yet: a refresh effect would add one too.
    expect(gateCandidate(input({ candidate: refresh, ...full, activeEffectKeys: ["other"] }), "negative")).toBe("effect_limit");
  });

  it("checks the effect cap before the tag limits", () => {
    expect(
      gateCandidate(
        input({
          candidate: MOVER,
          config: cfg({ maxActiveEffectsPerPlayer: 1, tagLimits: { movement: 1 } }),
          activeEffectKeys: ["other"],
          activeTagCounts: { movement: 1 },
        }),
        "negative",
      ),
    ).toBe("effect_limit");
  });
});

describe("gateCandidate — a rival to move (spec §6.9)", () => {
  const CHASE: PoolCandidate = { ...EFFECT, key: "chase", polarity: "positive", needsBehind: true };

  it("keeps an entry that moves the nearest rival behind off the wheel when nobody is behind", () => {
    expect(gateCandidate(input({ candidate: CHASE, playersBehind: 0 }), "positive")).toBe("nobody_behind");
    expect(gateCandidate(input({ candidate: CHASE, playersBehind: 1 }), "positive")).toBeNull();
  });

  it("treats an unknown count as someone behind — the drop-table preview has no landing cell", () => {
    expect(gateCandidate(input({ candidate: CHASE }), "positive")).toBeNull();
  });

  it("never applies to an entry that needs no rival", () => {
    expect(gateCandidate(input({ candidate: { ...CHASE, needsBehind: false }, playersBehind: 0 }), "positive")).toBeNull();
  });

  it("comes after the season counters and the board gates", () => {
    expect(
      gateCandidate(input({ candidate: CHASE, playersBehind: 0, entry: entry({ minPosition: 99 }) }), "positive"),
    ).toBe("min_position");
  });
});

describe("gateCandidate — cursed and unique items (spec §6.10)", () => {
  const CURSED: PoolCandidate = { kind: "item", key: "heavy_boots", polarity: "negative", tier: 0, character: "penalty", unique: true };

  it("keeps a unique item off the wheel of a holder who has it", () => {
    expect(gateCandidate(input({ candidate: CURSED, heldItemKeys: ["heavy_boots"] }), "negative")).toBe("duplicate_unique");
    expect(gateCandidate(input({ candidate: CURSED, heldItemKeys: ["hex_scroll"] }), "negative")).toBeNull();
    // Not unique: a second copy may drop.
    expect(gateCandidate(input({ candidate: { ...ITEM, unique: false }, heldItemKeys: ["hex_scroll"] }), "positive")).toBeNull();
  });

  it("a full inventory counts bonus items only: a cursed item takes no slot", () => {
    const full = { config: cfg({ inventorySize: 1 }), heldItemCount: 1 };
    expect(gateCandidate(input({ candidate: CURSED, ...full }), "negative")).toBeNull();
    expect(gateCandidate(input({ candidate: { ...ITEM, character: "bonus" }, ...full }), "positive")).toBe("inventory_full");
  });
});

describe("gateCandidate — one in the season (wave D, spec §6.19)", () => {
  const CROWN: PoolCandidate = { kind: "item", key: "crown", polarity: "positive", tier: 2, seasonUnique: true, unique: true };

  it("drops until one has been handed out, then never again — whoever holds it", () => {
    expect(gateCandidate(input({ candidate: CROWN }), "positive")).toBeNull();
    expect(gateCandidate(input({ candidate: CROWN, counters: counters({ perSeason: { crown: 1 } }) }), "positive")).toBe("unique_season");
    // An item one per player only drops again to someone who does not hold it.
    expect(gateCandidate(input({ candidate: { ...CROWN, seasonUnique: false }, counters: counters({ perSeason: { crown: 1 } }) }), "positive")).toBeNull();
  });
});
