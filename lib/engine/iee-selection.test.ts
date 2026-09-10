import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG, IeeConfigSchema } from "./config";
import {
  buildPool,
  buildSlices,
  catalogCandidates,
  catalogDefaults,
  catchUpMultiplier,
  dropTable,
  gateCandidate,
  pickWheelOutcome,
  type PickInput,
  type PoolCandidate,
} from "./iee";
import type { IeeConfig, IeeEntryConfig, IeePlayerSnapshot } from "./types";

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

const cfg = (over: Partial<IeeConfig> = {}): IeeConfig =>
  IeeConfigSchema.parse({ enabled: true, ...over });

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

const noCounters = { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} };

const ITEM: PoolCandidate = { kind: "item", key: "hex_scroll", polarity: "positive", tier: 0 };
const EFFECT: PoolCandidate = {
  kind: "effect",
  key: "slowed",
  polarity: "negative",
  tier: 0,
  stacking: "unique",
};

const input = (over: Partial<PickInput> = {}): PickInput => ({
  polarity: "positive",
  config: cfg({ entries: { hex_scroll: entry() } }),
  catalog: [ITEM, EFFECT],
  catalogDefaults: { hex_scroll: { effectKey: "slowed" }, slowed: { steps: 1 } },
  player: player(),
  counters: noCounters,
  activeEffectKeys: [],
  heldItemCount: 0,
  seasonRollSeq: 10,
  playerCount: 4,
  rng: () => 0.5,
  ...over,
});

// --- gates -----------------------------------------------------------------

describe("gateCandidate", () => {
  const base = {
    candidate: ITEM,
    entry: entry(),
    config: cfg(),
    player: player(),
    counters: noCounters,
    activeEffectKeys: [] as string[],
    heldItemCount: 0,
    seasonRollSeq: 10,
  };

  it("passes an eligible candidate", () => {
    expect(gateCandidate(base, "positive")).toBeNull();
  });

  it("rejects a disabled entry", () => {
    expect(gateCandidate({ ...base, entry: entry({ enabled: false }) }, "positive")).toBe("disabled");
  });

  it("rejects the wrong pool", () => {
    expect(gateCandidate(base, "negative")).toBe("polarity");
  });

  it("honours polarityOverride", () => {
    const over = { ...base, entry: entry({ polarityOverride: "negative" as const }) };
    expect(gateCandidate(over, "negative")).toBeNull();
    expect(gateCandidate(over, "positive")).toBe("polarity");
  });

  it("rejects zero weight", () => {
    expect(gateCandidate({ ...base, entry: entry({ weight: 0 }) }, "positive")).toBe("zero_weight");
  });

  it("enforces maxPerSeason and maxPerPlayer", () => {
    expect(
      gateCandidate(
        { ...base, entry: entry({ maxPerSeason: 2 }), counters: { ...noCounters, perSeason: { hex_scroll: 2 } } },
        "positive",
      ),
    ).toBe("max_per_season");
    expect(
      gateCandidate(
        { ...base, entry: entry({ maxPerPlayer: 1 }), counters: { ...noCounters, perPlayer: { hex_scroll: 1 } } },
        "positive",
      ),
    ).toBe("max_per_player");
  });

  it("enforces the cooldown window and releases it afterwards", () => {
    const counters = { ...noCounters, lastDropRollSeq: { hex_scroll: 8 } };
    const withCooldown = { ...base, entry: entry({ cooldownRolls: 5 }), counters };
    expect(gateCandidate({ ...withCooldown, seasonRollSeq: 10 }, "positive")).toBe("cooldown");
    expect(gateCandidate({ ...withCooldown, seasonRollSeq: 13 }, "positive")).toBeNull();
  });

  it("enforces minPosition and unlockAfterMove", () => {
    expect(
      gateCandidate({ ...base, entry: entry({ minPosition: 20 }) }, "positive"),
    ).toBe("min_position");
    expect(
      gateCandidate({ ...base, entry: entry({ unlockAfterMove: 9 }) }, "positive"),
    ).toBe("unlock_after_move");
  });

  it("keeps a unique effect off the wheel when it is already active", () => {
    expect(
      gateCandidate(
        { ...base, candidate: EFFECT, activeEffectKeys: ["slowed"] },
        "negative",
      ),
    ).toBe("duplicate_unique");
  });

  it("lets a refreshing effect drop again while active", () => {
    const refreshing: PoolCandidate = { ...EFFECT, stacking: "refresh" };
    expect(
      gateCandidate(
        { ...base, candidate: refreshing, activeEffectKeys: ["slowed"] },
        "negative",
      ),
    ).toBeNull();
  });

  it("blocks an item drop when the inventory is full, but not an effect", () => {
    expect(
      gateCandidate({ ...base, config: cfg({ inventorySize: 2 }), heldItemCount: 2 }, "positive"),
    ).toBe("inventory_full");
    expect(
      gateCandidate(
        { ...base, candidate: EFFECT, config: cfg({ inventorySize: 2 }), heldItemCount: 2 },
        "negative",
      ),
    ).toBeNull();
  });

  it("treats inventorySize 0 as unlimited", () => {
    expect(
      gateCandidate({ ...base, config: cfg({ inventorySize: 0 }), heldItemCount: 99 }, "positive"),
    ).toBeNull();
  });
});

