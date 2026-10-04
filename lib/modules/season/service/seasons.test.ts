import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import type { Season } from "@/db/schema";
import {
  boardCells,
  boards,
  eventLog,
  gameRolls,
  ledgerEntries,
  moves,
  playerEffects,
  playerEvents,
  playerInventory,
  rerollRequests,
  seasonPlayers,
  seasons,
} from "@/db/schema";
import { SeasonConfigSchema } from "@/lib/engine";
import { generateBoardCells } from "@/lib/modules/catalog/pool/board-generator";

import { changeSeasonStatus,
  createSeason,
  createSeasonSchema,
  resetSeason,
  updateSeasonSettings,
} from "./seasons";

const dbFake = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const insertResults: unknown[][] = [];
  const inserts: { table: unknown; values: unknown }[] = [];
  const updates: { table: unknown; values: Record<string, unknown> }[] = [];
  const deletes: unknown[] = [];
  const state = { transactions: 0 };

  function chain(table: unknown, consume: () => unknown[]) {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.orderBy = () => c;
    c.limit = () => c;
    c.groupBy = () => c;
    c.innerJoin = () => c;
    c.leftJoin = () => c;
    c.set = (values: Record<string, unknown>) => {
      updates.push({ table, values });
      return c;
    };
    c.values = (values: unknown) => {
      inserts.push({ table, values });
      return c;
    };
    c.returning = () => c;
    c.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(consume()).then(resolve);
    return c;
  }

  const db = {
    select: () => chain(undefined, () => selectResults.shift() ?? []),
    insert: (table: unknown) => chain(table, () => insertResults.shift() ?? []),
    update: (table: unknown) => chain(table, () => []),
    delete: (table: unknown) => {
      const c = chain(table, () => []);
      c.where = () => {
        deletes.push(table);
        return c;
      };
      return c;
    },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      state.transactions += 1;
      return fn(db);
    },
    query: { seasons: { findFirst: vi.fn() }, boards: { findFirst: vi.fn() } },
  };

  return {
    db,
    state,
    selectResults,
    insertResults,
    inserts,
    updates,
    deletes,
    reset: () => {
      selectResults.length = 0;
      insertResults.length = 0;
      inserts.length = 0;
      updates.length = 0;
      deletes.length = 0;
      state.transactions = 0;
      db.query.seasons.findFirst.mockReset();
      db.query.boards.findFirst.mockReset();
    },
  };
});
vi.mock("@/lib/infrastructure/db", () => ({ db: dbFake.db }));

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn(), isStaff: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const eventsInfra = vi.hoisted(() => ({ logAdminAction: vi.fn(), logEvent: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => eventsInfra);

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const seasonsRepo = vi.hoisted(() => ({ getSeasonById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => seasonsRepo);

const notifications = vi.hoisted(() => ({
  notifySeasonParticipants: vi.fn(),
  notifyUser: vi.fn(),
}));
vi.mock("@/lib/modules/notifications/service", () => notifications);

const seasonNames = vi.hoisted(() => ({ generateSeasonTitle: vi.fn() }));
vi.mock("@/lib/shared/utils/season-names", () => seasonNames);

const ACTOR = { id: "admin-1", role: "admin" };
const SEASON_ID = "11111111-1111-1111-1111-111111111111";

function season(overrides: Partial<Season> = {}): Season {
  return {
    id: SEASON_ID,
    slug: "run-1",
    title: "Run 1",
    status: "draft",
    config: {},
    rulesMd: null,
    startedAt: null,
    finishedAt: null,
    createdBy: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

function seasonInserts() {
  return dbFake.inserts.filter((i) => i.table === seasons);
}
function updateValues(table: unknown) {
  return dbFake.updates.filter((u) => u.table === table).map((u) => u.values);
}

beforeEach(() => {
  dbFake.reset();
  session.getCurrentUser.mockReset();
  session.isStaff.mockReset();
  session.getCurrentUser.mockResolvedValue(ACTOR);
  session.isStaff.mockReturnValue(true);
  eventsInfra.logAdminAction.mockReset();
  eventsInfra.logEvent.mockReset();
  seasonsRepo.getSeasonById.mockReset();
  notifications.notifySeasonParticipants.mockReset();
  notifications.notifySeasonParticipants.mockResolvedValue(undefined);
  seasonNames.generateSeasonTitle.mockReset();
  seasonNames.generateSeasonTitle.mockReturnValue("Neon Run");
  logger.log.info.mockClear();
  logger.log.debug.mockClear();
  logger.log.error.mockClear();
});

describe("createSeasonSchema", () => {
  it("accepts a minimal title-only payload and trims nothing extra", () => {
    expect(createSeasonSchema.parse({ title: "Run", slug: "run-1" })).toEqual({ title: "Run", slug: "run-1" });
  });

  it("rejects an empty title, a non-slug slug and an oversized title", () => {
    expect(createSeasonSchema.safeParse({ title: "", slug: "run" }).success).toBe(false);
    expect(createSeasonSchema.safeParse({ title: "Run", slug: "Not A Slug" }).success).toBe(false);
    expect(createSeasonSchema.safeParse({ title: "x".repeat(201), slug: "run" }).success).toBe(false);
    expect(createSeasonSchema.safeParse({ title: "Run", slug: "run", cloneBoardFromSeasonId: "nope" }).success).toBe(false);
  });

  it("normalises a partial config through SeasonConfigSchema", () => {
    const parsed = createSeasonSchema.parse({ title: "Run", slug: "run", config: { dice: { sides: 10 } } });
    expect(parsed.config?.dice.sides).toBe(10);
    expect(parsed.config?.board.size).toBe(40);
  });
});

describe("createSeason", () => {
  it("requires staff", async () => {
    session.isStaff.mockReturnValue(false);
    await expect(createSeason({ title: "Run", slug: "run" })).rejects.toMatchObject({
      code: "adminStaffRequired",
    });
    expect(dbFake.state.transactions).toBe(0);
  });

  it("reuses the requested slug when free and creates a board from the config", async () => {
    dbFake.selectResults.push([]);
    dbFake.insertResults.push([{ id: "season-9" }], [{ id: "board-9" }]);

    const id = await createSeason({
      title: " Final Run ",
      slug: "  Final Run!! ",
      config: { board: { size: 10, distribution: "manual" } },
    });

    expect(id).toBe("season-9");
    const [seasonInsert] = seasonInserts();
    expect(seasonInsert!.values).toMatchObject({ slug: "final-run", title: "Final Run" });

    const boardCellsInsert = dbFake.inserts.find((i) => i.table === boardCells);
    expect(boardCellsInsert).toBeDefined();
    const cells = boardCellsInsert!.values as Array<{ position: number; cellType: string }>;
    expect(cells).toHaveLength(10);
    expect(cells.map((c) => c.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(cells.map((c) => c.cellType)).toEqual([
      "start",
      "bonus",
      "bonus",
      "bonus",
      "bonus",
      "penalty",
      "penalty",
      "penalty",
      "penalty",
      "finish",
    ]);

    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith({
      actorId: ACTOR.id,
      actionType: "season_created",
      targetType: "season",
      targetId: "season-9",
      payload: { title: "Final Run", slug: "final-run" },
    });
  });

  it("suffixes the slug until it finds a free name", async () => {
    dbFake.selectResults.push([{ slug: "run" }], [{ slug: "run-2" }], []);
    dbFake.insertResults.push([{ id: "season-9" }], [{ id: "board-9" }]);

    await createSeason({ title: "Run", slug: "run", config: { board: { size: 3 } } });

    expect(seasonInserts()[0]!.values).toMatchObject({ slug: "run-3" });
  });

  it("generates a title and slug when the payload carries neither", async () => {
    dbFake.selectResults.push([], []);
    dbFake.insertResults.push([{ id: "season-9" }], [{ id: "board-9" }]);

    await createSeason({});

    expect(seasonNames.generateSeasonTitle).toHaveBeenCalled();
    expect(seasonInserts()[0]!.values).toMatchObject({ title: "Neon Run", slug: "neon-run" });
  });

  it("clones board cells from another season, dropping source ids", async () => {
    dbFake.selectResults.push([], [{ position: 0, cellType: "start", label: "Start", config: {} }]);
    dbFake.insertResults.push([{ id: "season-9" }], [{ id: "board-new" }]);
    dbFake.db.query.seasons.findFirst.mockResolvedValue({ id: "seed", slug: "seed" });
    dbFake.db.query.boards.findFirst.mockResolvedValue({ id: "board-src" });

    await createSeason({
      title: "Clone",
      slug: "clone",
      cloneBoardFromSeasonId: "22222222-2222-4222-8222-222222222222",
    });

    const boardCellsInsert = dbFake.inserts.find((i) => i.table === boardCells);
    expect(boardCellsInsert!.values).toEqual([
      { boardId: "board-new", position: 0, cellType: "start", label: "Start", config: {} },
    ]);
  });

  it("falls back to a generated board when the clone source has no board", async () => {
    dbFake.selectResults.push([]);
    dbFake.insertResults.push([{ id: "season-9" }], [{ id: "board-new" }]);
    dbFake.db.query.seasons.findFirst.mockResolvedValue({ id: "seed" });
    dbFake.db.query.boards.findFirst.mockResolvedValue(null);

    await createSeason({
      title: "Clone",
      slug: "clone",
      cloneBoardFromSeasonId: "22222222-2222-4222-8222-222222222222",
      config: { board: { size: 4, distribution: "manual" } },
    });

    const cells = dbFake.inserts.find((i) => i.table === boardCells)!.values as unknown[];
    expect(cells).toHaveLength(4);
  });

  it("rejects a payload whose regenerated slug is empty before touching the database", async () => {
    dbFake.selectResults.push([]);
    await expect(createSeason({ title: "###", slug: "!!!" })).rejects.toBeInstanceOf(ZodError);
    expect(dbFake.state.transactions).toBe(0);
    expect(seasonInserts()).toHaveLength(0);
  });
});

describe("changeSeasonStatus", () => {
  const legal: Array<[Season["status"], Season["status"]]> = [
    ["draft", "active"],
    ["draft", "archived"],
    ["active", "paused"],
    ["active", "finished"],
    ["paused", "active"],
    ["paused", "finished"],
    ["finished", "archived"],
  ];

  it.each(legal)("allows %s -> %s and records the transition", async (from, to) => {
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: from }));
    if (to === "active") dbFake.selectResults.push([]);

    await changeSeasonStatus(SEASON_ID, to);

    expect(updateValues(seasons)[0]).toMatchObject({ status: to });
    if (to === "active") expect(updateValues(seasons)[0]!.startedAt).toBeInstanceOf(Date);
    if (to === "finished") expect(updateValues(seasons)[0]!.finishedAt).toBeInstanceOf(Date);
    if (to !== "active" && to !== "finished") {
      expect(updateValues(seasons)[0]).not.toHaveProperty("startedAt");
      expect(updateValues(seasons)[0]).not.toHaveProperty("finishedAt");
    }
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith({
      actorId: ACTOR.id,
      actionType: `season_status_${to}`,
      targetType: "season",
      targetId: SEASON_ID,
    });
  });

  it("resets every participant when a season starts", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "paused", slug: "run-1", title: "Run 1" }));
    dbFake.selectResults.push([]);

    await changeSeasonStatus(SEASON_ID, "active");

    expect(updateValues(seasonPlayers)).toEqual([
      { position: 0, balancePoints: 0, streakPass: 0, streakDrop: 0 },
    ]);
    expect(eventsInfra.logEvent).toHaveBeenCalledWith({
      seasonId: SEASON_ID,
      eventType: "season_started",
      payload: {},
    });
    expect(notifications.notifySeasonParticipants).toHaveBeenCalledWith(SEASON_ID, "season_started", {
      seasonId: SEASON_ID,
      seasonSlug: "run-1",
      seasonTitle: "Run 1",
    });
  });

  it("swallows a notification failure on start", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "draft" }));
    dbFake.selectResults.push([]);
    notifications.notifySeasonParticipants.mockRejectedValue(new Error("socket down"));

    await expect(changeSeasonStatus(SEASON_ID, "active")).resolves.toBeUndefined();
    expect(logger.log.error).toHaveBeenCalledWith("notifications.season_started.failed", expect.anything());
  });

  it("refuses an illegal transition with the from/to params and does not write", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "draft" }));
    await expect(changeSeasonStatus(SEASON_ID, "finished")).rejects.toMatchObject({
      code: "adminInvalidTransition",
      params: { from: "draft", to: "finished" },
    });
    expect(dbFake.state.transactions).toBe(0);
    expect(eventsInfra.logAdminAction).not.toHaveBeenCalled();
  });

  it("treats archived as terminal", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "archived" }));
    await expect(changeSeasonStatus(SEASON_ID, "active")).rejects.toMatchObject({
      code: "adminInvalidTransition",
      params: { from: "archived", to: "active" },
    });
  });

  it("blocks starting a second active season and names the incumbent", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "draft" }));
    dbFake.selectResults.push([{ id: "other", title: "Other Run" }]);

    await expect(changeSeasonStatus(SEASON_ID, "active")).rejects.toMatchObject({
      code: "adminActiveSeasonExists",
      params: { title: "Other Run" },
    });
    expect(dbFake.state.transactions).toBe(0);
  });

  it("reports a missing season", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(null);
    await expect(changeSeasonStatus(SEASON_ID, "active")).rejects.toMatchObject({
      code: "adminSeasonNotFound",
    });
  });

  it("requires staff", async () => {
    session.isStaff.mockReturnValue(false);
    await expect(changeSeasonStatus(SEASON_ID, "active")).rejects.toMatchObject({
      code: "adminStaffRequired",
    });
    expect(seasonsRepo.getSeasonById).not.toHaveBeenCalled();
  });
});

