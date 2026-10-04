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
  entries: {},
  events: [],
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
