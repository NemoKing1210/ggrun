import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerEffectRow, SeasonPlayer } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, emptyModifiers, type IeeConfig, type IeeEntryConfig } from "@/lib/engine";

import {
  applyWheel,
  expireEffectsFor,
  loadActiveEffects,
  loadTurnHooks,
  polarityForCell,
  settleTurnHooks,
} from "./iee";

const dbFake = vi.hoisted(() => ({ db: { marker: "db" }, tx: { marker: "tx" } }));
vi.mock("@/lib/infrastructure/db", () => ({ db: dbFake.db }));

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const repo = vi.hoisted(() => ({
  getActiveEffectRows: vi.fn(),
  loadPoolContext: vi.fn(),
  markEffectsEnded: vi.fn(),
  spendEffectCharges: vi.fn(),
  toPlayerSnapshot: vi.fn(),
}));
vi.mock("@/lib/modules/iee/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/iee/repository")>()),
  ...repo,
}));

const grants = vi.hoisted(() => ({ grantEffect: vi.fn(), grantInventoryItem: vi.fn() }));
vi.mock("./grant", () => grants);

const TX = dbFake.tx as never;

function entry(overrides: Partial<IeeEntryConfig> = {}): IeeEntryConfig {
  return {
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
    ...overrides,
  };
}

function config(entries: Record<string, IeeEntryConfig> = {}, overrides: Partial<IeeConfig> = {}): IeeConfig {
  return { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true, entries, ...overrides };
}

function sp(overrides: Partial<SeasonPlayer> = {}): SeasonPlayer {
  return {
    id: "sp-1",
    seasonId: "season-1",
    playerId: "user-1",
    position: 3,
    balancePoints: 10,
    status: "active",
    streakPass: 0,
    streakDrop: 0,
    rerollsUsed: 0,
    rollSeq: 4,
    joinedAt: new Date(0),
    finishedAt: null,
    ...overrides,
  };
}

function effectRow(overrides: Partial<PlayerEffectRow> = {}): PlayerEffectRow {
  return {
    id: "eff-1",
    seasonId: "season-1",
    seasonPlayerId: "sp-1",
    effectKey: "heavy_boots",
    params: {},
    polarity: "negative",
    chargesLeft: null,
    expiresAfterRollSeq: 50,
    state: "active",
    appliedBySeasonPlayerId: null,
    source: "cell_penalty",
    seasonRollSeq: 0,
    sourceMoveId: null,
    appliedAt: new Date(0),
    endedAt: null,
    ...overrides,
  };
}

const snapshot = {
  seasonPlayerId: "sp-1",
  position: 3,
  balancePoints: 10,
  rollSeq: 4,
  moveCount: 10,
  rank: 1,
  status: "active" as const,
};

const poolContext = {
  counters: { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} },
  player: snapshot,
  activeEffectKeys: [] as string[],
  heldItemCount: 0,
  seasonRollSeq: 12,
  playerCount: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.getActiveEffectRows.mockResolvedValue([]);
  repo.toPlayerSnapshot.mockResolvedValue(snapshot);
  grants.grantEffect.mockResolvedValue({ state: "granted", row: { id: "eff-1" }, def: { key: "shield" } });
  grants.grantInventoryItem.mockResolvedValue({ id: "inv-1", itemKey: "hex_scroll" });
});

describe("polarityForCell", () => {
  it.each([
    ["bonus", "positive"],
    ["penalty", "negative"],
  ] as const)("maps %s to %s", (cellType, polarity) => {
    expect(polarityForCell(cellType)).toBe(polarity);
  });

  it.each(["normal", "start", "finish", "event", null])("leaves %s without a wheel", (cellType) => {
    expect(polarityForCell(cellType)).toBeNull();
  });
});

