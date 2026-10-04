import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Board, BoardCell, GameRoll, PlayerEffectRow, SeasonPlayer } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, type SeasonConfig } from "@/lib/engine";

import { applyResolvedTurn } from "./turn";

const eventLogTable = vi.hoisted(() => ({}));
const movesTable = vi.hoisted(() => ({}));
const gameRollsTable = vi.hoisted(() => ({}));
const seasonPlayersTable = vi.hoisted(() => ({}));
const ledgerEntriesTable = vi.hoisted(() => ({}));
const playerEffectsTable = vi.hoisted(() => ({}));
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
    playerEffects: playerEffectsTable,
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
  getActiveEffectRows: vi.fn(async () => [] as PlayerEffectRow[]),
  toPlayerSnapshot: vi.fn(),
}));
vi.mock("@/lib/modules/iee/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/iee/repository")>()),
  ...repo,
}));

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

function effectRow(overrides: Partial<PlayerEffectRow> = {}): PlayerEffectRow {
  return {
    id: "eff-1",
    seasonId: "season-1",
    seasonPlayerId: "sp-1",
    effectKey: "shield",
    params: {},
    polarity: "positive",
    chargesLeft: 1,
    expiresAfterRollSeq: null,
    state: "active",
    appliedBySeasonPlayerId: null,
    source: "cell_bonus",
    seasonRollSeq: 0,
    sourceMoveId: null,
    appliedAt: new Date(0),
    endedAt: null,
    ...overrides,
  };
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
  dbFake.reset();
  vi.clearAllMocks();
  vi.spyOn(Math, "random").mockReturnValue(0);
  seasons.getMainBoard.mockResolvedValue(null);
  seasons.getBoardCells.mockResolvedValue([]);
  events.assignEventFromCell.mockResolvedValue([]);
  repo.getActiveEffectRows.mockResolvedValue([]);
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

  it("lets a shield absorb a penalty landing and spends its charge", async () => {
    boardWith(cell(4, "penalty", { amount: -3 }));
    repo.getActiveEffectRows.mockResolvedValue([effectRow({ effectKey: "shield", chargesLeft: 1 })]);
    const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true, revealDropsInFeed: true };

    const result = await applyResolvedTurn({
      sp: seasonPlayer({ balancePoints: 10 }),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config({ iee }),
    });

    // The landing was absorbed: no point moved, no ledger row was written.
    expect(result.newBalancePoints).toBe(10);
    expect(dbFake.inserts.some((i) => i.table === ledgerEntriesTable)).toBe(false);
    expect(feedOfType("effect_cleansed")).toMatchObject({
      payload: { absorbed: "penalty", by: "shield" },
    });
    expect(feedOfType("effect_applied")).toBeUndefined();
    // The shield's charge is settled inside the same transaction.
    expect(dbFake.updates).toContainEqual(expect.objectContaining({ table: playerEffectsTable }));
  });

  it("pays out an onOutcome effect through the ledger and a second balance write", async () => {
    boardWith(cell(4, "normal"));
    repo.getActiveEffectRows.mockResolvedValue([
      effectRow({ id: "eff-m", effectKey: "momentum", polarity: "positive", chargesLeft: null, expiresAfterRollSeq: 50 }),
    ]);
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
  });

  it("expires a run-out status and announces it when the feed is revealing", async () => {
    repo.getActiveEffectRows.mockResolvedValue([
      effectRow({ id: "eff-old", effectKey: "slowed", polarity: "negative", chargesLeft: null, expiresAfterRollSeq: 4 }),
    ]);

    await applyResolvedTurn({
      sp: seasonPlayer({ rollSeq: 4 }),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config(),
    });

    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({
        table: playerEffectsTable,
        values: expect.objectContaining({ state: "expired" }),
      }),
    );
    expect(feedOfType("effect_expired")).toMatchObject({ payload: { effectKey: "slowed", effectId: "eff-old" } });
  });

  it("expires silently when the season hides its drops", async () => {
    repo.getActiveEffectRows.mockResolvedValue([
      effectRow({ id: "eff-old", effectKey: "slowed", chargesLeft: null, expiresAfterRollSeq: 4 }),
    ]);
    const iee = { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), revealDropsInFeed: false };

    await applyResolvedTurn({
      sp: seasonPlayer({ rollSeq: 4 }),
      roll: gameRoll(),
      outcome: "passed",
      notes: null,
      rating: null,
      config: config({ iee }),
    });

    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({ table: playerEffectsTable, values: expect.objectContaining({ state: "expired" }) }),
    );
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
