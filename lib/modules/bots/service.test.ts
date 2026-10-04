import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({
  db: { insert: vi.fn() },
  pool: { connect: vi.fn() },
}));
vi.mock("@/lib/infrastructure/auth/session", () => ({
  getCurrentUser: vi.fn(),
  isStaff: vi.fn(),
}));
vi.mock("@/lib/infrastructure/events", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/modules/season/repository/seasons", () => ({ getSeasonById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/players", () => ({ getSeasonPlayerById: vi.fn() }));
vi.mock("@/lib/modules/player/service/admin", () => ({ getUserById: vi.fn() }));
vi.mock("@/lib/modules/game", () => ({
  rollNewGame: vi.fn(),
  resolveGameRoll: vi.fn(),
  activateInventoryItem: vi.fn(),
}));
vi.mock("@/lib/modules/game/service/helpers", () => ({
  getOpenRollRow: vi.fn(),
  parseSeasonConfig: vi.fn(),
}));
vi.mock("@/lib/modules/iee/repository", () => ({
  getHeldItems: vi.fn(),
  getActiveEffectRows: vi.fn(),
  toActiveEffectLike: vi.fn(
    (row: {
      id: string;
      effectKey: string;
      params: unknown;
      chargesLeft: number | null;
      expiresAfterRollSeq: number | null;
      appliedAt: Date;
    }) => ({
      id: row.id,
      effectKey: row.effectKey,
      params: row.params ?? {},
      chargesLeft: row.chargesLeft,
      expiresAfterRollSeq: row.expiresAfterRollSeq,
      appliedAt: row.appliedAt.getTime(),
    }),
  ),
}));
vi.mock("@/lib/engine", () => ({
  activeEffects: vi.fn((rows: unknown[]) => rows),
  nextBotStepKind: vi.fn(),
  pickBotComment: vi.fn(),
  pickBotOutcome: vi.fn(),
  pickBotRating: vi.fn(),
  pickBotReason: vi.fn(),
  planBotItemUse: vi.fn(),
}));
vi.mock("./repository", () => ({
  botUsername: vi.fn((runId: string, index: number) => `bot_${runId.slice(0, 8)}_${index}`),
  createBotRunRow: vi.fn(),
  deleteBotRun: vi.fn(),
  deleteBotUsers: vi.fn(),
  getBotRun: vi.fn(),
  insertBotLog: vi.fn(),
  listBotItemTargets: vi.fn(),
  listBotOwnedPlayers: vi.fn(),
  listRunningBotRuns: vi.fn(),
  publishBotActivity: vi.fn(),
  publishBotRun: vi.fn(),
  updateBotRun: vi.fn(),
}));

import { db, pool } from "@/lib/infrastructure/db";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { logAdminAction } from "@/lib/infrastructure/events";
import { DEFAULT_BOT_RUN_CONFIG, type BotRun, type BotRunConfig } from "@/db/schema/bots";
import { users } from "@/db/schema";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { getSeasonPlayerById } from "@/lib/modules/season/repository/players";
import { getUserById } from "@/lib/modules/player/service/admin";
import { getOpenRollRow, parseSeasonConfig } from "@/lib/modules/game/service/helpers";
import { activateInventoryItem, resolveGameRoll, rollNewGame } from "@/lib/modules/game";
import { getActiveEffectRows, getHeldItems } from "@/lib/modules/iee/repository";
import {
  nextBotStepKind,
  pickBotComment,
  pickBotOutcome,
  pickBotRating,
  pickBotReason,
  planBotItemUse,
} from "@/lib/engine";

import { BotError } from "./errors";
import * as repo from "./repository";
import {
  cleanupBotRun,
  createBotRun,
  ensureBotPlayers,
  parseBotConfig,
  pauseBotRun,
  restartBotRun,
  resumeBotRun,
  stopBotRun,
  tickBotRun,
  tickBotRunAs,
  tickBotRunSystem,
  tickDueRuns,
  updateBotRunConfig,
} from "./service";

const mocked = {
  getCurrentUser: vi.mocked(getCurrentUser),
  isStaff: vi.mocked(isStaff),
  getBotRun: vi.mocked(repo.getBotRun),
  listBotOwnedPlayers: vi.mocked(repo.listBotOwnedPlayers),
  listRunningBotRuns: vi.mocked(repo.listRunningBotRuns),
  updateBotRun: vi.mocked(repo.updateBotRun),
  insertBotLog: vi.mocked(repo.insertBotLog),
};

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

