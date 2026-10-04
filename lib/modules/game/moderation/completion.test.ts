import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  completionRequests,
  eventLog,
  type CompletionRequest,
  type GameRoll,
  type Season,
  type SeasonPlayer,
} from "@/db/schema";

import { approveCompletionRequest, rejectCompletionRequest } from "./completion";

/** Minimal thenable Drizzle stand-in that records writes and replays queued reads. */
const dbFake = vi.hoisted(() => {
  interface Chain {
    from(...args: unknown[]): Chain;
    where(...args: unknown[]): Chain;
    orderBy(...args: unknown[]): Chain;
    limit(...args: unknown[]): Chain;
    innerJoin(...args: unknown[]): Chain;
    set(values: Record<string, unknown>): Chain;
    values(values: Record<string, unknown>): Chain;
    returning(...args: unknown[]): Chain;
    then(onFulfilled: (rows: unknown[]) => unknown): Promise<unknown>;
  }
  const selectResults: unknown[][] = [];
  const updates: { table: unknown; values: Record<string, unknown> }[] = [];
  const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
  function chain(resolve: () => unknown[]): Chain {
    const c: Chain = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      innerJoin: () => c,
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
      c.values = (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return c;
      };
      return c;
    },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return {
    db,
    selectResults,
    updates,
    inserts,
    reset: () => {
      selectResults.length = 0;
      updates.length = 0;
      inserts.length = 0;
    },
  };
});
vi.mock("@/lib/infrastructure/db", () => ({ db: dbFake.db }));

const session = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isStaff: vi.fn((user: { role?: string } | null) => user?.role === "admin" || user?.role === "judge"),
}));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const catalogRepo = vi.hoisted(() => ({ getCompletionRequestById: vi.fn() }));
vi.mock("@/lib/modules/catalog/repository", () => catalogRepo);

