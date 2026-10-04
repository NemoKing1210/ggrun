import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  eventLog,
  rerollRequests,
  type GameRoll,
  type RerollRequest,
  type Season,
  type SeasonPlayer,
} from "@/db/schema";

import { approveRerollRequest, rejectRerollRequest } from "./reroll";

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

const catalogRepo = vi.hoisted(() => ({
  getRerollRequestById: vi.fn(),
  countRerollsForGame: vi.fn(),
}));
vi.mock("@/lib/modules/catalog/repository", () => catalogRepo);

const seasons = vi.hoisted(() => ({ getSeasonById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => seasons);

const notifications = vi.hoisted(() => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/modules/notifications/service", () => notifications);

const ACTOR = { id: "admin-1", role: "admin" };
const REROLLABLE = { rerolls: { allowed: true, limitPerGame: 1, requireApproval: true } };

function rerollRequest(overrides: Partial<RerollRequest> = {}): RerollRequest {
  return {
    id: "req-1",
    seasonPlayerId: "sp-1",
    gameRollId: "roll-1",
    reason: "the game was not in the pool genre I wanted",
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
    status: "rolled",
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

function season(config: unknown = REROLLABLE): Season {
  return {
    id: "season-1",
    slug: "s1",
    title: "Season 1",
    status: "active",
    config,
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
  catalogRepo.getRerollRequestById.mockReset();
  catalogRepo.countRerollsForGame.mockReset();
  catalogRepo.countRerollsForGame.mockResolvedValue(0);
  seasons.getSeasonById.mockReset();
  notifications.notifyUser.mockReset();
  notifications.notifyUser.mockResolvedValue(null);
});

describe("approveRerollRequest", () => {
  it("refuses a non-staff actor before reading the request", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    await expect(approveRerollRequest("req-1")).rejects.toMatchObject({ code: "adminStaffRequired" });
    expect(catalogRepo.getRerollRequestById).not.toHaveBeenCalled();
  });

  it("refuses a request that is missing or already resolved", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(null);
    await expect(approveRerollRequest("req-1")).rejects.toMatchObject({ code: "gameRerollRequestNotFound" });

    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest({ status: "rejected" }));
    await expect(approveRerollRequest("req-1")).rejects.toMatchObject({ code: "gameRerollRequestNotFound" });
  });

  it("refuses when the roll behind the request is gone", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([]);
    await expect(approveRerollRequest("req-1")).rejects.toMatchObject({ code: "gameRollNotFound" });
  });

  it.each(["passed", "dropped", "rerolled"] as const)("refuses a roll already %s", async (status) => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([gameRoll({ status })]);
    await expect(approveRerollRequest("req-1")).rejects.toMatchObject({ code: "gameRollAlreadyResolved" });
  });

  it("refuses when the participant is gone", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([gameRoll()], []);
    await expect(approveRerollRequest("req-1")).rejects.toMatchObject({ code: "gameParticipantNotFound" });
  });

  it("refuses when the season is gone", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([gameRoll()], [seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(null);
    await expect(approveRerollRequest("req-1")).rejects.toMatchObject({ code: "gameSeasonNotFound" });
  });

  it("refuses to approve rerolls a season disallows", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([gameRoll()], [seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(season({ rerolls: { allowed: false, limitPerGame: 1 } }));

    await expect(approveRerollRequest("req-1")).rejects.toMatchObject({ code: "gameRerollLimit" });
    expect(catalogRepo.countRerollsForGame).not.toHaveBeenCalled();
  });

  it("refuses to approve a reroll the player's own allowance cannot fund", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([gameRoll()], [seasonPlayer({ rerollsUsed: 1 })]);
    seasons.getSeasonById.mockResolvedValue(season());

    await expect(approveRerollRequest("req-1")).rejects.toMatchObject({ code: "gameRerollLimit" });
    expect(catalogRepo.countRerollsForGame).not.toHaveBeenCalled();
  });

  it("refuses when the per-game reroll limit is already spent", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([gameRoll()], [seasonPlayer({ rerollsUsed: 0 })]);
    seasons.getSeasonById.mockResolvedValue(season());
    catalogRepo.countRerollsForGame.mockResolvedValue(1);

    await expect(approveRerollRequest("req-1")).rejects.toMatchObject({ code: "gameRerollLimitForGame" });
  });

  it("approves the request and tells the feed, without drawing a game", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([gameRoll()], [seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(season());

    await expect(approveRerollRequest("req-1")).resolves.toBeUndefined();

    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({
        table: rerollRequests,
        values: expect.objectContaining({ status: "approved", resolvedBy: "admin-1" }),
      }),
    );
    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        table: eventLog,
        values: expect.objectContaining({
          seasonId: "season-1",
          seasonPlayerId: "sp-1",
          eventType: "reroll_approved",
          payload: { gameId: "game-1", requestId: "req-1" },
        }),
      }),
    );
  });

  it("notifies the player that permission was granted, not a replacement game", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([gameRoll()], [seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(season());

    await approveRerollRequest("req-1");

    expect(notifications.notifyUser).toHaveBeenCalledWith(
      "user-1",
      "reroll_approved",
      {
        seasonId: "season-1",
        seasonSlug: "s1",
        seasonTitle: "Season 1",
        seasonPlayerId: "sp-1",
        rollId: "roll-1",
        requestId: "req-1",
      },
    );
  });

  it("still approves when the notification fan-out fails", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([gameRoll()], [seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(season());
    notifications.notifyUser.mockRejectedValue(new Error("bus down"));

    await expect(approveRerollRequest("req-1")).resolves.toBeUndefined();
    expect(logger.log.error).toHaveBeenCalledWith(
      "notifications.reroll_approved.failed",
      expect.objectContaining({ requestId: "req-1" }),
    );
  });
});