function makeRun(overrides: Partial<BotRun> = {}): BotRun {
  return {
    id: "run-1",
    seasonId: "season-1",
    status: "running",
    config: { ...DEFAULT_BOT_RUN_CONFIG },
    totalTicks: 0,
    totalActions: 0,
    totalErrors: 0,
    lastError: null,
    createdById: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getCurrentUser.mockResolvedValue({ id: "admin-1", username: "admin", role: "admin" } as never);
  mocked.isStaff.mockReturnValue(true);
  mocked.insertBotLog.mockResolvedValue(undefined);
  mocked.updateBotRun.mockResolvedValue(undefined);
  // IEE off by default: the item path is exercised explicitly in its own tests.
  vi.mocked(parseSeasonConfig).mockReturnValue({
    iee: { enabled: false, allowTargetingOthers: true, pvpProtectionMoves: 3 },
  } as never);
  vi.mocked(getHeldItems).mockResolvedValue([]);
  vi.mocked(getActiveEffectRows).mockResolvedValue([]);
  vi.mocked(planBotItemUse).mockReturnValue(null);
  vi.mocked(repo.listBotItemTargets).mockResolvedValue([]);
});

describe("parseBotConfig", () => {
  it("falls back to every numeric default when the form carries no fields", () => {
    const config = parseBotConfig(form({}));
    const {
      enableRoll,
      enableResolve,
      stopOnError,
      enableItems,
      autoCleanse,
      targetStrategy,
      ...numeric
    } = config;
    const {
      enableRoll: defaultRoll,
      enableResolve: defaultResolve,
      stopOnError: defaultStop,
      enableItems: defaultItems,
      autoCleanse: defaultCleanse,
      targetStrategy: defaultStrategy,
      ...defaultNumeric
    } = DEFAULT_BOT_RUN_CONFIG;
    expect(numeric).toEqual(defaultNumeric);
    // Checkboxes are absent when off, so their default here is false even
    // though the schema default is true.
    expect({ enableRoll, enableResolve, stopOnError, enableItems, autoCleanse, targetStrategy }).toEqual({
      enableRoll: false,
      enableResolve: false,
      stopOnError,
      enableItems: false,
      autoCleanse: false,
      targetStrategy: defaultStrategy,
    });
    expect(defaultRoll).toBe(true);
    expect(defaultResolve).toBe(true);
    expect(defaultStop).toBe(false);
    expect(defaultItems).toBe(true);
    expect(defaultCleanse).toBe(true);
  });

  it("clamps numeric fields into their allowed range", () => {
    const config = parseBotConfig(form({ botCount: "999", actionsPerTick: "0", tickIntervalMs: "10" }));
    expect(config.botCount).toBe(20);
    expect(config.actionsPerTick).toBe(1);
    expect(config.tickIntervalMs).toBe(250);
  });

  it("floors fractional input rather than rounding it", () => {
    const config = parseBotConfig(form({ tickIntervalMs: "1234.9" }));
    expect(config.tickIntervalMs).toBe(1234);
  });

  it("falls back when a numeric field is unparsable", () => {
    const config = parseBotConfig(form({ botCount: "abc" }));
    expect(config.botCount).toBe(DEFAULT_BOT_RUN_CONFIG.botCount);
  });

  it("treats on / true / 1 as enabled and anything else as off", () => {
    const config = parseBotConfig(
      form({ enableRoll: "on", enableResolve: "1", stopOnError: "yes" }),
    );
    expect(config.enableRoll).toBe(true);
    expect(config.enableResolve).toBe(true);
    expect(config.stopOnError).toBe(false);
  });

  it("rejects a config whose outcome weights sum to zero or less", () => {
    expect(() =>
      parseBotConfig(form({ passWeight: "0", dropWeight: "0", rerollWeight: "0" })),
    ).toThrow(BotError);
    try {
      parseBotConfig(form({ passWeight: "0", dropWeight: "0", rerollWeight: "0" }));
    } catch (error) {
      expect((error as BotError).code).toBe("botInvalidConfig");
    }
  });

  it("accepts a config where exactly one weight is positive", () => {
    const config = parseBotConfig(form({ passWeight: "0", dropWeight: "0", rerollWeight: "1" }));
    expect(config.rerollWeight).toBe(1);
  });

  it("clamps the item chance and falls back on an unknown target strategy", () => {
    expect(parseBotConfig(form({ itemChance: "999" })).itemChance).toBe(100);
    expect(parseBotConfig(form({ itemChance: "-5" })).itemChance).toBe(0);
    expect(parseBotConfig(form({ targetStrategy: "nonsense" })).targetStrategy).toBe(
      DEFAULT_BOT_RUN_CONFIG.targetStrategy,
    );
    expect(parseBotConfig(form({ targetStrategy: "nearest" })).targetStrategy).toBe("nearest");
  });

  it("reads the item policy switches", () => {
    const config = parseBotConfig(form({ enableItems: "on", autoCleanse: "on" }));
    expect(config.enableItems).toBe(true);
    expect(config.autoCleanse).toBe(true);
  });
});

