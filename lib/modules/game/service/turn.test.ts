import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Board, BoardCell, GameRoll, IeeInstanceRow, SeasonPlayer } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, type SeasonConfig } from "@/lib/engine";
import type { ExecContext } from "@/lib/modules/iee/executor";
import type { ContextInput } from "@/lib/modules/iee/executor/context";
import { memoryStore } from "@/lib/modules/iee/executor/memory-store.test-helpers";
import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";
import { buildRegistry, coreRegistry, type SeasonRegistry } from "@/lib/modules/iee/registry";
import { catalogRegistry } from "@/lib/modules/iee/registry/catalog.test-helpers";

import { answerReactionWindow, applyResolvedTurn } from "./turn";

const eventLogTable = vi.hoisted(() => ({}));
const movesTable = vi.hoisted(() => ({}));
const gameRollsTable = vi.hoisted(() => ({}));
const seasonPlayersTable = vi.hoisted(() => ({}));
const ledgerEntriesTable = vi.hoisted(() => ({}));
const gamesCatalogTable = vi.hoisted(() => ({}));

/**
 * Minimal thenable Drizzle stand-in. Tables are opaque markers in the mocked
 * schema module, so a write can be attributed to the table it targeted.
 */
const dbFake = vi.hoisted(() => {
  interface Chain {
    from(...args: unknown[]): Chain;
    where(...args: unknown[]): Chain;
    orderBy(...args: unknown[]): Chain;
    limit(...args: unknown[]): Chain;
    set(values: Record<string, unknown>): Chain;
    values(values: unknown): Chain;
    returning(...args: unknown[]): Chain;
    then(onFulfilled: (rows: unknown[]) => unknown): Promise<unknown>;
  }
  const selectResults: unknown[][] = [];
  const returningResults: unknown[][] = [];
  const updates: { table: unknown; values: Record<string, unknown> }[] = [];
  const inserts: { table: unknown; values: unknown }[] = [];
  function chain(resolve: () => unknown[]): Chain {
    const c: Chain = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      set: () => c,
      values: () => c,
      returning: () => c,
      then: (onFulfilled) => Promise.resolve(resolve()).then(onFulfilled),
    };
    return c;
  }
  const db = {
    select: () => chain(() => selectResults.shift() ?? []),
    update: (table: unknown) => {
      const c = chain(() => []);
      c.set = (values: Record<string, unknown>) => {
        updates.push({ table, values });
        return c;
      };
      return c;
    },
    insert: (table: unknown) => {
      const c = chain(() => []);
      c.values = (values: unknown) => {
        inserts.push({ table, values });
        return c;
      };
      c.returning = () => chain(() => returningResults.shift() ?? []);
      return c;
    },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return {
    db,
    selectResults,
    returningResults,
    updates,
    inserts,
    reset: () => {
      selectResults.length = 0;
      returningResults.length = 0;
      updates.length = 0;
      inserts.length = 0;
    },
  };
});
vi.mock("@/lib/infrastructure/db", () => ({ db: dbFake.db }));

vi.mock("@/db/schema", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/schema")>();
  return {
    ...actual,
    eventLog: eventLogTable,
    moves: movesTable,
    gameRolls: gameRollsTable,
    seasonPlayers: seasonPlayersTable,
    ledgerEntries: ledgerEntriesTable,
    gamesCatalog: gamesCatalogTable,
  };
});

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const seasons = vi.hoisted(() => ({ getMainBoard: vi.fn(), getBoardCells: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => seasons);

const events = vi.hoisted(() => ({ assignEventFromCell: vi.fn() }));
vi.mock("./events", () => events);

const repo = vi.hoisted(() => ({
  listActiveInstances: vi.fn(),
  // The objects standing on the board (wave D, spec §6.18): none, unless a test says so.
  listActiveObjects: vi.fn(async (_seasonId: string): Promise<IeeInstanceRow[]> => []),
  loadPoolContext: vi.fn(),
  toPlayerSnapshot: vi.fn(),
}));
vi.mock("@/lib/modules/iee/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/iee/repository")>()),
  ...repo,
}));

const context = vi.hoisted(() => ({ executionContext: vi.fn() }));
vi.mock("@/lib/modules/iee/executor/context", () => context);

// What waits for the player (wave B, spec §7.4, §7.6): nothing, unless a test says so; announcements recorded.
const decisionReads = vi.hoisted(() => ({ hasPendingDecision: vi.fn(async () => false), announceDecisions: vi.fn(async () => {}) }));
vi.mock("@/lib/modules/iee/decisions", () => decisionReads);

// A season plays its catalog, read from the database; these tests play the
// system pack's fixture instead, or the catalog a test sets.
const played = vi.hoisted(() => ({ registry: null as SeasonRegistry | null }));
vi.mock("@/lib/modules/iee/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/modules/iee/registry")>();
  return { ...actual, getSeasonRegistry: async () => played.registry ?? actual.coreRegistry() };
});

const REGISTRY = coreRegistry();

/**
 * IEE state lives in an in-memory store the real executor writes: the turn's
 * hooks read it through `listActiveInstances`, and the transaction's context
 * writes it — so a test sees what the turn left behind, not calls into mocks.
 */
let mem = memoryStore();