describe("rejectRerollRequest", () => {
  it("refuses a non-staff actor", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    await expect(rejectRerollRequest("req-1", "a valid reason")).rejects.toMatchObject({
      code: "adminStaffRequired",
    });
  });

  it("requires a meaningful reason before it even reads the request", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await expect(rejectRerollRequest("req-1", "  no  ")).rejects.toMatchObject({ code: "formReasonRequired" });
    expect(catalogRepo.getRerollRequestById).not.toHaveBeenCalled();
  });

  it("refuses a request that is missing or already resolved", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest({ status: "approved" }));
    await expect(rejectRerollRequest("req-1", "a valid reason")).rejects.toMatchObject({
      code: "gameRerollRequestNotFound",
    });
  });

  it("refuses when the participant is gone", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([]);
    await expect(rejectRerollRequest("req-1", "a valid reason")).rejects.toMatchObject({
      code: "gameParticipantNotFound",
    });
  });

  it("marks the request rejected with the trimmed note and writes the feed", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([seasonPlayer()], [gameRoll({ gameId: "game-1" })], []);
    seasons.getSeasonById.mockResolvedValue(season());

    await rejectRerollRequest("req-1", "  the draw was fair  ");

    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({
        table: rerollRequests,
        values: expect.objectContaining({
          status: "rejected",
          adminNote: "the draw was fair",
          resolvedBy: "admin-1",
        }),
      }),
    );
    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        table: eventLog,
        values: expect.objectContaining({
          eventType: "reroll_rejected",
          payload: { gameId: "game-1", reason: "the draw was fair", requestId: "req-1" },
        }),
      }),
    );
  });

  it("notifies the player with the reason and the game they keep", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push(
      [seasonPlayer()],
      [gameRoll({ gameId: "game-1" })],
      [{ id: "game-1", title: "Hades", coverUrl: "https://img/hades.png" }],
    );
    seasons.getSeasonById.mockResolvedValue(season());

    await rejectRerollRequest("req-1", "the draw was fair");

    expect(notifications.notifyUser).toHaveBeenCalledWith(
      "user-1",
      "reroll_rejected",
      expect.objectContaining({
        gameTitle: "Hades",
        imageUrl: "https://img/hades.png",
        rollId: "roll-1",
        requestId: "req-1",
        adminNote: "the draw was fair",
      }),
    );
  });

  it("still rejects when the notification fan-out fails", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([seasonPlayer()], [gameRoll()], []);
    seasons.getSeasonById.mockResolvedValue(season());
    notifications.notifyUser.mockRejectedValue(new Error("bus down"));

    await expect(rejectRerollRequest("req-1", "the draw was fair")).resolves.toBeUndefined();
    expect(logger.log.error).toHaveBeenCalledWith(
      "notifications.reroll_rejected.failed",
      expect.objectContaining({ requestId: "req-1" }),
    );
  });

  it("reports an unknown game and season when neither is found", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    catalogRepo.getRerollRequestById.mockResolvedValue(rerollRequest());
    dbFake.selectResults.push([seasonPlayer()], [gameRoll({ gameId: null })]);
    seasons.getSeasonById.mockResolvedValue(null);

    await rejectRerollRequest("req-1", "the draw was fair");

    expect(dbFake.inserts[0]?.values.payload).toEqual({
      gameId: null,
      reason: "the draw was fair",
      requestId: "req-1",
    });
    const [, , payload] = notifications.notifyUser.mock.calls[0] as [
      string,
      string,
      { gameTitle: string; imageUrl: unknown; seasonSlug: unknown },
    ];
    expect(payload.gameTitle).toBe("");
    expect(payload.imageUrl).toBeNull();
    expect(payload.seasonSlug).toBeNull();
  });
});
