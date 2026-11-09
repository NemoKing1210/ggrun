import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IeeInstanceRow, SeasonPlayer } from "@/db/schema";
import {
  DEFAULT_SEASON_CONFIG,
  emptyModifiers,
  type IeeConfig,
  type IeePlayerSnapshot,
} from "@/lib/engine";
import { grant, type ExecContext } from "@/lib/modules/iee/executor";
import { memoryStore } from "@/lib/modules/iee/executor/memory-store.test-helpers";
import { coreRegistry, type SeasonRegistry } from "@/lib/modules/iee/registry";
import { catalogRegistry, type CatalogTuning } from "@/lib/modules/iee/registry/catalog.test-helpers";

import {
  applyWheel,
  loadTurnHooks,
  loadWheelContext,
  polarityForCell,
  settleTurnHooks,
} from "./iee";

vi.mock("@/lib/infrastructure/db", () => ({ db: { marker: "db" } }));

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const repo = vi.hoisted(() => ({
  listActiveInstances: vi.fn(),
  loadPoolContext: vi.fn(),
  toPlayerSnapshot: vi.fn(),
  snapshotsOf: vi.fn(),
}));
vi.mock("@/lib/modules/iee/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/iee/repository")>()),
  ...repo,
}));

const SEASON = "season-1";
const ME = "sp-1";
const REGISTRY = coreRegistry();

/** A catalog row's tuning — the entry attached with its own defaults unless overridden. */
function entry(overrides: CatalogTuning = {}): CatalogTuning {
  return overrides;
}

/**
 * The season under test: its settings, and — remembered for `exec` — a
 * registry that attaches exactly `entries`, the way its catalog would.
 */
const registries = new WeakMap<IeeConfig, SeasonRegistry>();
function config(entries: Record<string, CatalogTuning> = {}, overrides: Partial<IeeConfig> = {}): IeeConfig {
  const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true, ...overrides };
  registries.set(iee, catalogRegistry(entries));
  return iee;
}