describe("run status transitions", () => {
  it("refuses a restart when there is no such run", async () => {
    mocked.getBotRun.mockResolvedValue(null);
    await expect(restartBotRun("missing")).rejects.toMatchObject({ code: "botRunNotFound" });
  });

  it("refuses a restart of a run that is not stopped", async () => {
    mocked.getBotRun.mockResolvedValue(makeRun({ status: "running" }));
    await expect(restartBotRun("run-1")).rejects.toMatchObject({ code: "botRunNotStopped" });
  });

  it("refuses a restart when every synthetic player was already cleaned up", async () => {
    mocked.getBotRun.mockResolvedValue(makeRun({ status: "stopped" }));
    mocked.listBotOwnedPlayers.mockResolvedValue([
      { username: "bot_run-1_0", userId: "u1", seasonPlayerId: null },
    ]);
    await expect(restartBotRun("run-1")).rejects.toMatchObject({ code: "botRunNoPlayers" });
  });

  it("restarts a stopped run that still has a live membership", async () => {
    const stopped = makeRun({ status: "stopped" });
    mocked.getBotRun
      .mockResolvedValueOnce(stopped)
      .mockResolvedValue(makeRun({ status: "running" }));
    mocked.listBotOwnedPlayers.mockResolvedValue([
      { username: "bot_run-1_0", userId: "u1", seasonPlayerId: "sp-1" },
    ]);

    const run = await restartBotRun("run-1");
    expect(run.status).toBe("running");
    expect(mocked.updateBotRun).toHaveBeenCalledWith("run-1", { status: "running", lastError: null });
  });

  it("resuming clears the previous last error", async () => {
    mocked.getBotRun
      .mockResolvedValueOnce(makeRun({ status: "paused", lastError: "old" }))
      .mockResolvedValue(makeRun({ status: "running", lastError: null }));
    await resumeBotRun("run-1");
    expect(mocked.updateBotRun).toHaveBeenCalledWith("run-1", { status: "running", lastError: null });
  });

  it("pausing keeps the last error payload untouched", async () => {
    mocked.getBotRun
      .mockResolvedValueOnce(makeRun({ lastError: "old" }))
      .mockResolvedValue(makeRun({ status: "paused", lastError: "old" }));
    await pauseBotRun("run-1");
    expect(mocked.updateBotRun).toHaveBeenCalledWith("run-1", { status: "paused" });
  });

  it("stopping does not clear the last error", async () => {
    mocked.getBotRun
      .mockResolvedValueOnce(makeRun({ lastError: "boom" }))
      .mockResolvedValue(makeRun({ status: "stopped", lastError: "boom" }));
    await stopBotRun("run-1");
    expect(mocked.updateBotRun).toHaveBeenCalledWith("run-1", { status: "stopped" });
  });

  it("reports a missing run instead of a null status change", async () => {
    mocked.getBotRun.mockResolvedValue(null);
    await expect(pauseBotRun("missing")).rejects.toMatchObject({ code: "botRunNotFound" });
  });
});