const seasons = vi.hoisted(() => ({ getSeasonById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => seasons);

const notifications = vi.hoisted(() => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/modules/notifications/service", () => notifications);

const turn = vi.hoisted(() => ({ applyResolvedTurn: vi.fn() }));
vi.mock("../service/turn", () => turn);

const ACTOR = { id: "admin-1", role: "admin" };

function completionRequest(overrides: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    id: "req-1",
    seasonPlayerId: "sp-1",
    gameRollId: "roll-1",
    outcome: "passed",
    reason: "finished the ending",
    rating: 8,
    status: "pending",
    adminNote: null,
    requestedAt: new Date(0),
    resolvedAt: null,
    resolvedBy: null,
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

function season(): Season {
  return {
    id: "season-1",
    slug: "s1",
    title: "Season 1",
    status: "active",
    config: {},
    rulesMd: null,
    startedAt: null,
    finishedAt: null,
    createdBy: null,
    createdAt: new Date(0),
  } as unknown as Season;
}

beforeEach(() => {
  dbFake.reset();
  session.getCurrentUser.mockReset();
  logger.log.error.mockClear();
  catalogRepo.getCompletionRequestById.mockReset();
  seasons.getSeasonById.mockReset();
  notifications.notifyUser.mockReset();
  notifications.notifyUser.mockResolvedValue(null);
  turn.applyResolvedTurn.mockReset();
  turn.applyResolvedTurn.mockResolvedValue({
    diceResults: [1],
    fromPosition: 3,
    toPosition: 4,
    newBalancePoints: 10,
  });
});

describe("approveCompletionRequest", () => {
  it("refuses a non-staff actor before reading the request", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    await expect(approveCompletionRequest("req-1")).rejects.toMatchObject({ code: "adminStaffRequired" });
    expect(catalogRepo.getCompletionRequestById).not.toHaveBeenCalled();
  });

  it("refuses a request that is missing or already resolved", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(null);
    await expect(approveCompletionRequest("req-1")).rejects.toMatchObject({
      code: "gameCompletionRequestNotFound",
    });

    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest({ status: "approved" }));
    await expect(approveCompletionRequest("req-1")).rejects.toMatchObject({
      code: "gameCompletionRequestNotFound",
    });
  });

  it("refuses when the roll behind the request is gone", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest());
    dbFake.selectResults.push([]);
    await expect(approveCompletionRequest("req-1")).rejects.toMatchObject({ code: "gameRollNotFound" });
  });

  it.each(["passed", "dropped", "rerolled"] as const)("refuses a roll already %s", async (status) => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest());
    dbFake.selectResults.push([gameRoll({ status })]);
    await expect(approveCompletionRequest("req-1")).rejects.toMatchObject({ code: "gameRollAlreadyResolved" });
  });

  it("refuses when the participant is gone", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest());
    dbFake.selectResults.push([gameRoll()], []);
    await expect(approveCompletionRequest("req-1")).rejects.toMatchObject({ code: "gameParticipantNotFound" });
  });

  it("refuses when the season is gone", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest());
    dbFake.selectResults.push([gameRoll()], [seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(null);
    await expect(approveCompletionRequest("req-1")).rejects.toMatchObject({ code: "gameSeasonNotFound" });
  });

  it("delegates the whole turn to applyResolvedTurn with the request's outcome, reason and rating", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    const req = completionRequest({ outcome: "dropped", reason: "quit early", rating: 3 });
    const roll = gameRoll();
    const sp = seasonPlayer();
    catalogRepo.getCompletionRequestById.mockResolvedValue(req);
    dbFake.selectResults.push([roll], [sp], []);
    seasons.getSeasonById.mockResolvedValue(season());

    await approveCompletionRequest("req-1");

    expect(turn.applyResolvedTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sp,
        roll,
        outcome: "dropped",
        notes: "quit early",
        rating: 3,
        feedExtra: { approvedBy: "admin-1" },
        extraEvents: [{ eventType: "completion_approved", payload: { requestId: "req-1", outcome: "dropped" } }],
      }),
    );
  });

  it("marks the request approved inside the turn's own transaction", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    const req = completionRequest();
    catalogRepo.getCompletionRequestById.mockResolvedValue(req);
    dbFake.selectResults.push([gameRoll()], [seasonPlayer()], []);
    seasons.getSeasonById.mockResolvedValue(season());
    turn.applyResolvedTurn.mockImplementation(
      async (input: Parameters<typeof turn.applyResolvedTurn>[0]) => {
        await input.extraWrites?.(dbFake.db as never, { moveId: "move-1" });
        return { diceResults: [], fromPosition: 0, toPosition: 0, newBalancePoints: 0 };
      },
    );

    await approveCompletionRequest("req-1");

    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({
        table: completionRequests,
        values: expect.objectContaining({ status: "approved", resolvedBy: "admin-1" }),
      }),
    );
    expect(dbFake.updates[0]?.values.resolvedAt).toBeInstanceOf(Date);
  });

  it("notifies the player with the season and game context", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest({ outcome: "passed" }));
    dbFake.selectResults.push(
      [gameRoll()],
      [seasonPlayer()],
      [{ id: "game-1", title: "Hades", coverUrl: "https://img/hades.png" }],
    );
    seasons.getSeasonById.mockResolvedValue(season());
    turn.applyResolvedTurn.mockImplementation(
      async (input: Parameters<typeof turn.applyResolvedTurn>[0]) => {
        await input.extraWrites?.(dbFake.db as never, { moveId: "move-1" });
        return { diceResults: [], fromPosition: 0, toPosition: 0, newBalancePoints: 0 };
      },
    );

    await approveCompletionRequest("req-1");

    expect(notifications.notifyUser).toHaveBeenCalledWith(
      "user-1",
      "completion_approved",
      expect.objectContaining({
        seasonId: "season-1",
        seasonSlug: "s1",
        seasonTitle: "Season 1",
        seasonPlayerId: "sp-1",
        gameId: "game-1",
        gameTitle: "Hades",
        imageUrl: "https://img/hades.png",
        rollId: "roll-1",
        requestId: "req-1",
        outcome: "passed",
      }),
    );
  });

  it("still approves when the notification fan-out fails", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest());
    dbFake.selectResults.push([gameRoll()], [seasonPlayer()], []);
    seasons.getSeasonById.mockResolvedValue(season());
    notifications.notifyUser.mockRejectedValue(new Error("bus down"));

    await expect(approveCompletionRequest("req-1")).resolves.toBeUndefined();
    expect(logger.log.error).toHaveBeenCalledWith(
      "notifications.completion_approved.failed",
      expect.objectContaining({ requestId: "req-1" }),
    );
  });

  it("sends an empty game title when the roll has no catalog game", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest());
    dbFake.selectResults.push([gameRoll({ gameId: null })], [seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(season());

    await approveCompletionRequest("req-1");

    const [, , payload] = notifications.notifyUser.mock.calls[0] as [string, string, { gameTitle: string; imageUrl: unknown }];
    expect(payload.gameTitle).toBe("");
    expect(payload.imageUrl).toBeNull();
  });
});