function sp(overrides: Partial<SeasonPlayer> = {}): SeasonPlayer {
  return {
    id: ME,
    seasonId: SEASON,
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

const snapshot: IeePlayerSnapshot = {
  seasonPlayerId: ME,
  position: 3,
  balancePoints: 10,
  rollSeq: 4,
  moveCount: 10,
  rank: 1,
  status: "active",
};

const poolContext = {
  counters: { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} },
  player: snapshot,
  activeEffectKeys: [] as string[],
  activeTagCounts: {} as Record<string, number>,
  heldItemCount: 0,
  seasonRollSeq: 12,
  playerCount: 2,
};

/** A turn's execution context over an in-memory store; without a config, the season plays the whole fixture. */
function exec(over: Partial<ExecContext> = {}) {
  const mem = memoryStore({ balances: { [ME]: 10 } });
  const iee = over.config ?? { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true };
  const ctx: ExecContext = {
    store: mem.store,
    seasonId: SEASON,
    registry: registries.get(iee) ?? REGISTRY,
    config: iee,
    seasonRollSeq: 12,
    actorPlayerId: ME,
    rng: () => 0.5,
    snapshot: async (id) => ({ ...snapshot, seasonPlayerId: id }),
    anchorFor: async () => ({ anchorRollSeq: 4 }),
    ...over,
  };
  return { ctx, ...mem };
}

/** A live instance row as the repository returns it. */
function instance(key: string, overrides: Partial<IeeInstanceRow> = {}): IeeInstanceRow {
  const def = REGISTRY.get(key)!;
  const start = REGISTRY.start(def);
  return {
    id: `inst-${key}`,
    seasonId: SEASON,
    entryId: def.entryId,
    revisionId: def.revisionId,
    kind: def.kind,
    holderKind: "player",
    holderPlayerId: ME,
    holderCellIndex: null,
    holderRollId: null,
    ownerPlayerId: null,
    aimedPlayerId: null,
    chosen: null,
    params: start.params,
    chargesLeft: def.kind === "item" ? start.charges : null,
    remaining: def.kind === "effect" ? start.remaining : null,
    remainingUnit: def.kind === "effect" ? start.unit : null,
    anchorRollSeq: def.kind === "effect" ? 3 : null,
    countFromRollSeq: null,
    status: "active",
    endReason: null,
    source: "cell_penalty",
    sourceMoveId: null,
    causeJournalId: null,
    grantedRollSeq: 0,
    grantedAt: new Date(0),
    endedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.listActiveInstances.mockResolvedValue([]);
  repo.toPlayerSnapshot.mockResolvedValue(snapshot);
  repo.loadPoolContext.mockResolvedValue(poolContext);
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

describe("loadWheelContext", () => {
  it("reads the picker's inputs under the season's registry, from the cell the move landed on", async () => {
    await expect(loadWheelContext(sp(), REGISTRY, 17)).resolves.toBe(poolContext);
    expect(repo.loadPoolContext).toHaveBeenCalledWith(expect.objectContaining({ id: ME }), REGISTRY, 17);
  });
});

describe("applyWheel", () => {
  function spin(
    cfg: IeeConfig,
    overrides: Partial<Parameters<typeof applyWheel>[1]> = {},
    ctxOver: Partial<ExecContext> = {},
  ) {
    const env = exec({ config: cfg, ...ctxOver });
    const result = applyWheel(env.ctx, {
      sp: sp(),
      polarity: "positive",
      iee: cfg,
      context: poolContext,
      moveId: "move-1",
      turnRollSeq: 5,
      rng: () => 0,
      ...overrides,
    });
    return { env, result };
  }

  it("falls back without writing when the subsystem is off", async () => {
    const { env, result } = spin(config({ ward: entry() }, { enabled: false }));
    await expect(result).resolves.toMatchObject({
      outcome: { kind: "fallback", fallbackReason: "iee_disabled" },
      events: [],
    });
    expect(env.instances).toEqual([]);
    expect(env.journal).toEqual([]);
  });

  it("falls back without writing when the pool is empty", async () => {
    const { env, result } = spin(config({}));
    await expect(result).resolves.toMatchObject({ outcome: { kind: "fallback", fallbackReason: "empty_pool" } });
    expect(env.instances).toEqual([]);
  });

  it("grants an item through the executor and feeds it, tied to the move", async () => {
    const { env, result } = spin(config({ hex_scroll: entry() }));
    const { outcome, events } = await result;

    expect(outcome).toMatchObject({ kind: "item", key: "hex_scroll" });
    expect(env.instances).toHaveLength(1);
    expect(env.instances[0]).toMatchObject({
      kind: "item",
      holderPlayerId: ME,
      source: "cell_bonus",
      sourceMoveId: "move-1",
      grantedRollSeq: 12,
      chargesLeft: 1,
    });
    expect(env.journal[0]).toMatchObject({ op: "grant", visibility: "public" });
    expect(events).toEqual([
      {
        eventType: "item_granted",
        payload: {
          itemKey: "hex_scroll",
          instanceId: env.instances[0]!.id,
          source: "cell_bonus",
          polarity: "positive",
          name: REGISTRY.get("hex_scroll")!.names,
        },
      },
    ]);
  });

  it("journals the wheel's draws with the grant they decided", async () => {
    let n = 0;
    const draws = [0.31, 0.62, 0.93];
    const { env, result } = spin(config({ hex_scroll: entry(), speed_boots: entry() }), {
      rng: () => draws[n++ % draws.length]!,
    });
    await result;
    expect(n).toBeGreaterThan(0);
    expect(env.journal[0]).toMatchObject({ op: "grant", rng: draws.slice(0, n) });
  });

  it("anchors a dropped effect at the roll being resolved — it starts with the next one", async () => {
    const { env, result } = spin(config({ ward: entry() }));
    const { outcome, events } = await result;

    expect(outcome).toMatchObject({ kind: "effect", key: "ward" });
    expect(env.instances[0]).toMatchObject({
      kind: "effect",
      source: "cell_bonus",
      sourceMoveId: "move-1",
      anchorRollSeq: 5,
      remaining: 1,
      remainingUnit: "triggers",
    });
    expect(events).toEqual([
      expect.objectContaining({
        eventType: "effect_applied",
        payload: expect.objectContaining({ effectKey: "ward", refreshed: false, source: "cell_bonus" }),
      }),
    ]);
  });

  it("marks a refreshed drop in the feed", async () => {
    const env = exec({ config: config({ tailwind: entry() }) });
    await grant(env.ctx, { entry: "tailwind", to: ME, source: "item", reveal: false });
    const { events } = await applyWheel(env.ctx, {
      sp: sp(),
      polarity: "positive",
      iee: config({ tailwind: entry() }),
      context: poolContext,
      moveId: "move-1",
      turnRollSeq: 5,
      rng: () => 0,
    });
    expect(env.instances).toHaveLength(1);
    expect(events[0]).toMatchObject({ payload: expect.objectContaining({ refreshed: true }) });
  });

  it("shows nothing when a unique grant is nevertheless blocked", async () => {
    const env = exec({ config: config({ unlucky: entry() }) });
    await grant(env.ctx, { entry: "unlucky", to: ME, source: "item", reveal: false });
    // A stale picker context: the gate that normally keeps a duplicate out of
    // the wheel did not see the status.
    const result = await applyWheel(env.ctx, {
      sp: sp(),
      polarity: "negative",
      iee: config({ unlucky: entry() }),
      context: poolContext,
      moveId: "move-1",
      turnRollSeq: 5,
      rng: () => 0,
    });

    expect(result.outcome).toMatchObject({ kind: "nothing", key: null });
    expect(result.events).toEqual([]);
    expect(env.instances).toHaveLength(1);
    expect(logger.log.debug).toHaveBeenCalledWith("iee.grant.blocked", { key: "unlucky", state: "blocked_unique" });
  });

  it("shows nothing when a season limit blocks the grant the wheel picked", async () => {
    const iee = config({ unlucky: entry(), ward: entry() }, { maxActiveEffectsPerPlayer: 1 });
    const env = exec({ config: iee });
    await grant(env.ctx, { entry: "ward", to: ME, source: "item", reveal: false });
    // A stale picker context again: it did not see the status already held.
    const result = await applyWheel(env.ctx, {
      sp: sp(),
      polarity: "negative",
      iee,
      context: poolContext,
      moveId: "move-1",
      turnRollSeq: 5,
      rng: () => 0,
    });

    expect(result.outcome).toMatchObject({ kind: "nothing", key: null });
    expect(env.instances).toHaveLength(1);
    expect(logger.log.debug).toHaveBeenCalledWith("iee.grant.blocked", { key: "unlucky", state: "blocked_limit" });
  });

  it("renders the nothing slice when the wheel lands on it", async () => {
    const { env, result } = spin(config({ ward: entry({ weight: 1 }) }, { nothingWeight: 9 }), { rng: () => 0.999 });
    expect((await result).outcome.kind).toBe("nothing");
    expect(env.instances).toEqual([]);
  });

  it("stays silent about drops when the season hides them, and journals them for staff", async () => {
    const { env, result } = spin(config({ ward: entry() }, { revealDropsInFeed: false }));
    const { outcome, events } = await result;
    expect(outcome.kind).toBe("effect");
    expect(events).toEqual([]);
    expect(env.instances).toHaveLength(1);
    expect(env.journal[0]).toMatchObject({ op: "grant", visibility: "staff" });
  });

  it("falls back when selection picks a key the registry cannot resolve", async () => {
    const ghost = catalogRegistry({ ward: entry() }).entryConfigs().ward!;
    const drifted: SeasonRegistry = {
      ...REGISTRY,
      candidates: () => [{ kind: "effect", key: "ghost", polarity: "positive", tier: 1, stacking: "refresh" }],
      entryConfigs: () => ({ ghost }),
      defaults: () => ({ ghost: {} }),
    };
    const { env, result } = spin(config(), {}, { registry: drifted });
    const { outcome, events } = await result;
    expect(outcome).toMatchObject({ kind: "fallback", fallbackReason: "unknown_key" });
    expect(events).toEqual([]);
    expect(env.instances).toEqual([]);
    expect(env.journal[0]).toMatchObject({ op: "noop", outcome: { reason: "unknown_entry" } });
  });
});

describe("loadTurnHooks", () => {
  it("returns empty hooks when IEE is disabled, without reading instances", async () => {
    const hooks = await loadTurnHooks(sp(), false, 5, REGISTRY);
    expect(hooks.run("afterMovement", { rollSeq: 5 })).toEqual(emptyModifiers());
    expect(hooks.fired).toEqual([]);
    expect(repo.listActiveInstances).not.toHaveBeenCalled();
  });

  it("returns empty hooks when the player carries nothing", async () => {
    const hooks = await loadTurnHooks(sp(), true, 5, REGISTRY);
    expect(hooks.run("afterMovement", { rollSeq: 5 })).toEqual(emptyModifiers());
    expect(repo.toPlayerSnapshot).not.toHaveBeenCalled();
  });

  it("ignores held items — only effects have a say in a turn", async () => {
    repo.listActiveInstances.mockResolvedValue([instance("hex_scroll")]);
    const hooks = await loadTurnHooks(sp(), true, 5, REGISTRY);
    expect(hooks.run("afterMovement", { rollSeq: 5 })).toEqual(emptyModifiers());
    expect(repo.toPlayerSnapshot).not.toHaveBeenCalled();
  });

  it("runs a carried status at its hook with the real snapshot, and records the firing", async () => {
    repo.listActiveInstances.mockResolvedValue([instance("heavy_boots")]);
    const hooks = await loadTurnHooks(sp(), true, 5, REGISTRY);

    expect(repo.toPlayerSnapshot).toHaveBeenCalledWith(expect.objectContaining({ id: ME }));
    expect(hooks.run("afterMovement", { rollSeq: 5 })).toMatchObject({
      stepsDelta: -2,
      reasons: ["effect:heavy_boots"],
    });
    expect(hooks.fired).toEqual([
      expect.objectContaining({ instanceId: "inst-heavy_boots", key: "heavy_boots", hook: "afterMovement", ruleIndex: 0 }),
    ]);
  });

  it("reads where the players its effects remember stand — and asks nothing when there are none (spec §6.11)", async () => {
    repo.snapshotsOf.mockResolvedValue(new Map([["sp-2", { ...snapshot, seasonPlayerId: "sp-2" }]]));
    repo.listActiveInstances.mockResolvedValue([instance("heavy_boots", { aimedPlayerId: "sp-2" }), instance("ward", { aimedPlayerId: "sp-2" })]);
    await loadTurnHooks(sp(), true, 5, REGISTRY);
    expect(repo.snapshotsOf).toHaveBeenCalledWith(["sp-2"]);
    repo.snapshotsOf.mockClear();
    repo.listActiveInstances.mockResolvedValue([instance("heavy_boots")]);
    await loadTurnHooks(sp(), true, 5, REGISTRY);
    expect(repo.snapshotsOf).not.toHaveBeenCalled();
  });

  it("plays the parameters the instance was granted with, not today's defaults", async () => {
    repo.listActiveInstances.mockResolvedValue([instance("heavy_boots", { params: { steps: -4 } })]);
    const hooks = await loadTurnHooks(sp(), true, 5, REGISTRY);
    expect(hooks.run("afterMovement", { rollSeq: 5 }).stepsDelta).toBe(-4);
  });

  it("keeps a status granted during this very roll out of it (SC-HEXSCROLL-7)", async () => {
    repo.listActiveInstances.mockResolvedValue([instance("heavy_boots", { anchorRollSeq: 5 })]);
    const hooks = await loadTurnHooks(sp(), true, 5, REGISTRY);
    expect(hooks.run("afterMovement", { rollSeq: 5 })).toEqual(emptyModifiers());
    expect(repo.toPlayerSnapshot).not.toHaveBeenCalled();
  });

  it("skips a revision the season no longer plays instead of throwing", async () => {
    repo.listActiveInstances.mockResolvedValue([
      instance("heavy_boots", { revisionId: "00000000-0000-4000-8000-00000000dead" }),
    ]);
    const hooks = await loadTurnHooks(sp(), true, 5, REGISTRY);
    expect(hooks.run("afterMovement", { rollSeq: 5 })).toEqual(emptyModifiers());
  });

  it("collects the charge a vetoing status asked to spend", async () => {
    repo.listActiveInstances.mockResolvedValue([instance("ward")]);
    const hooks = await loadTurnHooks(sp(), true, 5, REGISTRY);

    const mods = hooks.run("beforeCellEffect", { rollSeq: 5, cellType: "penalty" });
    expect(mods.skipCellEffect).toBe(true);
    expect([...hooks.consumed]).toEqual(["inst-ward"]);
  });

  it("leaves the charge alone for a landing that would not hurt", async () => {
    repo.listActiveInstances.mockResolvedValue([instance("ward")]);
    const hooks = await loadTurnHooks(sp(), true, 5, REGISTRY);

    const mods = hooks.run("beforeCellEffect", { rollSeq: 5, cellType: "bonus" });
    expect(mods.skipCellEffect).toBe(false);
    expect([...hooks.consumed]).toEqual([]);
    expect(hooks.fired).toEqual([]);
  });

});

describe("settleTurnHooks", () => {
  function turn(over: Partial<Parameters<typeof settleTurnHooks>[2]> = {}) {
    return { seasonPlayerId: ME, turnRollSeq: 5, outcome: "passed" as const, moved: true, reveal: true, ...over };
  }

  it("counts every in-force duration down by the roll and ends what runs out", async () => {
    const env = exec();
    await grant(env.ctx, { entry: "heavy_boots", to: ME, source: "cell_penalty", reveal: false });
    await grant(env.ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: false });
    const hooks = await loadTurnHooks(sp(), false, 5, REGISTRY);

    const feed = await settleTurnHooks(env.ctx, hooks, turn());

    const boots = env.instances.find((i) => i.revisionId === REGISTRY.get("heavy_boots")!.revisionId)!;
    const swamp = env.instances.find((i) => i.revisionId === REGISTRY.get("swamp")!.revisionId)!;
    expect(boots).toMatchObject({ status: "ended", endReason: "expired", remaining: 0 });
    expect(swamp).toMatchObject({ status: "active", remaining: 1 });
    expect(feed).toEqual([
      expect.objectContaining({ eventType: "effect_expired", payload: expect.objectContaining({ effectKey: "heavy_boots" }) }),
    ]);
  });

  it("does not count down a status that did not take part in the roll", async () => {
    const env = exec({ anchorFor: async () => ({ anchorRollSeq: 5 }) });
    await grant(env.ctx, { entry: "heavy_boots", to: ME, source: "item", reveal: false });
    const feed = await settleTurnHooks(env.ctx, await loadTurnHooks(sp(), false, 5, REGISTRY), turn());
    expect(env.instances[0]).toMatchObject({ status: "active", remaining: 1 });
    expect(feed).toEqual([]);
  });

  it("journals each firing and spends the trigger a ward asked for", async () => {
    const env = exec();
    const ward = await grant(env.ctx, { entry: "ward", to: ME, source: "cell_bonus", reveal: false });
    repo.listActiveInstances.mockImplementation(async () => env.store.activeForHolder(ME));
    const hooks = await loadTurnHooks(sp(), true, 5, REGISTRY);
    hooks.run("beforeCellEffect", { rollSeq: 5, cellType: "penalty" });

    const feed = await settleTurnHooks(env.ctx, hooks, turn({ reveal: false }));

    expect(env.journal.map((j) => j.op)).toEqual(["grant", "fire", "tick", "expire"]);
    expect(env.journal[1]).toMatchObject({
      instanceId: ward.instanceId,
      ruleIndex: 0,
      intent: { hook: "beforeCellEffect" },
      outcome: { skipCellEffect: true, consumeCharge: true },
    });
    expect(env.instances[0]).toMatchObject({ status: "ended", endReason: "expired" });
    // Hidden drops stay hidden at the end too.
    expect(feed).toEqual([]);
  });

  it("carries out what the rules asked the executor to do", async () => {
    const env = exec();
    const hooks = await loadTurnHooks(sp(), false, 5, REGISTRY);
    hooks.intents.push({ kind: "balance", to: "sp-rival", delta: 2, reason: "effect:test" });
    env.balances.set("sp-rival", 1);

    await settleTurnHooks(env.ctx, hooks, turn());

    expect(env.ledger).toEqual([{ seasonPlayerId: "sp-rival", delta: 2, reason: expect.any(String) }]);
    expect(env.balances.get("sp-rival")).toBe(3);
  });

  it("counts a roll-counted status down even when a rule cancelled the move", async () => {
    const env = exec();
    await grant(env.ctx, { entry: "heavy_boots", to: ME, source: "cell_penalty", reveal: false });
    await settleTurnHooks(env.ctx, await loadTurnHooks(sp(), false, 5, REGISTRY), turn({ moved: false }));
    expect(env.instances[0]).toMatchObject({ status: "ended", remaining: 0 });
  });
});
