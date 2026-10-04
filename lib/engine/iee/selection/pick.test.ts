import { describe, expect, it } from "vitest";
import type { IeeConfig, IeeEntryConfig, IeePlayerSnapshot } from "../../types/iee";
import type { PoolCandidate } from "./gates";
import {
  buildPool,
  buildSlices,
  catchUpMultiplier,
  dropTable,
  pickWheelOutcome,
  resolveParams,
  type PickInput,
  type WeightedCandidate,
} from "./pick";

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

const ITEM: PoolCandidate = { kind: "item", key: "hex_scroll", polarity: "positive", tier: 0 };
const EFFECT: PoolCandidate = { kind: "effect", key: "slowed", polarity: "negative", tier: 0, stacking: "unique" };

const counters = { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} };

const input = (over: Partial<PickInput> = {}): PickInput => ({
  polarity: "positive",
  config: cfg({ entries: { hex_scroll: entry() } }),
  catalog: [ITEM],
  catalogDefaults: { hex_scroll: { effectKey: "slowed" } },
  player: player(),
  counters,
  activeEffectKeys: [],
  heldItemCount: 0,
  seasonRollSeq: 10,
  playerCount: 4,
  rng: () => 0.5,
  ...over,
});

describe("catchUpMultiplier", () => {
  const on = { enabled: true, maxMultiplier: 4 };

  it("is exactly 1 when disabled, single-player, or the tier is common", () => {
    expect(catchUpMultiplier(3, 4, 4, "positive", { enabled: false, maxMultiplier: 4 })).toBe(1);
    expect(catchUpMultiplier(3, 2, 1, "positive", on)).toBe(1);
    expect(catchUpMultiplier(0, 4, 4, "positive", on)).toBe(1);
  });

  it("applies the boost proportionally to rarity: tier/3 of the way to the cap", () => {
    // trailing rank (lead = 1): 1 + (max - 1) * tier/3
    expect(catchUpMultiplier(3, 4, 4, "positive", on)).toBe(4);
    expect(catchUpMultiplier(2, 4, 4, "positive", on)).toBe(3);
    expect(catchUpMultiplier(1, 4, 4, "positive", on)).toBe(2);
  });

  it("gives the middle of the field a proportional boost, not the full one", () => {
    // rank 2 of 4 → lead = 1/3, top tier → 1 + 3 * (1/3) = 2
    expect(catchUpMultiplier(3, 2, 4, "positive", on)).toBeCloseTo(2, 10);
    expect(catchUpMultiplier(3, 3, 4, "positive", on)).toBeGreaterThan(2);
    expect(catchUpMultiplier(3, 3, 4, "positive", on)).toBeLessThan(4);
  });

  it("mirrors for negatives, so the leader draws the harsher ones", () => {
    expect(catchUpMultiplier(3, 1, 4, "negative", on)).toBe(4);
    expect(catchUpMultiplier(3, 4, 4, "negative", on)).toBe(1);
  });

  it("never exceeds the cap for in-range ranks", () => {
    for (let rank = 1; rank <= 4; rank++) {
      expect(catchUpMultiplier(3, rank, 4, "positive", on)).toBeLessThanOrEqual(4);
    }
  });
});

describe("buildPool", () => {
  it("silently drops a catalog entry the season never enabled", () => {
    const { weighted, debug } = buildPool(
      input({
        polarity: "negative",
        config: cfg({ entries: { slowed: entry() } }),
        catalog: [ITEM, EFFECT],
      }),
    );
    expect(weighted.map((w) => w.candidate.key)).toEqual(["slowed"]);
    // Absent from `entries` is not a rejection — it is not in the pool at all.
    expect(debug.rejected).toEqual({});
  });

  it("records the gate reason for each candidate that was rejected", () => {
    const { weighted, debug } = buildPool(
      input({
        polarity: "negative",
        config: cfg({ entries: { hex_scroll: entry(), slowed: entry() } }),
        catalog: [ITEM, EFFECT],
      }),
    );
    expect(debug.rejected).toEqual({ hex_scroll: "polarity" });
    expect(weighted.map((w) => w.candidate.key)).toEqual(["slowed"]);
  });

  it("carries the candidate and its entry through to the weighted list", () => {
    const { weighted } = buildPool(input());
    expect(weighted).toHaveLength(1);
    expect(weighted[0]!.candidate).toBe(ITEM);
    expect(weighted[0]!.entry).toEqual(entry());
    expect(weighted[0]!.weight).toBe(100);
  });
});