describe("rejectCompletionRequest", () => {
  it("refuses a non-staff actor", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    await expect(rejectCompletionRequest("req-1", "a valid reason")).rejects.toMatchObject({
      code: "adminStaffRequired",
    });
  });

  it("requires a meaningful reason before it even reads the request", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await expect(rejectCompletionRequest("req-1", "  no  ")).rejects.toMatchObject({ code: "formReasonRequired" });
    expect(catalogRepo.getCompletionRequestById).not.toHaveBeenCalled();
  });

  it("refuses a request that is missing or already resolved", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(null);
    await expect(rejectCompletionRequest("req-1", "a valid reason")).rejects.toMatchObject({
      code: "gameCompletionRequestNotFound",
    });
  });

  it("refuses when the participant is gone", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest());
    dbFake.selectResults.push([]);
    await expect(rejectCompletionRequest("req-1", "a valid reason")).rejects.toMatchObject({
      code: "gameParticipantNotFound",
    });
  });

  it("marks the request rejected with the trimmed note and the judge's id", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest());
    dbFake.selectResults.push([seasonPlayer()], [gameRoll()], []);
    seasons.getSeasonById.mockResolvedValue(season());

    await rejectCompletionRequest("req-1", "  not enough evidence  ");

    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({
        table: completionRequests,
        values: expect.objectContaining({
          status: "rejected",
          adminNote: "not enough evidence",
          resolvedBy: "admin-1",
        }),
      }),
    );
  });

  it("writes the rejection to the season feed", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest({ outcome: "passed" }));
    dbFake.selectResults.push([seasonPlayer()], [gameRoll({ gameId: "game-1" })], []);
    seasons.getSeasonById.mockResolvedValue(season());

    await rejectCompletionRequest("req-1", "not enough evidence");

    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        table: eventLog,
        values: expect.objectContaining({
          seasonId: "season-1",
          seasonPlayerId: "sp-1",
          eventType: "completion_rejected",
          payload: { gameId: "game-1", reason: "not enough evidence", requestId: "req-1", outcome: "passed" },
        }),
      }),
    );
  });

  it("notifies the player with the reason", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest({ outcome: "passed" }));
    dbFake.selectResults.push(
      [seasonPlayer()],
      [gameRoll({ gameId: "game-1" })],
      [{ id: "game-1", title: "Hades", coverUrl: "https://img/hades.png" }],
    );
    seasons.getSeasonById.mockResolvedValue(season());

    await rejectCompletionRequest("req-1", "not enough evidence");

    expect(notifications.notifyUser).toHaveBeenCalledWith(
      "user-1",
      "completion_rejected",
      expect.objectContaining({
        gameTitle: "Hades",
        rollId: "roll-1",
        requestId: "req-1",
        outcome: "passed",
        adminNote: "not enough evidence",
      }),
    );
  });

  it("still rejects when the notification fan-out fails", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest());
    dbFake.selectResults.push([seasonPlayer()], [gameRoll()], []);
    seasons.getSeasonById.mockResolvedValue(season());
    notifications.notifyUser.mockRejectedValue(new Error("bus down"));

    await expect(rejectCompletionRequest("req-1", "not enough evidence")).resolves.toBeUndefined();
    expect(logger.log.error).toHaveBeenCalledWith(
      "notifications.completion_rejected.failed",
      expect.objectContaining({ requestId: "req-1" }),
    );
  });

  it("reports an unknown game when the request's roll has none", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getCompletionRequestById.mockResolvedValue(completionRequest({ outcome: "passed" }));
    dbFake.selectResults.push([seasonPlayer()], [gameRoll({ gameId: null })], []);
    seasons.getSeasonById.mockResolvedValue(null);

    await rejectCompletionRequest("req-1", "not enough evidence");

    expect(dbFake.inserts[0]?.values.payload).toMatchObject({ gameId: null });
    const [, , payload] = notifications.notifyUser.mock.calls[0] as [string, string, { gameTitle: string; seasonSlug: unknown }];
    expect(payload.gameTitle).toBe("");
    expect(payload.seasonSlug).toBeNull();
  });
});