// --- pool & slices ---------------------------------------------------------

describe("buildPool", () => {
  it("ignores catalog entries the season never enabled", () => {
    const { weighted, debug } = buildPool(input());
    expect(weighted.map((w) => w.candidate.key)).toEqual(["hex_scroll"]);
    // `slowed` is absent from `entries`, so it is not even a rejection.
    expect(debug.rejected).toEqual({});
  });

  it("reports why a candidate was rejected", () => {
    const { debug } = buildPool(
      input({ config: cfg({ entries: { hex_scroll: entry({ minPosition: 30 }) } }) }),
    );
    expect(debug.rejected).toEqual({ hex_scroll: "min_position" });
  });
});

describe("buildSlices", () => {
  it("computes shares that sum to 1", () => {
    const slices = buildSlices(
      [
        { candidate: ITEM, entry: entry(), weight: 75 },
        { candidate: EFFECT, entry: entry(), weight: 25 },
      ],
      0,
    );
    expect(slices.map((s) => s.share)).toEqual([0.75, 0.25]);
  });

  it("adds the nothing slice only when it has weight", () => {
    const weighted = [{ candidate: ITEM, entry: entry(), weight: 50 }];
    expect(buildSlices(weighted, 0)).toHaveLength(1);
    const withNothing = buildSlices(weighted, 50);
    expect(withNothing).toHaveLength(2);
    expect(withNothing[1]).toMatchObject({ kind: "nothing", key: null, share: 0.5 });
  });
});

// --- catch-up --------------------------------------------------------------

describe("catchUpMultiplier", () => {
  const on = { enabled: true, maxMultiplier: 2 };

  it("is inert when disabled or with a single player", () => {
    expect(catchUpMultiplier(3, 4, 4, "positive", { enabled: false, maxMultiplier: 2 })).toBe(1);
    expect(catchUpMultiplier(3, 1, 1, "positive", on)).toBe(1);
  });

  it("never boosts common entries — scaling everything would change nothing", () => {
    expect(catchUpMultiplier(0, 4, 4, "positive", on)).toBe(1);
  });

  it("boosts strong positives for the trailing player, not the leader", () => {
    expect(catchUpMultiplier(3, 4, 4, "positive", on)).toBe(2);
    expect(catchUpMultiplier(3, 1, 4, "positive", on)).toBe(1);
  });

  it("mirrors for negatives: the leader draws the harsher ones", () => {
    expect(catchUpMultiplier(3, 1, 4, "negative", on)).toBe(2);
    expect(catchUpMultiplier(3, 4, 4, "negative", on)).toBe(1);
  });

  it("stays within maxMultiplier", () => {
    for (const rank of [1, 2, 3, 4]) {
      for (const tier of [0, 1, 2, 3]) {
        const m = catchUpMultiplier(tier, rank, 4, "positive", on);
        expect(m).toBeGreaterThanOrEqual(1);
        expect(m).toBeLessThanOrEqual(2);
      }
    }
  });
});

// --- picking ---------------------------------------------------------------