describe("resetSeason", () => {
  const CASCADE_TABLES = [
    rerollRequests,
    ledgerEntries,
    playerInventory,
    playerEffects,
    playerEvents,
    moves,
    gameRolls,
  ];

  it("clears every per-player table and re-seeds balances from the stored config", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(
      season({ status: "finished", config: { points: { startingBalance: 25 } } }),
    );
    dbFake.selectResults.push([], [{ id: "sp1" }, { id: "sp2" }]);

    await resetSeason(SEASON_ID);

    expect(dbFake.deletes).toEqual([...CASCADE_TABLES, eventLog]);
    expect(updateValues(seasonPlayers)).toEqual([
      {
        position: 0,
        balancePoints: 25,
        streakPass: 0,
        streakDrop: 0,
        rerollsUsed: 0,
        rollSeq: 0,
        status: "active",
      },
    ]);
    const seasonPatch = updateValues(seasons)[0]!;
    expect(seasonPatch.status).toBe("active");
    expect(seasonPatch.startedAt).toBeInstanceOf(Date);
    expect(seasonPatch.finishedAt).toBeNull();
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith({
      actorId: ACTOR.id,
      actionType: "season_reset",
      targetType: "season",
      targetId: SEASON_ID,
    });
    expect(eventsInfra.logEvent).toHaveBeenCalledWith({
      seasonId: SEASON_ID,
      eventType: "season_reset",
      payload: { by: ACTOR.id },
    });
  });

  it("falls back to the default balance when the stored config is invalid", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(
      season({ status: "finished", config: { points: { startingBalance: -5 } } }),
    );
    dbFake.selectResults.push([], [{ id: "sp1" }]);

    await resetSeason(SEASON_ID);

    expect(updateValues(seasonPlayers)[0]).toMatchObject({ balancePoints: 0 });
  });

  it("skips the empty roster update but still clears the event log", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "finished" }));
    dbFake.selectResults.push([], []);

    await resetSeason(SEASON_ID);

    expect(dbFake.deletes).toEqual([eventLog]);
    expect(updateValues(seasonPlayers)).toEqual([]);
    expect(updateValues(seasons)).toHaveLength(1);
  });

  it("refuses to reset while another season is active", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "finished" }));
    dbFake.selectResults.push([{ id: "other", title: "Other" }]);

    await expect(resetSeason(SEASON_ID)).rejects.toMatchObject({
      code: "adminActiveSeasonExists",
      params: { title: "Other" },
    });
    expect(dbFake.state.transactions).toBe(0);
  });

  it("reports a missing season", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(null);
    await expect(resetSeason(SEASON_ID)).rejects.toMatchObject({ code: "adminSeasonNotFound" });
  });

  it("requires staff", async () => {
    session.isStaff.mockReturnValue(false);
    await expect(resetSeason(SEASON_ID)).rejects.toMatchObject({ code: "adminStaffRequired" });
  });
});