describe("tickDueRuns", () => {
  function fakeClient() {
    return { query: vi.fn(), release: vi.fn() };
  }

  it("returns nothing when no run is running", async () => {
    mocked.listRunningBotRuns.mockResolvedValue([]);
    expect(await tickDueRuns()).toEqual([]);
  });

  it("skips a run whose cadence has not elapsed", async () => {
    const run = makeRun({ updatedAt: new Date() });
    mocked.listRunningBotRuns.mockResolvedValue([run]);
    const results = await tickDueRuns();
    expect(results).toEqual([{ runId: "run-1", ticked: false, reason: "not-due" }]);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("treats a fresh run as due when forced", async () => {
    const run = makeRun({ updatedAt: new Date() });
    mocked.listRunningBotRuns.mockResolvedValue([run]);
    const client = fakeClient();
    client.query.mockResolvedValue({ rows: [{ ok: true }] });
    vi.mocked(pool.connect).mockResolvedValue(client as never);
    // The freshly re-read row is no longer running, so the lock is released
    // without attempting a tick.
    mocked.getBotRun.mockResolvedValue(makeRun({ status: "paused" }));

    const results = await tickDueRuns({ force: true });
    expect(results).toEqual([{ runId: "run-1", ticked: false, reason: "no-longer-running" }]);
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("reports a run already locked by another process and does not unlock it", async () => {
    const run = makeRun({ updatedAt: new Date(0) });
    mocked.listRunningBotRuns.mockResolvedValue([run]);
    const client = fakeClient();
    client.query.mockResolvedValue({ rows: [{ ok: false }] });
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    const results = await tickDueRuns();
    expect(results).toEqual([{ runId: "run-1", ticked: false, reason: "locked" }]);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(mocked.getBotRun).not.toHaveBeenCalled();
  });

  it("collects a per-run failure instead of throwing", async () => {
    const run = makeRun({ updatedAt: new Date(0) });
    mocked.listRunningBotRuns.mockResolvedValue([run]);
    const client = fakeClient();
    client.query.mockRejectedValue(new Error("lock query exploded"));
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    const results = await tickDueRuns();
    expect(results).toEqual([{ runId: "run-1", ticked: false, reason: "lock query exploded" }]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("frees the in-process guard when the connection itself fails", async () => {
    const run = makeRun({ updatedAt: new Date(0) });
    mocked.listRunningBotRuns.mockResolvedValue([run]);
    vi.mocked(pool.connect).mockRejectedValueOnce(new Error("db down"));

    const first = await tickDueRuns();
    expect(first).toEqual([{ runId: "run-1", ticked: false, reason: "db down" }]);

    // A leaked guard would report "inflight" forever; the next pass must retry.
    const client = fakeClient();
    client.query.mockResolvedValue({ rows: [{ ok: false }] });
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    const second = await tickDueRuns();
    expect(second).toEqual([{ runId: "run-1", ticked: false, reason: "locked" }]);
  });

  it("reports a run that vanished between listing and locking", async () => {
    const run = makeRun({ updatedAt: new Date(0) });
    mocked.listRunningBotRuns.mockResolvedValue([run]);
    const client = fakeClient();
    client.query.mockResolvedValue({ rows: [{ ok: true }] });
    vi.mocked(pool.connect).mockResolvedValue(client as never);
    mocked.getBotRun.mockResolvedValue(null);

    const results = await tickDueRuns();

    expect(results).toEqual([{ runId: "run-1", ticked: false, reason: "no-longer-running" }]);
    expect(client.query).toHaveBeenCalledTimes(2); // lock + unlock
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("reports an overlapping tick of the same run as inflight", async () => {
    const run = makeRun({ updatedAt: new Date(0) });
    mocked.listRunningBotRuns.mockResolvedValue([run]);
    let release!: (value: { rows: Array<{ ok: boolean }> }) => void;
    const gate = new Promise<{ rows: Array<{ ok: boolean }> }>((resolve) => {
      release = resolve;
    });
    const client = fakeClient();
    client.query.mockReturnValueOnce(gate);
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    const first = tickDueRuns();
    const second = await tickDueRuns();
    expect(second).toEqual([{ runId: "run-1", ticked: false, reason: "inflight" }]);

    release({ rows: [{ ok: false }] });
    expect(await first).toEqual([{ runId: "run-1", ticked: false, reason: "locked" }]);
  });

  it("ticks a due running run and returns the summary", async () => {
    wireBotUsername();
    const run = makeRun({ updatedAt: new Date(0), config: config({ botCount: 1, actionsPerTick: 1 }) });
    mocked.listRunningBotRuns.mockResolvedValue([run]);
    const client = fakeClient();
    client.query.mockResolvedValue({ rows: [{ ok: true }] });
    vi.mocked(pool.connect).mockResolvedValue(client as never);
    mocked.getBotRun.mockResolvedValue(run);
    vi.mocked(getSeasonById).mockResolvedValue(activeSeason);
    mocked.listBotOwnedPlayers.mockResolvedValue([
      { username: "bot_run-1_0", userId: "u-1", seasonPlayerId: "sp-1" },
    ]);
    vi.mocked(getSeasonPlayerById).mockResolvedValue({ id: "sp-1", status: "finished" } as never);

    const results = await tickDueRuns();

    expect(results).toEqual([
      {
        runId: "run-1",
        ticked: true,
        summary: {
          actions: 0,
          errors: 1,
          stopped: false,
          lastError: expect.stringContaining("No active bot players"),
        },
      },
    ]);
    expect(client.query).toHaveBeenCalledTimes(2); // lock + unlock
  });
});

function config(overrides: Partial<BotRunConfig> = {}): BotRunConfig {
  return { ...DEFAULT_BOT_RUN_CONFIG, ...overrides };
}

const activeSeason = { id: "season-1", status: "active" } as never;

function wireInsert(ids: string[]): { values: Array<Record<string, unknown>> } {
  const seen: Array<Record<string, unknown>> = [];
  vi.mocked(db.insert).mockImplementation((table) => {
    if (table === users) {
      return {
        values: (value: Record<string, unknown>) => {
          seen.push(value);
          return { returning: () => Promise.resolve(ids.length > 0 ? [{ id: ids.shift()! }] : []) };
        },
      } as never;
    }
    return {
      values: (value: Record<string, unknown>) => {
        seen.push(value);
        return Promise.resolve(undefined);
      },
    } as never;
  });
  return { values: seen };
}

function wireBotUsername(): void {
  vi.mocked(repo.botUsername).mockImplementation(
    (runId: string, index: number) => `bot_${runId.slice(0, 8)}_${index}`,
  );
}

describe("createBotRun", () => {
  beforeEach(() => {
    wireBotUsername();
  });

  it("refuses a non-staff actor without touching the season or the run table", async () => {
    mocked.isStaff.mockReturnValue(false);
    await expect(createBotRun("season-1", config())).rejects.toMatchObject({ code: "botRunNotFound" });
    expect(getSeasonById).not.toHaveBeenCalled();
    expect(repo.createBotRunRow).not.toHaveBeenCalled();
  });

  it("refuses an unknown season", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(null);
    await expect(createBotRun("season-1", config())).rejects.toMatchObject({ code: "botRunNotFound" });
    expect(repo.createBotRunRow).not.toHaveBeenCalled();
  });

  it("creates the run, joins the bots and audits the creation", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(activeSeason);
    const run = makeRun({ config: config({ botCount: 2 }) });
    vi.mocked(repo.createBotRunRow).mockResolvedValue(run);
    vi.mocked(repo.listBotOwnedPlayers).mockResolvedValue([]);
    const insert = wireInsert(["u-0", "u-1"]);

    const created = await createBotRun("season-1", config({ botCount: 2 }));

    expect(created).toBe(run);
    expect(repo.createBotRunRow).toHaveBeenCalledWith({
      seasonId: "season-1",
      config: expect.objectContaining({ botCount: 2 }),
      createdById: "admin-1",
    });
    expect(insert.values).toEqual([
      { username: "bot_run-1_0", displayName: "Test bot 1", role: "viewer" },
      { seasonId: "season-1", playerId: "u-0" },
      { username: "bot_run-1_1", displayName: "Test bot 2", role: "viewer" },
      { seasonId: "season-1", playerId: "u-1" },
    ]);
    expect(repo.insertBotLog).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", action: "run_created", message: expect.stringContaining("2") }),
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "bot_run_created", targetId: "season-1" }),
    );
  });
});

describe("ensureBotPlayers", () => {
  beforeEach(() => {
    wireBotUsername();
  });

  it("reuses existing users and memberships without writing anything", async () => {
    vi.mocked(repo.listBotOwnedPlayers).mockResolvedValue([
      { username: "bot_run-1_0", userId: "u-0", seasonPlayerId: "sp-0" },
      { username: "bot_run-1_1", userId: "u-1", seasonPlayerId: "sp-1" },
    ]);

    const ensured = await ensureBotPlayers(makeRun({ config: config({ botCount: 2 }) }));

    expect(ensured).toBe(2);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("fills the missing membership for an existing user and creates an absent one", async () => {
    vi.mocked(repo.listBotOwnedPlayers).mockResolvedValue([
      { username: "bot_run-1_0", userId: "u-0", seasonPlayerId: null },
    ]);
    const insert = wireInsert(["fresh-user"]);

    const ensured = await ensureBotPlayers(makeRun({ config: config({ botCount: 2 }) }));

    expect(ensured).toBe(2);
    // First bot: user present, membership inserted. Second: user + membership.
    expect(insert.values).toEqual([
      { seasonId: "season-1", playerId: "u-0" },
      { username: "bot_run-1_1", displayName: "Test bot 2", role: "viewer" },
      { seasonId: "season-1", playerId: "fresh-user" },
    ]);
  });

  it("throws when the synthetic user insert returns nothing", async () => {
    vi.mocked(repo.listBotOwnedPlayers).mockResolvedValue([]);
    wireInsert([]);
    await expect(
      ensureBotPlayers(makeRun({ config: config({ botCount: 1 }) })),
    ).rejects.toThrow(/bot user insert returned nothing/);
  });
});

function activeRun(overrides: Partial<BotRun> = {}): BotRun {
  return makeRun({ config: config({ botCount: 1, actionsPerTick: 1 }), ...overrides });
}

describe("tickBotRun", () => {
  it("refuses a non-staff actor before reading the run", async () => {
    mocked.isStaff.mockReturnValue(false);
    await expect(tickBotRun("run-1")).rejects.toMatchObject({ code: "botRunNotFound" });
    expect(repo.getBotRun).not.toHaveBeenCalled();
  });

  it("refuses an unknown run", async () => {
    mocked.getBotRun.mockResolvedValue(null);
    await expect(tickBotRun("missing")).rejects.toMatchObject({ code: "botRunNotFound" });
  });

  it("passes the loaded run through to the core tick", async () => {
    mocked.getBotRun.mockResolvedValue(makeRun({ status: "stopped" }));
    await expect(tickBotRun("run-1")).rejects.toMatchObject({ code: "botRunStopped" });
  });
});

describe("tickBotRunAs", () => {
  beforeEach(() => {
    wireBotUsername();
    vi.mocked(repo.listBotOwnedPlayers).mockResolvedValue([
      { username: "bot_run-1_0", userId: "u-1", seasonPlayerId: "sp-1" },
    ]);
  });

  function activeBot(): void {
    vi.mocked(getSeasonPlayerById).mockResolvedValue({ id: "sp-1", status: "active" } as never);
    vi.mocked(getUserById).mockResolvedValue({ id: "u-1" } as never);
  }

  it("refuses a stopped run before reading the season", async () => {
    await expect(tickBotRunAs(makeRun({ status: "stopped" }), "cron")).rejects.toMatchObject({
      code: "botRunStopped",
    });
    expect(getSeasonById).not.toHaveBeenCalled();
  });

  it("pauses the run and journals an error when the season is not active", async () => {
    vi.mocked(getSeasonById).mockResolvedValue({ id: "season-1", status: "finished" } as never);

    await expect(tickBotRunAs(activeRun(), "cron")).rejects.toMatchObject({ code: "botSeasonNotActive" });

    expect(repo.updateBotRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "paused", lastError: expect.stringContaining("finished") }),
    );
    expect(repo.insertBotLog).toHaveBeenCalledWith(
      expect.objectContaining({ level: "error", action: "tick" }),
    );
  });

  it("reports an error tick when no bot player is active", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(activeSeason);
    vi.mocked(getSeasonPlayerById).mockResolvedValue({ id: "sp-1", status: "finished" } as never);

    const summary = await tickBotRunAs(activeRun(), "cron");

    expect(summary).toEqual({
      actions: 0,
      errors: 1,
      stopped: false,
      lastError: "No active bot players — every bot finished, was eliminated or withdrawn",
    });
    expect(repo.updateBotRun).toHaveBeenCalledWith("run-1", {
      status: "paused",
      totalTicks: 1,
      totalErrors: 1,
      lastError: summary.lastError,
    });
    expect(rollNewGame).not.toHaveBeenCalled();
  });

  it("skips a step when the needed endpoint is switched off", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(activeSeason);
    activeBot();
    vi.mocked(getOpenRollRow).mockResolvedValue(null as never);
    vi.mocked(nextBotStepKind).mockReturnValue(null);

    const summary = await tickBotRunAs(activeRun(), "cron");

    expect(summary).toEqual({ actions: 0, errors: 0, stopped: false, lastError: null });
    expect(repo.insertBotLog).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Skipped: needed endpoint is switched off for this run" }),
    );
    expect(repo.updateBotRun).toHaveBeenCalledWith("run-1", {
      totalTicks: 1,
      totalActions: 0,
      totalErrors: 0,
      lastError: null,
    });
  });

  it("counts a successful roll and audits it with the bot as actor", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(activeSeason);
    activeBot();
    vi.mocked(getOpenRollRow).mockResolvedValue(null as never);
    vi.mocked(nextBotStepKind).mockReturnValue("roll");
    vi.mocked(rollNewGame).mockResolvedValue("abcdef12-0000-0000-0000-000000000000");

    const summary = await tickBotRunAs(activeRun(), "cron");

    expect(summary).toEqual({ actions: 1, errors: 0, stopped: false, lastError: null });
    expect(rollNewGame).toHaveBeenCalledWith("sp-1", { actor: { id: "u-1" } });
    expect(repo.insertBotLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "roll", payload: { rollId: "abcdef12-0000-0000-0000-000000000000" } }),
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "bot_roll", actorId: "u-1", targetId: "sp-1" }),
    );
    expect(repo.updateBotRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ totalTicks: 1, totalActions: 1, totalErrors: 0 }),
    );
  });

  it("uses an item before the step and journals it", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(activeSeason);
    vi.mocked(parseSeasonConfig).mockReturnValue({
      iee: { enabled: true, allowTargetingOthers: true, pvpProtectionMoves: 3 },
    } as never);
    vi.mocked(getSeasonPlayerById).mockResolvedValue({
      id: "sp-1",
      status: "active",
      position: 4,
      balancePoints: 2,
      rollSeq: 1,
    } as never);
    vi.mocked(getUserById).mockResolvedValue({ id: "u-1" } as never);
    vi.mocked(getOpenRollRow).mockResolvedValue(null as never);
    vi.mocked(nextBotStepKind).mockReturnValue(null);
    vi.mocked(getHeldItems).mockResolvedValue([
      { id: "inv-1", itemKey: "cleansing_salve", params: {} },
    ] as never);
    vi.mocked(planBotItemUse).mockReturnValue({
      inventoryId: "inv-1",
      itemKey: "cleansing_salve",
      targetSeasonPlayerId: "sp-1",
      targetUsername: null,
      intent: "cleanse",
      score: 1000,
    });
    vi.mocked(activateInventoryItem).mockResolvedValue({
      itemKey: "cleansing_salve",
      targetUsername: null,
    });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const summary = await tickBotRunAs(activeRun(), "cron");

      expect(summary.actions).toBe(1);
      expect(activateInventoryItem).toHaveBeenCalledWith(
        { inventoryId: "inv-1", targetSeasonPlayerId: "sp-1" },
        { actor: { id: "u-1" } },
      );
      expect(repo.insertBotLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "item", botUsername: "bot_run-1_0" }),
      );
      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: "bot_item", actorId: "u-1" }),
      );
      expect(rollNewGame).not.toHaveBeenCalled();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("resolves a passed roll with a comment and rating", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(activeSeason);
    activeBot();
    vi.mocked(getOpenRollRow).mockResolvedValue({ id: "roll-9" } as never);
    vi.mocked(nextBotStepKind).mockReturnValue("resolve");
    vi.mocked(pickBotOutcome).mockReturnValue("passed");
    vi.mocked(pickBotReason).mockReturnValue("finished it");
    vi.mocked(pickBotComment).mockReturnValue("great pick");
    vi.mocked(pickBotRating).mockReturnValue(9);
    vi.mocked(resolveGameRoll).mockResolvedValue({
      fromPosition: 1,
      toPosition: 2,
      newBalancePoints: 5,
    } as never);

    const summary = await tickBotRunAs(activeRun(), "cron");

    expect(resolveGameRoll).toHaveBeenCalledWith(
      { rollId: "roll-9", outcome: "passed", reason: "finished it", comment: "great pick", rating: 9 },
      { actor: { id: "u-1" } },
    );
    // NOTE: a resolve step is journaled but never counted in `actions`
    // (only the roll branch increments it) — reported as a bug.
    expect(summary.actions).toBe(0);
    expect(summary.errors).toBe(0);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "bot_resolve",
        payload: expect.objectContaining({ outcome: "passed", rollId: "roll-9" }),
      }),
    );
  });

  it("drops the comment and rating for a non-passed outcome", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(activeSeason);
    activeBot();
    vi.mocked(getOpenRollRow).mockResolvedValue({ id: "roll-9" } as never);
    vi.mocked(nextBotStepKind).mockReturnValue("resolve");
    vi.mocked(pickBotOutcome).mockReturnValue("dropped");
    vi.mocked(pickBotReason).mockReturnValue("not for me");
    vi.mocked(resolveGameRoll).mockResolvedValue({
      fromPosition: 1,
      toPosition: 1,
      newBalancePoints: 0,
    } as never);

    await tickBotRunAs(activeRun(), "cron");

    expect(resolveGameRoll).toHaveBeenCalledWith(
      { rollId: "roll-9", outcome: "dropped", reason: "not for me", comment: undefined, rating: undefined },
      { actor: { id: "u-1" } },
    );
    expect(pickBotComment).not.toHaveBeenCalled();
    expect(pickBotRating).not.toHaveBeenCalled();
  });

  it("counts a failed step by its error code and keeps going", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(activeSeason);
    activeBot();
    vi.mocked(getOpenRollRow).mockResolvedValue(null as never);
    vi.mocked(nextBotStepKind).mockReturnValue("roll");
    vi.mocked(rollNewGame).mockRejectedValue(new BotError("gameAlreadyHaveRoll"));

    const summary = await tickBotRunAs(activeRun(), "cron");

    expect(summary).toEqual({
      actions: 0,
      errors: 1,
      stopped: false,
      lastError: "roll failed for bot_run-1_0: gameAlreadyHaveRoll",
    });
    expect(repo.updateBotRun).toHaveBeenCalledWith("run-1", {
      totalTicks: 1,
      totalActions: 0,
      totalErrors: 1,
      lastError: summary.lastError,
    });
  });

  it("halts on the first error when stopOnError is set", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(activeSeason);
    activeBot();
    vi.mocked(getOpenRollRow).mockResolvedValue(null as never);
    vi.mocked(nextBotStepKind).mockReturnValue("roll");
    vi.mocked(rollNewGame).mockRejectedValue(new Error("loop exploded"));

    const summary = await tickBotRunAs(activeRun({ config: config({ botCount: 1, actionsPerTick: 3, stopOnError: true }) }), "cron");

    expect(summary.stopped).toBe(true);
    expect(rollNewGame).toHaveBeenCalledTimes(1);
    expect(repo.insertBotLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "run_stopped" }),
    );
    expect(repo.updateBotRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "stopped", totalErrors: 1 }),
    );
  });

  it("counts a deleted synthetic user as an error without calling the game loop", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(activeSeason);
    vi.mocked(getSeasonPlayerById).mockResolvedValue({ id: "sp-1", status: "active" } as never);
    vi.mocked(getUserById).mockResolvedValue(null as never);

    const summary = await tickBotRunAs(activeRun(), "cron");

    expect(summary.lastError).toBe("skipped bot_run-1_0: synthetic user is gone");
    expect(summary.errors).toBe(1);
    expect(rollNewGame).not.toHaveBeenCalled();
    expect(repo.insertBotLog).toHaveBeenCalledWith(
      expect.objectContaining({ level: "error", botUsername: "bot_run-1_0" }),
    );
  });
});

