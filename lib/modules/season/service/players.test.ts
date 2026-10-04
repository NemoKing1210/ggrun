import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Season, SeasonPlayer } from "@/db/schema";

import { adminAddPlayer, adminAdjustPlayer, adminRemovePlayer } from "./players";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn(), isStaff: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const playerRepo = vi.hoisted(() => ({
  addPlayerToSeason: vi.fn(),
  getSeasonPlayerById: vi.fn(),
  getSeasonPlayerForUser: vi.fn(),
  removePlayerFromSeason: vi.fn(),
  updateSeasonPlayer: vi.fn(),
}));
vi.mock("@/lib/modules/season/repository/players", () => playerRepo);

const seasonsRepo = vi.hoisted(() => ({ getSeasonById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => seasonsRepo);

const eventsInfra = vi.hoisted(() => ({ logAdminAction: vi.fn(), logEvent: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => eventsInfra);

const notifications = vi.hoisted(() => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/modules/notifications/service", () => notifications);

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const ACTOR = { id: "admin-1", role: "admin" };

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

function season(overrides: Partial<Season> = {}): Season {
  return {
    id: "season-1",
    slug: "run-1",
    title: "Run 1",
    status: "active",
    config: {},
    rulesMd: null,
    startedAt: null,
    finishedAt: null,
    createdBy: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

beforeEach(() => {
  session.getCurrentUser.mockReset();
  session.isStaff.mockReset();
  session.getCurrentUser.mockResolvedValue(ACTOR);
  session.isStaff.mockReturnValue(true);
  for (const fn of Object.values(playerRepo)) fn.mockReset();
  seasonsRepo.getSeasonById.mockReset();
  seasonsRepo.getSeasonById.mockResolvedValue(season());
  eventsInfra.logAdminAction.mockReset();
  eventsInfra.logEvent.mockReset();
  notifications.notifyUser.mockReset();
  notifications.notifyUser.mockResolvedValue(undefined);
  logger.log.info.mockClear();
  logger.log.error.mockClear();
});

describe("staff gate", () => {
  it.each([
    ["adminAddPlayer", () => adminAddPlayer("season-1", "user-1")],
    ["adminRemovePlayer", () => adminRemovePlayer("season-1", "user-1")],
    ["adminAdjustPlayer", () => adminAdjustPlayer({ seasonPlayerId: "sp-1", reason: "x" })],
  ])("rejects %s for a non-staff actor without touching repositories", async (_name, run) => {
    session.isStaff.mockReturnValue(false);
    await expect(run()).rejects.toMatchObject({ code: "adminStaffRequired" });
    expect(playerRepo.addPlayerToSeason).not.toHaveBeenCalled();
    expect(playerRepo.removePlayerFromSeason).not.toHaveBeenCalled();
    expect(playerRepo.updateSeasonPlayer).not.toHaveBeenCalled();
  });
});

describe("adminAddPlayer", () => {
  it("persists the roster row, logs both trails and notifies with the season context", async () => {
    await adminAddPlayer("season-1", "user-9");

    expect(playerRepo.addPlayerToSeason).toHaveBeenCalledWith("season-1", "user-9");
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith({
      actorId: ACTOR.id,
      actionType: "player_added",
      targetType: "season_player",
      payload: { seasonId: "season-1", userId: "user-9" },
    });
    expect(eventsInfra.logEvent).toHaveBeenCalledWith({
      seasonId: "season-1",
      eventType: "player_joined",
      payload: { userId: "user-9" },
    });
    expect(notifications.notifyUser).toHaveBeenCalledWith("user-9", "player_added", {
      seasonId: "season-1",
      seasonSlug: "run-1",
      seasonTitle: "Run 1",
    });
  });

  it("falls back to empty season context when the season is gone", async () => {
    seasonsRepo.getSeasonById.mockResolvedValue(null);
    await adminAddPlayer("season-1", "user-9");
    expect(notifications.notifyUser).toHaveBeenCalledWith("user-9", "player_added", {
      seasonId: "season-1",
      seasonSlug: null,
      seasonTitle: "",
    });
  });

  it("does not fail the add when the notification rejects", async () => {
    notifications.notifyUser.mockRejectedValue(new Error("socket down"));
    await expect(adminAddPlayer("season-1", "user-9")).resolves.toBeUndefined();
    expect(logger.log.error).toHaveBeenCalledWith("notifications.player_added.failed", expect.anything());
  });
});

describe("adminRemovePlayer", () => {
  it("rejects when the user is not on the roster", async () => {
    playerRepo.getSeasonPlayerForUser.mockResolvedValue(null);
    await expect(adminRemovePlayer("season-1", "user-9")).rejects.toMatchObject({
      code: "adminPlayerNotFound",
    });
    expect(playerRepo.removePlayerFromSeason).not.toHaveBeenCalled();
  });

  it("removes the row and reports the removed participant id", async () => {
    playerRepo.getSeasonPlayerForUser.mockResolvedValue(seasonPlayer({ id: "sp-9" }));

    await adminRemovePlayer("season-1", "user-9");

    expect(playerRepo.removePlayerFromSeason).toHaveBeenCalledWith("season-1", "user-9");
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith({
      actorId: ACTOR.id,
      actionType: "player_removed",
      targetType: "season_player",
      targetId: "sp-9",
      payload: { seasonId: "season-1", userId: "user-9" },
    });
    expect(eventsInfra.logEvent).toHaveBeenCalledWith({
      seasonId: "season-1",
      eventType: "player_left",
      payload: { userId: "user-9" },
    });
    expect(notifications.notifyUser).toHaveBeenCalledWith("user-9", "player_removed", {
      seasonId: "season-1",
      seasonSlug: "run-1",
      seasonTitle: "Run 1",
    });
  });
});

describe("adminAdjustPlayer", () => {
  it("rejects an unknown season player", async () => {
    playerRepo.getSeasonPlayerById.mockResolvedValue(null);
    await expect(
      adminAdjustPlayer({ seasonPlayerId: "nope", reason: "x" }),
    ).rejects.toMatchObject({ code: "adminPlayerNotFound" });
    expect(playerRepo.updateSeasonPlayer).not.toHaveBeenCalled();
  });

  it("applies only the fields the caller supplied", async () => {
    playerRepo.getSeasonPlayerById.mockResolvedValue(seasonPlayer());

    await adminAdjustPlayer({
      seasonPlayerId: "sp-1",
      position: 12,
      balancePoints: 30,
      reason: "judge correction",
    });

    expect(playerRepo.updateSeasonPlayer).toHaveBeenCalledWith("sp-1", {
      position: 12,
      balancePoints: 30,
    });
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith({
      actorId: ACTOR.id,
      actionType: "player_adjusted",
      targetType: "season_player",
      targetId: "sp-1",
      payload: { position: 12, balancePoints: 30, reason: "judge correction" },
    });
    expect(notifications.notifyUser).toHaveBeenCalledWith("user-1", "player_adjusted", {
      seasonId: "season-1",
      seasonSlug: "run-1",
      seasonTitle: "Run 1",
      seasonPlayerId: "sp-1",
    });
  });

  it("can set status alone and passes an empty patch through", async () => {
    playerRepo.getSeasonPlayerById.mockResolvedValue(seasonPlayer({ playerId: "user-2", seasonId: "season-2" }));

    await adminAdjustPlayer({ seasonPlayerId: "sp-1", status: "eliminated", reason: "afk" });
    expect(playerRepo.updateSeasonPlayer).toHaveBeenCalledWith("sp-1", { status: "eliminated" });

    await adminAdjustPlayer({ seasonPlayerId: "sp-1", reason: "noop" });
    expect(playerRepo.updateSeasonPlayer).toHaveBeenLastCalledWith("sp-1", {});
    expect(notifications.notifyUser).toHaveBeenLastCalledWith("user-2", "player_adjusted", {
      seasonId: "season-2",
      seasonSlug: "run-1",
      seasonTitle: "Run 1",
      seasonPlayerId: "sp-1",
    });
  });

  it("swallows a notification failure after the write", async () => {
    playerRepo.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    notifications.notifyUser.mockRejectedValue(new Error("socket down"));

    await expect(
      adminAdjustPlayer({ seasonPlayerId: "sp-1", position: 1, reason: "x" }),
    ).resolves.toBeUndefined();
    expect(logger.log.error).toHaveBeenCalledWith("notifications.player_adjusted.failed", expect.anything());
  });
});