function holding(key: string, overrides: Partial<IeeInstanceRow> = {}): IeeInstanceRow {
  const def = REGISTRY.get(key)!;
  const start = REGISTRY.start(def);
  const row: IeeInstanceRow = {
    id: `inst-${key}`,
    seasonId: "season-1",
    entryId: def.entryId,
    revisionId: def.revisionId,
    kind: def.kind,
    holderKind: "player",
    holderPlayerId: "sp-1",
    holderCellIndex: null,
    holderRollId: null,
    ownerPlayerId: null,
    aimedPlayerId: null,
    chosen: null,
    params: start.params,
    chargesLeft: def.kind === "item" ? start.charges : null,
    remaining: def.kind === "effect" ? start.remaining : null,
    remainingUnit: def.kind === "effect" ? start.unit : null,
    // Granted before the roll being resolved, so it takes part in it.
    anchorRollSeq: def.kind === "effect" ? 3 : null,
    countFromRollSeq: null,
    status: "active",
    endReason: null,
    source: "cell_bonus",
    sourceMoveId: null,
    causeJournalId: null,
    grantedRollSeq: 0,
    grantedAt: new Date(0),
    endedAt: null,
    ...overrides,
  };
  mem.instances.push(row);
  return row;
}

const live = (id: string) => mem.instances.find((i) => i.id === id);

function seasonPlayer(overrides: Partial<SeasonPlayer> = {}): SeasonPlayer {
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

function gameRoll(overrides: Partial<GameRoll> = {}): GameRoll {
  return {
    id: "roll-1",
    seasonPlayerId: "sp-1",
    gameId: "game-1",
    status: "in_progress",
    hoursSpent: null,
    difficultyLevel: null,
    notes: null,
    rating: null,
    postponedUntilSeq: null,
    rolledAt: new Date(0),
    resolvedAt: null,
    ...overrides,
  };
}

function config(patch: Partial<SeasonConfig> = {}): SeasonConfig {
  const base = structuredClone(DEFAULT_SEASON_CONFIG);
  return {
    ...base,
    // A balance that adds to a pass would make every expected position depend
    // on it; the tests state their own movement instead.
    points: { ...base.points, bonusAddsToRollOnPass: false },
    ...patch,
  };
}

function cell(position: number, cellType: string, cellConfig: Record<string, unknown> = {}): BoardCell {
  return { id: `c-${position}`, boardId: "board-1", position, cellType, label: null, config: cellConfig } as BoardCell;
}

/** The board the turn will land on: cell `position` is the only interesting one. */
function boardWith(...cells: BoardCell[]): void {
  seasons.getMainBoard.mockResolvedValue({ id: "board-1" } as Board);
  seasons.getBoardCells.mockResolvedValue(cells);
}

function eventLogValues(): Array<Record<string, unknown>> {
  return dbFake.inserts
    .filter((i) => i.table === eventLogTable)
    .flatMap((i) => (Array.isArray(i.values) ? (i.values as Array<Record<string, unknown>>) : [i.values as Record<string, unknown>]));
}

function feedOfType(eventType: string): Record<string, unknown> | undefined {
  return eventLogValues().find((e) => e.eventType === eventType);
}

beforeEach(() => {
  played.registry = null;
  dbFake.reset();
  vi.clearAllMocks();
  vi.spyOn(Math, "random").mockReturnValue(0);
  seasons.getMainBoard.mockResolvedValue(null);
  seasons.getBoardCells.mockResolvedValue([]);
  events.assignEventFromCell.mockResolvedValue([]);
  mem = memoryStore({ balances: { "sp-1": 10 } });
  repo.listActiveInstances.mockImplementation(async (holder: string) => mem.store.activeForHolder(holder));
  context.executionContext.mockImplementation(
    async (input: ContextInput): Promise<ExecContext> => ({
      store: mem.store,
      seasonId: input.seasonId,
      registry: input.registry ?? REGISTRY,
      config: input.config,
      seasonRollSeq: input.seasonRollSeq ?? 0,
      actorPlayerId: input.actorPlayerId ?? null,
      rng: () => 0,
      ...(input.decisions ? { decisions: input.decisions } : {}),
      snapshot: async (id) => ({
        seasonPlayerId: id,
        position: 4,
        balancePoints: 10,
        rollSeq: 5,
        moveCount: 5,
        rank: 1,
        status: "active",
      }),
      anchorFor: async () => ({ anchorRollSeq: 5 }),
    }),
  );
  repo.toPlayerSnapshot.mockImplementation(async (sp: SeasonPlayer) => ({
    seasonPlayerId: sp.id,
    position: sp.position,
    balancePoints: sp.balancePoints,
    rollSeq: sp.rollSeq,
    moveCount: 0,
    rank: 1,
    status: sp.status,
  }));
  dbFake.returningResults.push([{ id: "move-1" }]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyResolvedTurn — movement and cell composition", () => {
  it("moves a passed player forward and records the move, the clock and the feed", async () => {
    boardWith(cell(4, "normal"));
    dbFake.selectResults.push([{ title: "Hades" }]);

    const result = await applyResolvedTurn({
      sp: seasonPlayer({ position: 3 }),
      roll: gameRoll(),
      outcome: "passed",
      notes: "nice",
      rating: 9,
      config: config(),
    });

    expect(result).toEqual({ diceResults: [1], fromPosition: 3, toPosition: 4, newBalancePoints: 10 });

    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        table: movesTable,
        values: expect.objectContaining({
          seasonPlayerId: "sp-1",
          gameRollId: "roll-1",
          fromPosition: 3,
          toPosition: 4,
          diceResults: [1],
          cellLandedType: "normal",
        }),
      }),
    );
    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({
        table: gameRollsTable,
        values: expect.objectContaining({ status: "passed", notes: "nice", rating: 9, resolvedAt: expect.any(Date) }),
      }),
    );
    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({
        table: seasonPlayersTable,
        values: expect.objectContaining({
          position: 4,
          streakPass: 1,
          streakDrop: 0,
          rollSeq: 5,
        }),
      }),
    );
    expect(feedOfType("game_passed")).toMatchObject({
      payload: expect.objectContaining({ title: "Hades", dice: [1], notes: "nice", rating: 9 }),
    });
    expect(feedOfType("moved")).toMatchObject({ payload: { from: 3, to: 4, dice: [1], cellType: "normal" } });
  });

  it("promotes a freshly rolled roll before applying the outcome", async () => {
    boardWith(cell(4, "normal"));
    await expect(
      applyResolvedTurn({
        sp: seasonPlayer(),
        roll: gameRoll({ status: "rolled" }),
        outcome: "passed",
        notes: null,
        rating: null,
        config: config(),
      }),
    ).resolves.toMatchObject({ toPosition: 4 });
    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({ table: gameRollsTable, values: expect.objectContaining({ status: "passed" }) }),
    );
  });

  it("moves a dropped player backwards and grows the drop streak", async () => {
    boardWith(cell(4, "normal"));
    const result = await applyResolvedTurn({
      sp: seasonPlayer({ position: 10, streakDrop: 2 }),
      roll: gameRoll(),
      outcome: "dropped",
      notes: "gave up",
      rating: null,
      config: config({ dice: { sides: 6, passDiceCount: 1, dropDiceCount: 2, dropStreakMultiplier: true } }),
    });

    // Two ones, doubled for a streak of two: magnitude 2 * (2 + 1) = 6.
    expect(result).toMatchObject({ diceResults: [1, 1], fromPosition: 10, toPosition: 4 });
    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({
        table: seasonPlayersTable,
        values: expect.objectContaining({ streakDrop: 3, streakPass: 0 }),
      }),
    );
    expect(feedOfType("game_dropped")).toBeDefined();
  });

  it("still lands the move when the season has no board", async () => {
    const result = await applyResolvedTurn({
      sp: seasonPlayer(),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config(),
    });
    expect(result.toPosition).toBe(4);
    expect(feedOfType("moved")).toMatchObject({ payload: expect.objectContaining({ cellType: null }) });
    expect(dbFake.inserts.some((i) => i.table === ledgerEntriesTable)).toBe(false);
  });

  it("adds a bonus cell's points to the ledger and the balance", async () => {
    boardWith(cell(4, "bonus", { amount: 5 }));
    const result = await applyResolvedTurn({
      sp: seasonPlayer({ balancePoints: 2 }),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config(),
    });

    expect(result.newBalancePoints).toBe(7);
    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        table: ledgerEntriesTable,
        values: expect.objectContaining({ delta: 5, reason: "bonus", relatedMoveId: "move-1" }),
      }),
    );
    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({
        table: seasonPlayersTable,
        values: expect.objectContaining({ balancePoints: 7 }),
      }),
    );
  });

  it("records only the penalty that actually happened when the balance floors at zero", async () => {
    boardWith(cell(4, "penalty", { amount: -9 }));
    const result = await applyResolvedTurn({
      sp: seasonPlayer({ balancePoints: 3 }),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config(),
    });

    expect(result.newBalancePoints).toBe(0);
    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        table: ledgerEntriesTable,
        values: expect.objectContaining({ delta: -3, reason: "penalty" }),
      }),
    );
  });

  it("finishes the run on the finish cell, in the move's own transaction", async () => {
    boardWith(cell(9, "finish"));
    const result = await applyResolvedTurn({
      sp: seasonPlayer({ position: 8 }),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config({ board: { ...DEFAULT_SEASON_CONFIG.board, size: 10, loop: false } }),
    });

    expect(result.toPosition).toBe(9);
    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({
        table: seasonPlayersTable,
        values: expect.objectContaining({ status: "finished", finishedAt: expect.any(Date) }),
      }),
    );
    expect(feedOfType("player_finished")).toMatchObject({
      payload: { position: 9, rollSeq: 5 },
    });
  });
});