describe("cleanupBotRun", () => {
  it("refuses a non-staff actor", async () => {
    mocked.isStaff.mockReturnValue(false);
    await expect(cleanupBotRun("run-1", false)).rejects.toMatchObject({ code: "botRunNotFound" });
  });

  it("refuses an unknown run", async () => {
    mocked.getBotRun.mockResolvedValue(null);
    await expect(cleanupBotRun("missing", false)).rejects.toMatchObject({ code: "botRunNotFound" });
  });

  it("keeps the run row by default, stopping it and journaling the cleanup", async () => {
    mocked.getBotRun.mockResolvedValue(makeRun());
    vi.mocked(repo.deleteBotUsers).mockResolvedValue(3);

    const result = await cleanupBotRun("run-1", false);

    expect(result).toEqual({ removedPlayers: 3 });
    expect(repo.deleteBotRun).not.toHaveBeenCalled();
    expect(repo.updateBotRun).toHaveBeenCalledWith("run-1", { status: "stopped" });
    expect(repo.insertBotLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cleanup", payload: { removedPlayers: 3 } }),
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "bot_run_cleaned", payload: expect.objectContaining({ deleteRun: false }) }),
    );
  });

  it("drops the run row and skips the journal entry when asked", async () => {
    mocked.getBotRun.mockResolvedValue(makeRun());
    vi.mocked(repo.deleteBotUsers).mockResolvedValue(2);

    await cleanupBotRun("run-1", true);

    expect(repo.deleteBotRun).toHaveBeenCalledWith("run-1");
    expect(repo.updateBotRun).not.toHaveBeenCalled();
    expect(repo.insertBotLog).not.toHaveBeenCalled();
  });
});