describe("applyWheel", () => {
  function spin(cfg: IeeConfig, overrides: Partial<Parameters<typeof applyWheel>[1]> = {}) {
    return applyWheel(TX, {
      seasonId: "season-1",
      sp: sp(),
      polarity: "positive",
      iee: cfg,
      context: poolContext,
      moveId: "move-1",
      nextRollSeq: 5,
      rng: () => 0,
      ...overrides,
    });
  }

  it("falls back without writing when the subsystem is off", async () => {
    const result = await spin(config({ shield: entry() }, { enabled: false }));
    expect(result.outcome).toMatchObject({ kind: "fallback", fallbackReason: "iee_disabled" });
    expect(result.events).toEqual([]);
    expect(grants.grantEffect).not.toHaveBeenCalled();
  });

  it("falls back without writing when the pool is empty", async () => {
    const result = await spin(config({}));
    expect(result.outcome).toMatchObject({ kind: "fallback", fallbackReason: "empty_pool" });
    expect(grants.grantEffect).not.toHaveBeenCalled();
  });

  it("grants an item and feeds it, anchored to the move", async () => {
    const result = await spin(config({ hex_scroll: entry() }));

    expect(result.outcome).toMatchObject({ kind: "item", key: "hex_scroll" });
    expect(grants.grantInventoryItem).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        seasonPlayerId: "sp-1",
        itemKey: "hex_scroll",
        source: "cell_bonus",
        sourceMoveId: "move-1",
        seasonRollSeq: 12,
      }),
    );
    expect(result.events).toEqual([
      {
        eventType: "item_granted",
        payload: { itemKey: "hex_scroll", inventoryId: "inv-1", source: "cell_bonus", polarity: "positive" },
      },
    ]);
  });

  it("grants an effect with the resolving roll as its anchor", async () => {
    const result = await spin(config({ shield: entry() }));

    expect(grants.grantEffect).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        effectKey: "shield",
        anchorRollSeq: 5,
        source: "cell_bonus",
        sourceMoveId: "move-1",
      }),
    );
    expect(result.events).toEqual([
      {
        eventType: "effect_applied",
        payload: { effectKey: "shield", effectId: "eff-1", refreshed: false, source: "cell_bonus", polarity: "positive" },
      },
    ]);
  });

  it("marks a refreshed drop in the feed", async () => {
    grants.grantEffect.mockResolvedValue({ state: "refreshed", row: { id: "eff-1" }, def: { key: "shield" } });
    const result = await spin(config({ shield: entry() }));
    expect(result.events[0]).toMatchObject({ payload: expect.objectContaining({ refreshed: true }) });
  });

  it("shows nothing when a unique grant is nevertheless blocked", async () => {
    grants.grantEffect.mockResolvedValue({ state: "blocked_unique", row: null, def: { key: "unlucky" } });
    const result = await spin(config({ unlucky: entry() }), { polarity: "negative" });

    expect(result.outcome).toMatchObject({ kind: "nothing", key: null });
    expect(result.events).toEqual([]);
    expect(logger.log.debug).toHaveBeenCalledWith("iee.grant.blocked_unique", { key: "unlucky" });
  });

  it("renders the nothing slice when the wheel lands on it", async () => {
    const result = await spin(config({ shield: entry({ weight: 1 }) }, { nothingWeight: 9 }), { rng: () => 0.999 });
    expect(result.outcome.kind).toBe("nothing");
    expect(grants.grantEffect).not.toHaveBeenCalled();
  });

  it("stays silent about drops when the season hides them", async () => {
    const result = await spin(config({ shield: entry() }, { revealDropsInFeed: false }));
    expect(result.outcome.kind).toBe("effect");
    expect(result.events).toEqual([]);
  });

  it("falls back when selection picks a key with no definition", async () => {
    grants.grantEffect.mockResolvedValue(null);
    const result = await spin(config({ shield: entry() }));
    expect(result.outcome).toMatchObject({ kind: "fallback", fallbackReason: "unknown_key" });
    expect(result.events).toEqual([]);
  });
});

describe("expireEffectsFor", () => {
  it("does nothing when no status has run out", async () => {
    repo.getActiveEffectRows.mockResolvedValue([effectRow({ expiresAfterRollSeq: 50 })]);
    await expect(expireEffectsFor(TX, "sp-1", 5)).resolves.toEqual([]);
    expect(repo.markEffectsEnded).not.toHaveBeenCalled();
  });

  it("marks a run-out status expired and announces it", async () => {
    repo.getActiveEffectRows.mockResolvedValue([
      effectRow({ id: "eff-old", effectKey: "slowed", expiresAfterRollSeq: 4 }),
    ]);
    await expect(expireEffectsFor(TX, "sp-1", 5, true)).resolves.toEqual([
      { eventType: "effect_expired", payload: { effectKey: "slowed", effectId: "eff-old" } },
    ]);
    expect(repo.markEffectsEnded).toHaveBeenCalledWith(["eff-old"], "expired", TX);
  });

  it("marks expiration but stays silent when reveal is off", async () => {
    repo.getActiveEffectRows.mockResolvedValue([
      effectRow({ id: "eff-old", effectKey: "slowed", expiresAfterRollSeq: 4 }),
    ]);
    await expect(expireEffectsFor(TX, "sp-1", 5, false)).resolves.toEqual([]);
    expect(repo.markEffectsEnded).toHaveBeenCalledWith(["eff-old"], "expired", TX);
  });

  it("counts a spent charge as expired", async () => {
    repo.getActiveEffectRows.mockResolvedValue([
      effectRow({ id: "eff-shell", effectKey: "shield", chargesLeft: 0, expiresAfterRollSeq: null }),
    ]);
    const events = await expireEffectsFor(TX, "sp-1", 5);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ payload: { effectId: "eff-shell" } });
  });
});