describe("applyResolvedTurn — effects inside the turn", () => {
  it("assigns an event cell's challenge when IEE is enabled", async () => {
    boardWith(cell(4, "event"));
    events.assignEventFromCell.mockResolvedValue([
      { eventType: "event_assigned", payload: { eventKey: "k1", title: "Collect", playerEventId: "pe-1" } },
    ]);
    const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true, events: ["k1"] };

    await applyResolvedTurn({
      sp: seasonPlayer(),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config({ iee }),
    });

    expect(events.assignEventFromCell).toHaveBeenCalledWith(
      dbFake.db,
      expect.objectContaining({
        seasonId: "season-1",
        seasonPlayerId: "sp-1",
        pool: ["k1"],
        moveId: "move-1",
      }),
    );
    expect(feedOfType("event_assigned")).toMatchObject({
      payload: { eventKey: "k1", title: "Collect", playerEventId: "pe-1" },
    });
  });

  it("lets a ward absorb a penalty landing and spends its charge", async () => {
    boardWith(cell(4, "penalty", { amount: -3 }));
    holding("ward");
    const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true, revealDropsInFeed: true };

    const result = await applyResolvedTurn({
      sp: seasonPlayer({ balancePoints: 10 }),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config({ iee }),
    });

    // The landing was absorbed: no point moved, no ledger row, and no wheel —
    // the wheel is a second consequence of the same landing.
    expect(result.newBalancePoints).toBe(10);
    expect(result.wheel).toBeUndefined();
    expect(repo.loadPoolContext).not.toHaveBeenCalled();
    expect(dbFake.inserts.some((i) => i.table === ledgerEntriesTable)).toBe(false);
    expect(feedOfType("effect_cleansed")).toMatchObject({
      payload: { absorbed: "penalty", by: "ward", effectKey: "ward", name: REGISTRY.get("ward")!.names },
    });
    expect(feedOfType("effect_applied")).toBeUndefined();
    // The ward's trigger is spent inside the same transaction, and journaled.
    expect(live("inst-ward")).toMatchObject({ status: "ended", endReason: "expired", remaining: 0 });
    expect(mem.journal.map((j) => j.op)).toEqual(["fire", "tick", "expire"]);
  });

  it("pays out an onOutcome effect through the ledger and a second balance write", async () => {
    boardWith(cell(4, "normal"));
    holding("momentum");
    const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true };

    const result = await applyResolvedTurn({
      sp: seasonPlayer({ balancePoints: 10 }),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config({ iee }),
    });

    expect(result.newBalancePoints).toBe(11);
    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        table: ledgerEntriesTable,
        values: expect.objectContaining({ delta: 1, reason: "effect:momentum" }),
      }),
    );
    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({
        table: seasonPlayersTable,
        values: expect.objectContaining({ balancePoints: 11 }),
      }),
    );
    // One of its three rolls is spent.
    expect(live("inst-momentum")).toMatchObject({ status: "active", remaining: 2 });
  });

  it("keeps a status granted during this roll out of it, and does not count it down", async () => {
    boardWith(cell(4, "normal"));
    holding("heavy_boots", { anchorRollSeq: 5 });
    const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true };

    const result = await applyResolvedTurn({
      sp: seasonPlayer({ position: 3, rollSeq: 4 }),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config({ iee }),
    });

    expect(result.toPosition).toBe(4);
    expect(live("inst-heavy_boots")).toMatchObject({ status: "active", remaining: 1 });
  });

  it("spins a bonus cell's wheel inside the turn and grants through the executor", async () => {
    boardWith(cell(4, "bonus", { amount: 5 }));
    // The season's catalog: «Сапоги скорости» alone on the bonus wheel.
    const season = catalogRegistry({ speed_boots: {} });
    played.registry = season;
    const iee = {
      ...structuredClone(DEFAULT_SEASON_CONFIG.iee),
      enabled: true,
      revealDropsInFeed: true,
      nothingWeight: 0,
    };
    repo.loadPoolContext.mockResolvedValue({
      counters: { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} },
      player: { seasonPlayerId: "sp-1", position: 4, balancePoints: 10, rollSeq: 4, moveCount: 9, rank: 1, status: "active" },
      activeEffectKeys: [],
      activeTagCounts: {},
      heldItemCount: 0,
      seasonRollSeq: 12,
      playerCount: 2,
    });

    const result = await applyResolvedTurn({
      sp: seasonPlayer(),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config({ iee }),
    });

    expect(result.wheel).toMatchObject({ kind: "item", key: "speed_boots" });
    expect(context.executionContext).toHaveBeenCalledWith(
      expect.objectContaining({ seasonId: "season-1", registry: season, actorPlayerId: "sp-1", seasonRollSeq: 12 }),
    );
    expect(mem.instances).toEqual([
      expect.objectContaining({
        kind: "item",
        revisionId: REGISTRY.get("speed_boots")!.revisionId,
        holderPlayerId: "sp-1",
        source: "cell_bonus",
        sourceMoveId: "move-1",
        grantedRollSeq: 12,
      }),
    ]);
    expect(feedOfType("item_granted")).toMatchObject({ payload: expect.objectContaining({ itemKey: "speed_boots" }) });
  });

  it("spins a wheel once more where a rule asks, after the landing's own — and animates the landing's own (spec §6.12)", async () => {
    boardWith(cell(4, "bonus", { amount: 1 }));
    const TREASURE: EntryDoc = {
      dslVersion: 1,
      kind: "effect",
      slug: "treasure_map",
      name: { ru: "Карта сокровищ" },
      character: "bonus",
      rarity: "common",
      tags: [],
      duration: { unit: "moves", count: 1 },
      stacking: { mode: "refresh" },
      rules: [{ when: "afterCellEffect", if: [{ op: "cellType", in: ["bonus"] }], do: [{ op: "extraSpin", pool: "bonus" }] }],
    };
    // «Сапоги скорости» on the wheel, with the status they hand out.
    const boots = REGISTRY.get("speed_boots")!;
    const tailwind = REGISTRY.get("tailwind")!;
    const set = compileSet([
      { entryId: boots.entryId, revisionId: boots.revisionId, doc: boots.doc },
      { entryId: tailwind.entryId, revisionId: tailwind.revisionId, doc: tailwind.doc },
      { entryId: "88888888-8888-4888-8888-888888888888", revisionId: "rev-treasure", doc: TREASURE },
    ]);
    played.registry = buildRegistry(
      set,
      set.entries.map((e) => ({ ...REGISTRY.tuning(boots.entryId)!, entryId: e.entryId, revisionId: e.revisionId, enabled: e.key === "speed_boots", pool: "bonus" as const })),
    );
    mem.instances.push({
      ...holding("swamp"),
      id: "inst-treasure",
      entryId: "88888888-8888-4888-8888-888888888888",
      revisionId: "rev-treasure",
      remaining: 1,
      remainingUnit: "moves",
    });
    mem.instances.splice(mem.instances.findIndex((i) => i.id === "inst-swamp"), 1);
    const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true, revealDropsInFeed: true, nothingWeight: 0 };
    repo.loadPoolContext.mockResolvedValue({
      counters: { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} },
      player: { seasonPlayerId: "sp-1", position: 4, balancePoints: 10, rollSeq: 4, moveCount: 9, rank: 1, status: "active" },
      activeEffectKeys: ["treasure_map"],
      activeTagCounts: {},
      heldItemCount: 0,
      seasonRollSeq: 12,
      playerCount: 2,
    });

    const result = await applyResolvedTurn({ sp: seasonPlayer(), roll: gameRoll(), outcome: "passed", notes: null, rating: null, config: config({ iee }) });

    expect(result.wheel).toMatchObject({ kind: "item", key: "speed_boots" });
    // Two of them now: the landing's and the one more.
    expect(mem.instances.filter((i) => i.kind === "item" && i.status === "active")).toHaveLength(2);
    expect(eventLogValues().filter((e) => e.eventType === "item_granted")).toHaveLength(2);
    // The map was good for one move.
    expect(live("inst-treasure")).toMatchObject({ status: "ended", endReason: "expired" });
  });

  it("a drop that moves a rival out of turn posts the move on the rival's own line, on the board the turn played", async () => {
    boardWith(cell(4, "penalty"), cell(9, "finish"));
    const PURSUIT: EntryDoc = {
      dslVersion: 1,
      kind: "effect",
      slug: "pursuit",
      name: { ru: "Погоня", en: "Pursuit" },
      character: "penalty",
      rarity: "rare",
      tags: ["movement"],
      duration: { unit: "instant" },
      rules: [{ when: "onApply", do: [{ op: "halveGap", who: "nearestBehind" }] }],
    };
    played.registry = buildRegistry(compileSet([{ entryId: "77777777-7777-4777-8777-777777777777", revisionId: "rev-pursuit", doc: PURSUIT }]));
    // The participants as the transaction sees them once the move is written.
    mem = memoryStore({ balances: { "sp-1": 10 }, positions: { "sp-1": 4, "sp-2": 0 } });
    let board: unknown = null;
    context.executionContext.mockImplementation(async (input: ContextInput): Promise<ExecContext> => {
      board = input.board;
      return {
        store: mem.store,
        seasonId: input.seasonId,
        registry: input.registry ?? REGISTRY,
        config: input.config,
        seasonRollSeq: input.seasonRollSeq ?? 0,
        actorPlayerId: input.actorPlayerId ?? null,
        rng: () => 0,
        snapshot: async (id) => ({ seasonPlayerId: id, position: 4, balancePoints: 10, rollSeq: 5, moveCount: 5, rank: 1, status: "active" }),
        anchorFor: async () => ({ anchorRollSeq: 5 }),
        board: async () => input.board!,
      };
    });
    const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true, revealDropsInFeed: true, nothingWeight: 0 };
    repo.loadPoolContext.mockResolvedValue({
      counters: { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} },
      player: { seasonPlayerId: "sp-1", position: 4, balancePoints: 10, rollSeq: 4, moveCount: 9, rank: 1, status: "active" },
      activeEffectKeys: [],
      activeTagCounts: {},
      heldItemCount: 0,
      seasonRollSeq: 12,
      playerCount: 2,
      playersBehind: 1,
    });

    const result = await applyResolvedTurn({ sp: seasonPlayer(), roll: gameRoll(), outcome: "passed", notes: null, rating: null, config: config({ iee }) });

    expect(result.wheel).toMatchObject({ kind: "effect", key: "pursuit" });
    expect(board).toEqual({ size: 10, loop: false, finishAt: 9 });
    expect(repo.loadPoolContext).toHaveBeenCalledWith(expect.objectContaining({ id: "sp-1" }), played.registry, 4);
    expect(eventLogValues().map((e) => [e.eventType, e.seasonPlayerId])).toEqual([
      ["game_passed", "sp-1"],
      ["moved", "sp-1"],
      ["effect_applied", "sp-1"],
      ["moved_out_of_turn", "sp-2"],
    ]);
    expect(feedOfType("moved_out_of_turn")).toMatchObject({ payload: { from: 0, to: 2, key: "pursuit" } });
    expect(mem.journal.map((j) => j.op)).toEqual(["grant", "fire", "move_player", "end"]);
  });

  it("a move that enters an object's cell stops there: no landing, the object acts once and is gone, on the mover's line (wave D, spec §6.18)", async () => {
    boardWith(cell(4, "penalty", { amount: -3 }));
    const MINE: EntryDoc = {
      dslVersion: 1,
      kind: "item",
      slug: "mine",
      name: { ru: "Мина", en: "Mine" },
      character: "bonus",
      rarity: "common",
      tags: ["movement"],
      usage: { activation: "active", charges: 1, target: { who: "self" }, pick: "cell" },
      rules: [
        { when: "onUse", do: [{ op: "placeObject" }] },
        { when: "onObjectEntered", do: [{ op: "stopMove" }] },
      ],
    };
    played.registry = buildRegistry(compileSet([{ entryId: "77777777-7777-4777-8777-777777777778", revisionId: "rev-mine", doc: MINE }]));
    mem = memoryStore({ balances: { "sp-1": 10 }, names: { "sp-2": "boris" } });
    repo.listActiveObjects.mockImplementation(async (seasonId: string) => mem.store.activeObjects(seasonId));
    const object = holding("ward", {
      id: "obj-1",
      entryId: "77777777-7777-4777-8777-777777777778",
      revisionId: "rev-mine",
      kind: "board_object",
      holderKind: "cell",
      holderPlayerId: null,
      holderCellIndex: 4,
      ownerPlayerId: "sp-2",
      params: {},
      chargesLeft: null,
      remaining: null,
      remainingUnit: null,
      anchorRollSeq: null,
    });
    const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true, revealDropsInFeed: true };

    const result = await applyResolvedTurn({ sp: seasonPlayer(), roll: gameRoll(), outcome: "passed", notes: null, rating: null, config: config({ iee }) });

    // The dice show 1: the move from 3 ends on the mine's cell, and the penalty there never fires.
    expect(result.toPosition).toBe(4);
    expect(result.newBalancePoints).toBe(10);
    expect(result.wheel).toBeUndefined();
    expect(repo.listActiveObjects).toHaveBeenCalledWith("season-1");
    expect(live(object.id)).toMatchObject({ status: "ended", endReason: "triggered" });
    expect(mem.journal.map((j) => j.op)).toEqual(["trigger_object", "end"]);
    expect(feedOfType("object_triggered")).toMatchObject({
      seasonPlayerId: "sp-1",
      payload: { itemKey: "mine", cell: 4, ownerSeasonPlayerId: "sp-2", ownerUsername: "boris", stopped: true, pushed: 0, extended: 0, spun: null },
    });
  });

  it("a move that ends where a rival stands lets their entries answer: «Корона» changes hands (wave D, spec §6.19)", async () => {
    boardWith(cell(4, "normal"));
    const CROWN: EntryDoc = {
      dslVersion: 1,
      kind: "item",
      slug: "crown",
      name: { ru: "Корона", en: "Crown" },
      character: "bonus",
      rarity: "epic",
      tags: [],
      usage: { activation: "passive", unique: "season" },
      rules: [{ when: "onSameCell", do: [{ op: "takeEntry" }] }],
    };
    played.registry = buildRegistry(compileSet([{ entryId: "77777777-7777-4777-8777-777777777779", revisionId: "rev-crown", doc: CROWN }]));
    // The participants as the transaction sees them: the rival on the cell the move ends on.
    mem = memoryStore({ balances: { "sp-1": 10, "sp-2": 3 }, positions: { "sp-1": 4, "sp-2": 4 }, names: { "sp-2": "boris" } });
    const crown = holding("ward", {
      id: "crown-1",
      entryId: "77777777-7777-4777-8777-777777777779",
      revisionId: "rev-crown",
      kind: "item",
      holderPlayerId: "sp-2",
      params: {},
      chargesLeft: null,
      remaining: null,
      remainingUnit: null,
      anchorRollSeq: 2,
    });
    const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true, revealDropsInFeed: true };

    await applyResolvedTurn({ sp: seasonPlayer(), roll: gameRoll(), outcome: "passed", notes: null, rating: null, config: config({ iee }) });

    expect(live(crown.id)).toMatchObject({ holderPlayerId: "sp-1", status: "active" });
    expect(mem.journal.map((j) => j.op)).toEqual(["fire", "move"]);
    expect(feedOfType("item_moved")).toMatchObject({ seasonPlayerId: "sp-1", payload: { how: "taken", fromUsername: "boris", itemKey: "crown" } });
  });

  it("the objects are not asked while the season plays no items and effects", async () => {
    await applyResolvedTurn({ sp: seasonPlayer(), roll: gameRoll(), outcome: "passed", notes: null, rating: null, config: config() });
    expect(repo.listActiveObjects).not.toHaveBeenCalled();
  });

  it("the game reported ends the completion conditions it held; another roll's stay (wave C, spec §6.17)", async () => {
    const hard: EntryDoc = {
      dslVersion: 1,
      kind: "effect",
      slug: "hard",
      name: { ru: "Сложный режим" },
      character: "penalty",
      rarity: "common",
      tags: ["game_condition"],
      duration: { unit: "next_game" },
      stacking: { mode: "refresh" },
      rules: [{ when: "onRollCreated", do: [{ op: "addCondition", text: { ru: "На высокой сложности" } }] }],
    };
    played.registry = buildRegistry(compileSet([{ entryId: "66666666-6666-4666-8666-666666666666", revisionId: "rev-hard", doc: hard }]));
    const condition = (id: string, rollId: string): IeeInstanceRow => ({
      ...holding("swamp"),
      id,
      entryId: "66666666-6666-4666-8666-666666666666",
      revisionId: "rev-hard",
      kind: "roll_condition",
      holderKind: "roll",
      holderPlayerId: null,
      holderRollId: rollId,
      params: { ru: "На высокой сложности" },
      remaining: null,
      remainingUnit: null,
      anchorRollSeq: null,
    });
    mem.instances.length = 0;
    mem.instances.push(condition("cond-1", "roll-1"), condition("cond-other", "roll-other"));

    const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true };
    await applyResolvedTurn({ sp: seasonPlayer({ rollSeq: 4 }), roll: gameRoll(), outcome: "dropped", notes: null, rating: null, config: config({ iee }) });

    expect(live("cond-1")).toMatchObject({ status: "ended", endReason: "expired" });
    expect(live("cond-other")).toMatchObject({ status: "active" });
    expect(mem.journal.find((j) => j.op === "expire" && j.instanceId === "cond-1")).toMatchObject({ outcome: { reason: "roll_ended", rollId: "roll-1" } });
  });

  it("expires a run-out status and announces it when the feed is revealing", async () => {
    const swamp = holding("swamp", { remaining: 1 });

    await applyResolvedTurn({
      sp: seasonPlayer({ rollSeq: 4 }),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config(),
    });

    expect(live(swamp.id)).toMatchObject({ status: "ended", endReason: "expired" });
    expect(feedOfType("effect_expired")).toMatchObject({
      payload: { effectKey: "swamp", instanceId: swamp.id, name: REGISTRY.get("swamp")!.names },
    });
  });

  it("expires silently when the season hides its drops", async () => {
    const swamp = holding("swamp", { remaining: 1 });
    const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), revealDropsInFeed: false };

    await applyResolvedTurn({
      sp: seasonPlayer({ rollSeq: 4 }),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config({ iee }),
    });

    expect(live(swamp.id)).toMatchObject({ status: "ended", endReason: "expired" });
    expect(feedOfType("effect_expired")).toBeUndefined();
  });
});