describe("updateSeasonSettings", () => {
  it("requires staff", async () => {
    session.isStaff.mockReturnValue(false);
    await expect(updateSeasonSettings({ seasonId: SEASON_ID, config: {} })).rejects.toMatchObject({
      code: "adminStaffRequired",
    });
    expect(dbFake.state.transactions).toBe(0);
  });

  it("rejects a config that fails schema validation before any transaction", async () => {
    await expect(
      updateSeasonSettings({ seasonId: SEASON_ID, config: { dice: { sides: 1 } } }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(dbFake.state.transactions).toBe(0);
    expect(dbFake.updates).toHaveLength(0);
  });

  it("requires a non-internal provider once the source leaves catalog", async () => {
    await expect(
      updateSeasonSettings({ seasonId: SEASON_ID, config: { gamePool: { source: "api" } } }),
    ).rejects.toMatchObject({ code: "adminGamePoolProviderRequired" });
    expect(dbFake.state.transactions).toBe(0);
  });

  it("carries the stored iee pool over when the payload omits it", async () => {
    const storedIee = { enabled: true, inventorySize: 9 };
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "active" }));
    dbFake.selectResults.push([{ status: "active", config: { iee: storedIee } }], []);

    await updateSeasonSettings({ seasonId: SEASON_ID, config: { dice: { sides: 8 } } });

    const patch = updateValues(seasons)[0]!;
    const config = patch.config as { dice: { sides: number }; iee: unknown };
    expect(config.dice.sides).toBe(8);
    expect(config.iee).toMatchObject(storedIee);
    expect(patch).not.toHaveProperty("rulesMd");
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "season_settings_updated",
        targetType: "season",
        targetId: SEASON_ID,
      }),
    );
  });

  it("writes rulesMd only when the caller supplies it", async () => {
    dbFake.selectResults.push([{ status: "active", config: {} }], []);
    await updateSeasonSettings({ seasonId: SEASON_ID, config: {}, rulesMd: "# Rules" });
    expect(updateValues(seasons)[0]).toMatchObject({ rulesMd: "# Rules" });
  });

  it("regenerates the board when a draft season's board shape changes", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "draft" }));
    dbFake.selectResults.push([{ status: "draft", config: { board: { size: 30, distribution: "manual" } } }], [{ id: "b1" }]);

    await updateSeasonSettings({
      seasonId: SEASON_ID,
      config: { board: { size: 6, distribution: "manual" } },
    });

    expect(dbFake.deletes).toContain(boardCells);
    const cells = dbFake.inserts.find((i) => i.table === boardCells)!.values as unknown[];
    expect(cells).toHaveLength(6);
  });

  it("regenerates a draft board whose stored cells do not match the config", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "draft" }));
    dbFake.selectResults.push(
      [{ status: "draft", config: {} }],
      [{ id: "b1" }],
      [{ cellType: "normal" }, { cellType: "normal" }, { cellType: "normal" }],
    );

    await updateSeasonSettings({ seasonId: SEASON_ID, config: {} });

    expect(dbFake.deletes).toContain(boardCells);
    expect(dbFake.inserts.some((i) => i.table === boardCells)).toBe(true);
  });

  it("keeps a draft board untouched when the stored cells already match", async () => {
    const parsed = SeasonConfigSchema.parse({});
    const rows = generateBoardCells(parsed).map((c) => ({ cellType: c.cellType }));
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "draft" }));
    dbFake.selectResults.push([{ status: "draft", config: {} }], [{ id: "b1" }], rows);

    await updateSeasonSettings({ seasonId: SEASON_ID, config: {} });

    expect(dbFake.deletes).not.toContain(boardCells);
    expect(dbFake.inserts.some((i) => i.table === boardCells)).toBe(false);
  });

  it("honours an explicit regenerateOnSave and clears the flag afterwards", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "active" }));
    dbFake.selectResults.push([{ status: "active", config: {} }], [{ id: "b1" }]);

    await updateSeasonSettings({
      seasonId: SEASON_ID,
      config: { board: { regenerateOnSave: true } },
    });

    expect(dbFake.deletes).toContain(boardCells);
    expect(dbFake.inserts.some((i) => i.table === boardCells)).toBe(true);
    const seasonUpdates = updateValues(seasons);
    expect(seasonUpdates).toHaveLength(2);
    const secondConfig = seasonUpdates[1]!.config as { board: { regenerateOnSave: boolean } };
    expect(secondConfig.board.regenerateOnSave).toBe(false);
  });

  it("writes settings even when the season row is missing", async () => {
    dbFake.selectResults.push([], []);

    await updateSeasonSettings({ seasonId: SEASON_ID, config: { dice: { sides: 8 } } });

    expect(dbFake.state.transactions).toBe(1);
    expect(updateValues(seasons)[0]).toHaveProperty("config");
  });

  it("creates a board for a draft season that has none", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(season({ status: "draft" }));
    dbFake.selectResults.push([{ status: "draft", config: {} }], []);
    dbFake.insertResults.push([{ id: "new-board" }]);

    await updateSeasonSettings({ seasonId: SEASON_ID, config: { board: { size: 5 } } });

    expect(dbFake.inserts.some((i) => i.table === boards)).toBe(true);
    const cells = dbFake.inserts.find((i) => i.table === boardCells)!.values as unknown[];
    expect(cells).toHaveLength(5);
  });
});