describe("updateBotRunConfig", () => {
  it("refuses an unknown run", async () => {
    mocked.getBotRun.mockResolvedValue(null);
    await expect(updateBotRunConfig("missing", config())).rejects.toMatchObject({ code: "botRunNotFound" });
  });

  it("writes the config and returns the re-read run", async () => {
    const next = config({ botCount: 5 });
    mocked.getBotRun
      .mockResolvedValueOnce(makeRun({ config: config({ botCount: 1 }) }))
      .mockResolvedValue(makeRun({ config: next }));

    const run = await updateBotRunConfig("run-1", next);

    expect(repo.updateBotRun).toHaveBeenCalledWith("run-1", { config: next });
    expect(run.config.botCount).toBe(5);
    expect(repo.insertBotLog).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Run config updated", payload: { config: next } }),
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "bot_run_config_updated" }),
    );
  });
});

describe("tickBotRunSystem", () => {
  it("refuses an unknown run", async () => {
    mocked.getBotRun.mockResolvedValue(null);
    await expect(tickBotRunSystem("missing")).rejects.toMatchObject({ code: "botRunNotFound" });
  });

  it("delegates without requiring a staff session", async () => {
    mocked.getCurrentUser.mockResolvedValue(null);
    mocked.getBotRun.mockResolvedValue(makeRun({ status: "stopped" }));

    await expect(tickBotRunSystem("run-1")).rejects.toMatchObject({ code: "botRunStopped" });
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});