describe("pickWheelOutcome", () => {
  it("falls back when the subsystem is off", () => {
    const out = pickWheelOutcome(input({ config: cfg({ enabled: false }) }));
    expect(out).toMatchObject({ kind: "fallback", fallbackReason: "iee_disabled" });
  });

  it("falls back on an empty pool instead of throwing", () => {
    const out = pickWheelOutcome(input({ config: cfg({ entries: {} }) }));
    expect(out).toMatchObject({ kind: "fallback", fallbackReason: "empty_pool" });
  });

  it("falls back when every candidate is gated out", () => {
    const out = pickWheelOutcome(
      input({ config: cfg({ entries: { hex_scroll: entry({ minPosition: 99 }) } }) }),
    );
    expect(out).toMatchObject({ kind: "fallback", fallbackReason: "empty_pool" });
  });

  it("returns the only candidate and resolves its params", () => {
    const out = pickWheelOutcome(input());
    expect(out).toMatchObject({ kind: "item", key: "hex_scroll" });
    expect(out.params).toEqual({ effectKey: "slowed" });
    expect(out.slices).toHaveLength(1);
  });

  it("lets season overrides win over catalog defaults", () => {
    const out = pickWheelOutcome(
      input({
        polarity: "negative",
        config: cfg({ entries: { slowed: entry({ paramOverrides: { steps: 3 } }) } }),
      }),
    );
    expect(out.params).toEqual({ steps: 3 });
  });

  it("is deterministic for a given rng", () => {
    const seeded = input({
      config: cfg({ entries: { hex_scroll: entry({ weight: 50 }) }, nothingWeight: 50 }),
    });
    expect(pickWheelOutcome({ ...seeded, rng: () => 0.1 }).kind).toBe("item");
    expect(pickWheelOutcome({ ...seeded, rng: () => 0.9 }).kind).toBe("nothing");
  });

  it("respects weights over many draws", () => {
    let call = 0;
    const draws = 10_000;
    const rng = () => (call++ + 0.5) / draws; // sweeps [0,1) uniformly
    const shared = input({
      polarity: "negative",
      config: cfg({
        entries: { slowed: entry({ weight: 30 }) },
        nothingWeight: 70,
      }),
      catalog: [{ ...EFFECT, stacking: "refresh" }],
    });
    let effects = 0;
    for (let i = 0; i < draws; i++) {
      if (pickWheelOutcome({ ...shared, rng }).kind === "effect") effects++;
    }
    expect(effects / draws).toBeCloseTo(0.3, 2);
  });

  it("never picks a slice that is not on the wheel", () => {
    let call = 0;
    const draws = 500;
    const rng = () => (call++ + 0.5) / draws;
    const shared = input({
      config: cfg({ entries: { hex_scroll: entry(), slowed: entry() } }),
    });
    for (let i = 0; i < draws; i++) {
      const out = pickWheelOutcome({ ...shared, rng });
      // `slowed` is negative, so a positive wheel must never return it.
      expect(out.key).not.toBe("slowed");
    }
  });

  it("handles rng() returning values at the very top of the range", () => {
    const out = pickWheelOutcome(input({ rng: () => 0.999999999 }));
    expect(out.kind).toBe("item");
  });
});

describe("dropTable", () => {
  it("matches what the picker actually draws from", () => {
    const table = dropTable(
      input({ config: cfg({ entries: { hex_scroll: entry({ weight: 25 }) }, nothingWeight: 75 }) }),
    );
    expect(table.map((s) => [s.key, s.share])).toEqual([
      ["hex_scroll", 0.25],
      [null, 0.75],
    ]);
  });
});

// --- catalog ---------------------------------------------------------------

describe("catalog helpers", () => {
  it("flattens items and effects into one candidate list", () => {
    const candidates = catalogCandidates();
    expect(candidates.find((c) => c.key === "hex_scroll")).toMatchObject({
      kind: "item",
      polarity: "positive",
      tier: 0,
    });
    expect(candidates.find((c) => c.key === "slowed")).toMatchObject({
      kind: "effect",
      polarity: "negative",
      stacking: "refresh",
    });
  });

  it("exposes catalog defaults per key", () => {
    // Asserted per entry, not as a snapshot of the whole catalog: an exact
    // toEqual here breaks every time an item or effect is added.
    const defaults = catalogDefaults();
    expect(defaults.hex_scroll).toEqual({ effectKey: "slowed" });
    expect(defaults.slowed).toEqual({ steps: 1 });
    for (const key of Object.keys(defaults)) {
      expect(typeof defaults[key]).toBe("object");
    }
  });

  it("gives every catalog entry a defaults entry", () => {
    const defaults = catalogDefaults();
    for (const c of catalogCandidates()) {
      expect(defaults[c.key]).toBeDefined();
    }
  });

  it("ships every catalog entry with i18n keys, never literal text", () => {
    for (const c of catalogCandidates()) {
      expect(c.key).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("keeps the IEE subsystem off in the default season config", () => {
    expect(DEFAULT_SEASON_CONFIG.iee.enabled).toBe(false);
    expect(DEFAULT_SEASON_CONFIG.iee.allowTargetingOthers).toBe(false);
  });
});