describe("buildSlices", () => {
  const weighed = (
    key: string,
    weight: number,
    kind: PoolCandidate["kind"] = "item",
  ): WeightedCandidate => ({
    candidate: { kind, key, polarity: "positive", tier: 0 },
    entry: entry(),
    weight,
  });

  it("returns shares that sum to 1 and omits a zero-weight 'nothing'", () => {
    const slices = buildSlices([weighed("a", 3), weighed("b", 1)], 0);
    expect(slices.map((s) => s.key)).toEqual(["a", "b"]);
    expect(slices.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1, 10);
  });

  it("appends the nothing slice with the right key and share when it carries weight", () => {
    const slices = buildSlices([weighed("a", 1)], 1);
    expect(slices).toHaveLength(2);
    expect(slices[1]).toMatchObject({ kind: "nothing", key: null, weight: 1, share: 0.5 });
  });

  it("reports a 0 share rather than NaN when nothing on the wheel has weight", () => {
    const slices = buildSlices([weighed("a", 0)], 0);
    expect(slices).toHaveLength(1);
    expect(slices[0]!.share).toBe(0);
  });
});

describe("resolveParams", () => {
  it("merges the season's overrides over the catalog defaults", () => {
    expect(resolveParams("x", { x: { a: 1, b: 2 } }, entry({ paramOverrides: { b: 9 } }))).toEqual({
      a: 1,
      b: 9,
    });
  });

  it("returns the catalog defaults when there is no entry to override them", () => {
    expect(resolveParams("x", { x: { a: 1 } }, undefined)).toEqual({ a: 1 });
  });

  it("returns the overrides alone for a key with no catalog defaults", () => {
    expect(resolveParams("y", {}, entry({ paramOverrides: { c: 3 } }))).toEqual({ c: 3 });
  });

  it("returns an empty bag when neither side provides anything", () => {
    expect(resolveParams("z", {}, undefined)).toEqual({});
  });
});

describe("pickWheelOutcome", () => {
  it("falls back with iee_disabled without ever calling rng", () => {
    let rngCalls = 0;
    const out = pickWheelOutcome(
      input({ config: cfg({ enabled: false }), rng: () => (rngCalls++, 0) }),
    );
    expect(out).toMatchObject({
      kind: "fallback",
      fallbackReason: "iee_disabled",
      key: null,
      params: {},
      slices: [],
    });
    expect(rngCalls).toBe(0);
  });

  it("falls back with empty_pool when nothing survives the gates", () => {
    const out = pickWheelOutcome(input({ config: cfg({ entries: {} }) }));
    expect(out).toMatchObject({ kind: "fallback", fallbackReason: "empty_pool" });
  });

  it("resolves the picked candidate's params from defaults plus the season", () => {
    const out = pickWheelOutcome(
      input({
        config: cfg({ entries: { hex_scroll: entry({ paramOverrides: { effectKey: "shield" } }) } }),
      }),
    );
    expect(out).toMatchObject({ kind: "item", key: "hex_scroll", polarity: "positive" });
    expect(out.params).toEqual({ effectKey: "shield" });
  });

  it("returns the nothing outcome when the nothing slice is drawn", () => {
    const out = pickWheelOutcome(
      input({
        config: cfg({ entries: { hex_scroll: entry({ weight: 1 }) }, nothingWeight: 99 }),
        rng: () => 0.999,
      }),
    );
    expect(out).toMatchObject({ kind: "nothing", key: null, params: {} });
  });

  it("carries the full slice list, with shares, on every outcome", () => {
    const out = pickWheelOutcome(input());
    expect(out.slices).toHaveLength(1);
    expect(out.slices[0]).toMatchObject({ kind: "item", key: "hex_scroll", share: 1 });
  });

  it("falls to the last (nothing) slice when rng returns exactly 1", () => {
    // Floating-point drift: the subtraction loop never goes negative, so the
    // picker must still return the final slice rather than throw or return
    // undefined.
    const out = pickWheelOutcome(
      input({
        config: cfg({ entries: { hex_scroll: entry({ weight: 1 }) }, nothingWeight: 1 }),
        rng: () => 1,
      }),
    );
    expect(out).toMatchObject({ kind: "nothing", key: null, params: {} });
  });

  it("resolves a non-null last candidate through the same drift path", () => {
    const out = pickWheelOutcome(input({ rng: () => 1 }));
    expect(out).toMatchObject({ kind: "item", key: "hex_scroll" });
    expect(out.params).toEqual({ effectKey: "slowed" });
  });
});

describe("dropTable", () => {
  it("reports the shares the picker actually draws from", () => {
    const table = dropTable(
      input({ config: cfg({ entries: { hex_scroll: entry({ weight: 3 }) }, nothingWeight: 1 }) }),
    );
    expect(table.map((s) => [s.key, s.share])).toEqual([
      ["hex_scroll", 0.75],
      [null, 0.25],
    ]);
  });
});