describe("applyResolvedTurn — the caller's writes share the turn", () => {
  it("runs extraWrites before the feed batch and appends extraEvents", async () => {
    boardWith(cell(4, "normal"));
    const extraWrites = vi.fn(async () => {
      await dbFake.db.insert(eventLogTable).values({ eventType: "request_marked" });
    });

    await applyResolvedTurn({
      sp: seasonPlayer(),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config(),
      feedExtra: { requestId: "cr-1" },
      extraEvents: [{ eventType: "completion_approved", payload: { requestId: "cr-1" } }],
      extraWrites,
    });

    expect(extraWrites).toHaveBeenCalledWith(dbFake.db, { moveId: "move-1" });
    const types = eventLogValues().map((e) => e.eventType);
    expect(types.indexOf("request_marked")).toBeGreaterThan(-1);
    expect(types.indexOf("request_marked")).toBeLessThan(types.indexOf("game_passed"));
    expect(feedOfType("game_passed")).toMatchObject({
      payload: expect.objectContaining({ requestId: "cr-1" }),
    });
    expect(feedOfType("completion_approved")).toMatchObject({ payload: { requestId: "cr-1" } });
  });
});

describe("the reaction window — a turn in two transactions (wave B, spec §7.4)", () => {
  const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const names = (slug: string) => ({ ru: slug, en: slug, uk: slug });
  const reactionItem = (slug: string, act: Record<string, unknown>): EntryDoc => ({
    dslVersion: 1,
    kind: "item",
    slug,
    name: names(slug),
    character: "bonus",
    rarity: "common",
    tags: [],
    usage: { activation: "active", charges: 1, window: "after_dice" },
    rules: [{ when: "onUse", do: [act as EntryDoc["rules"][number]["do"][number]] }],
  });
  const chain: EntryDoc = {
    dslVersion: 1,
    kind: "effect",
    slug: "chain_test",
    name: names("chain"),
    character: "penalty",
    rarity: "common",
    tags: [],
    duration: { unit: "rolls", count: 1 },
    stacking: { mode: "refresh" },
    rules: [{ when: "whileActive", do: [{ op: "forbidItems" }] }],
  };
  const reactions = () =>
    buildRegistry(
      compileSet(
        [reactionItem("coin", { op: "reroll" }), reactionItem("sixes", { op: "rerollOn", values: [6] }), chain].map((doc, i) => ({
          entryId: ID(1 + i),
          revisionId: ID(100 + i),
          doc,
        })),
      ),
    );
  /** One held instance of an entry of the reaction registry. */
  function holdingOf(registry: SeasonRegistry, key: string, id = `inst-${key}`): IeeInstanceRow {
    const def = registry.get(key)!;
    const start = registry.start(def);
    const row: IeeInstanceRow = {
      id,
      seasonId: "season-1",
      entryId: def.entryId,
      revisionId: def.revisionId,
      kind: def.kind,
      holderKind: "player",
      holderPlayerId: "sp-1",
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
      source: "cell_bonus",
      sourceMoveId: null,
      causeJournalId: null,
      grantedRollSeq: 0,
      grantedAt: new Date(0),
      endedAt: null,
    };
    mem.instances.push(row);
    return row;
  }
  const window = () => mem.decisions.find((d) => d.kind === "reaction_window")!;
  const ieeOn = () => config({ iee: { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true } });
  const ops = () => mem.journal.map((j) => j.op);
  const movesInserted = () => dbFake.inserts.filter((i) => i.table === movesTable);

  /** Reports the game with dice showing 1 (every draw 0): the coin may throw again. */
  async function report(over: Partial<Parameters<typeof applyResolvedTurn>[0]> = {}) {
    dbFake.returningResults.length = 0;
    return applyResolvedTurn({ sp: seasonPlayer({ position: 3 }), roll: gameRoll(), outcome: "passed", notes: "gg", rating: 8, config: ieeOn(), ...over });
  }

  /** Answers the window, the roll still open; fresh draws show 6 from here on. */
  async function answer(choice: { option: string; picks?: string[] } | null, by: "player" | "judge" = "player") {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    dbFake.selectResults.push([gameRoll()], [{ title: "Hades" }]);
    dbFake.returningResults.push([{ id: "move-1" }]);
    return answerReactionWindow({ decision: window(), sp: seasonPlayer({ position: 3 }), config: ieeOn(), choice, by, userId: by === "judge" ? "judge-1" : "user-1" });
  }

  beforeEach(() => {
    played.registry = reactions();
    boardWith(cell(4, "normal"), cell(9, "normal"));
  });

  it("a throw the player's reaction item may change pauses the turn: the window holds it, nothing else is written", async () => {
    holdingOf(played.registry!, "coin");
    const extraWrites = vi.fn(async () => {});
    const result = await report({ extraWrites, extraEvents: [{ eventType: "completion_approved", payload: { requestId: "req-1" } }] });
    expect(result).toEqual({ diceResults: [1], fromPosition: 3, toPosition: 3, newBalancePoints: 10, reaction: { decisionId: window().id, faces: [1] } });
    expect(movesInserted()).toEqual([]);
    expect(dbFake.updates.filter((u) => u.table === gameRollsTable)).toEqual([]);
    expect(window()).toMatchObject({ status: "pending", defaultChoice: { option: "accept" } });
    expect(window().context).toMatchObject({
      rollId: "roll-1",
      outcome: "passed",
      notes: "gg",
      rating: 8,
      view: { faces: [1], result: 1, from: 3, to: 4, cellType: "normal" },
      offers: [{ instanceId: "inst-coin", key: "coin" }],
    });
    expect(ops()).toEqual(["decision_open"]);
    // A judge's approval opens the window: it is written with it.
    expect(extraWrites).toHaveBeenCalledWith(expect.anything(), { moveId: null });
    expect(feedOfType("completion_approved")).toMatchObject({ payload: { requestId: "req-1" } });
    expect(decisionReads.announceDecisions).toHaveBeenCalledWith([expect.objectContaining({ kind: "reaction_window", status: "pending" })]);
  });

  it("accepting replays every draw: the move is the one shown, and the window is answered with it", async () => {
    holdingOf(played.registry!, "coin");
    await report();
    const turn = await answer({ option: "accept" });
    expect(turn).toMatchObject({ diceResults: [1], fromPosition: 3, toPosition: 4 });
    expect(movesInserted()).toEqual([expect.objectContaining({ values: expect.objectContaining({ diceResults: [1], toPosition: 4 }) })]);
    expect(window()).toMatchObject({ status: "resolved", resolvedByUserId: "user-1", choice: { option: "accept" } });
    expect(ops()).toEqual(["decision_open", "decision_resolve"]);
    expect(live("inst-coin")).toMatchObject({ status: "active", chargesLeft: 1 });
    expect(feedOfType("item_used")).toBeUndefined();
  });

  it("using the item: the throw again stands, its charge is spent, and the feed says what it did", async () => {
    holdingOf(played.registry!, "coin");
    await report();
    const turn = await answer({ option: "react", picks: ["inst-coin"] });
    expect(turn).toMatchObject({ diceResults: [6], toPosition: 9 });
    expect(live("inst-coin")).toMatchObject({ status: "ended", chargesLeft: 0 });
    expect(ops()).toEqual(["decision_open", "use", "decision_resolve"]);
    expect(mem.journal.find((j) => j.op === "decision_resolve")).toMatchObject({ outcome: { option: "react", picks: ["inst-coin"], before: [1], after: [6] } });
    const feed = eventLogValues().map((e) => e.eventType);
    expect(feed.indexOf("item_used")).toBeLessThan(feed.indexOf("game_passed"));
    expect(feedOfType("item_used")).toMatchObject({
      payload: { itemKey: "coin", reaction: { before: [1], thrown: [[6]], after: [6], result: { before: 1, after: 6 } } },
    });
    expect(feedOfType("game_passed")).toMatchObject({ payload: { dice: [6], notes: "gg", rating: 8 } });
  });

  it("a judge may accept for the player, never use their item", async () => {
    holdingOf(played.registry!, "coin");
    await report();
    await expect(answer({ option: "react", picks: ["inst-coin"] }, "judge")).rejects.toMatchObject({ code: "gameNotAllowed" });
    const turn = await answer(null, "judge");
    expect(turn.toPosition).toBe(4);
    expect(window()).toMatchObject({ status: "judged", resolvedByUserId: "judge-1" });
  });

  it("refuses an item the window did not offer, one gone since, an unknown answer, and a roll already reported", async () => {
    holdingOf(played.registry!, "coin");
    await report();
    await expect(answer({ option: "react", picks: ["inst-other"] })).rejects.toMatchObject({ code: "ieeDecisionChoiceInvalid" });
    await expect(answer({ option: "discard" })).rejects.toMatchObject({ code: "ieeDecisionChoiceInvalid" });
    live("inst-coin")!.status = "ended";
    await expect(answer({ option: "react", picks: ["inst-coin"] })).rejects.toMatchObject({ code: "ieeDecisionChoiceInvalid" });
    dbFake.selectResults.length = 0;
    dbFake.selectResults.push([gameRoll({ status: "passed" })]);
    await expect(
      answerReactionWindow({ decision: window(), sp: seasonPlayer(), config: ieeOn(), choice: null, by: "player", userId: "user-1" }),
    ).rejects.toMatchObject({ code: "gameRollAlreadyResolved" });
    expect(window().status).toBe("pending");
  });

  it("plays straight through when the throw offers nothing, the player is kept from items, or a choice of theirs waits", async () => {
    // A 6 to throw again, and a 1 showing.
    holdingOf(played.registry!, "sixes");
    expect((await report()).reaction).toBeUndefined();
    expect(mem.decisions).toEqual([]);

    holdingOf(played.registry!, "coin");
    holdingOf(played.registry!, "chain_test");
    expect((await report()).reaction).toBeUndefined();

    live("inst-chain_test")!.status = "ended";
    decisionReads.hasPendingDecision.mockResolvedValueOnce(true);
    expect((await report()).reaction).toBeUndefined();
    expect(decisionReads.hasPendingDecision).toHaveBeenCalledWith("sp-1", "victim_choice");
    expect(mem.decisions).toEqual([]);
  });
});