describe("loadActiveEffects", () => {
  it("returns only the statuses still in force at that roll", async () => {
    repo.getActiveEffectRows.mockResolvedValue([
      effectRow({ id: "eff-live", expiresAfterRollSeq: 6 }),
      effectRow({ id: "eff-dead", expiresAfterRollSeq: 4 }),
    ]);
    const active = await loadActiveEffects("sp-1", 5);
    expect(active.map((e) => e.id)).toEqual(["eff-live"]);
    expect(repo.getActiveEffectRows).toHaveBeenCalledWith("sp-1");
  });
});

describe("settleTurnHooks", () => {
  it("does nothing when no effect asked for a charge", async () => {
    await settleTurnHooks(TX, { run: () => emptyModifiers(), consumed: new Set(), active: [] });
    expect(repo.spendEffectCharges).not.toHaveBeenCalled();
  });

  it("spends one charge on every effect that asked", async () => {
    await settleTurnHooks(TX, { run: () => emptyModifiers(), consumed: new Set(["eff-1", "eff-2"]), active: [] });
    expect(repo.spendEffectCharges).toHaveBeenCalledWith(["eff-1", "eff-2"], TX);
  });
});

describe("loadTurnHooks", () => {
  it("returns empty hooks when IEE is disabled, without reading effects", async () => {
    const hooks = await loadTurnHooks(sp(), false, 5);
    expect(hooks.active).toEqual([]);
    expect(hooks.run("afterMovement", { rollSeq: 5 })).toEqual(emptyModifiers());
    expect(repo.getActiveEffectRows).not.toHaveBeenCalled();
  });

  it("returns empty hooks when the player carries nothing", async () => {
    const hooks = await loadTurnHooks(sp(), true, 5);
    expect(hooks.active).toEqual([]);
    expect(repo.toPlayerSnapshot).not.toHaveBeenCalled();
  });

  it("runs a carried status at its hook with the real snapshot", async () => {
    repo.getActiveEffectRows.mockResolvedValue([effectRow({ effectKey: "heavy_boots", expiresAfterRollSeq: 50 })]);
    const hooks = await loadTurnHooks(sp(), true, 5);

    expect(hooks.active).toHaveLength(1);
    expect(repo.toPlayerSnapshot).toHaveBeenCalledWith(expect.objectContaining({ id: "sp-1" }));
    expect(hooks.run("afterMovement", { rollSeq: 5 })).toMatchObject({
      stepsDelta: -2,
      reasons: ["effect:heavy_boots"],
    });
  });

  it("drops a status that expired on this very roll", async () => {
    repo.getActiveEffectRows.mockResolvedValue([effectRow({ expiresAfterRollSeq: 4 })]);
    const hooks = await loadTurnHooks(sp(), true, 5);
    expect(hooks.active).toEqual([]);
    expect(repo.toPlayerSnapshot).not.toHaveBeenCalled();
  });

  it("collects the charge a vetoing status asked to spend", async () => {
    repo.getActiveEffectRows.mockResolvedValue([
      effectRow({ id: "eff-shield", effectKey: "shield", chargesLeft: 1, expiresAfterRollSeq: null }),
    ]);
    const hooks = await loadTurnHooks(sp(), true, 5);

    const mods = hooks.run("beforeCellEffect", { rollSeq: 5, cellType: "penalty" });
    expect(mods.skipCellEffect).toBe(true);
    expect([...hooks.consumed]).toEqual(["eff-shield"]);
  });

  it("leaves the charge alone for a landing that would not hurt", async () => {
    repo.getActiveEffectRows.mockResolvedValue([
      effectRow({ id: "eff-shield", effectKey: "shield", chargesLeft: 1, expiresAfterRollSeq: null }),
    ]);
    const hooks = await loadTurnHooks(sp(), true, 5);

    const mods = hooks.run("beforeCellEffect", { rollSeq: 5, cellType: "bonus" });
    expect(mods.skipCellEffect).toBe(false);
    expect([...hooks.consumed]).toEqual([]);
  });
});
