import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/db/health", () => ({ isDbAvailable: vi.fn() }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/config/env", () => ({ getEnv: vi.fn(() => ({})) }));
vi.mock("@/lib/realtime/bus", () => ({ publish: vi.fn() }));
vi.mock("@/lib/realtime/metrics", () => ({
  snapshotRealtimeMetrics: vi.fn(() => ({
    connections: 0,
    disconnects: 0,
    joins: 0,
    joinDenied: 0,
    leaves: 0,
    published: 0,
    presenceUpdates: 0,
    typingRelayed: 0,
    typingDropped: 0,
  })),
}));
vi.mock("@/lib/realtime/state", () => ({ isRealtimeAttached: vi.fn(() => false) }));
vi.mock("@/lib/modules/chat/repository", () => ({ createChatMessage: vi.fn() }));
vi.mock("@/lib/modules/bots/service", () => ({
  cleanupBotRun: vi.fn(),
  createBotRun: vi.fn(),
  pauseBotRun: vi.fn(),
  restartBotRun: vi.fn(),
  resumeBotRun: vi.fn(),
  stopBotRun: vi.fn(),
  tickBotRun: vi.fn(),
}));
vi.mock("@/lib/modules/bots/repository", () => ({
  getBotRun: vi.fn(),
  listAllBotRuns: vi.fn(),
  listBotLogs: vi.fn(),
}));
vi.mock("@/lib/modules/notifications/repository", () => ({ countUnread: vi.fn() }));
vi.mock("@/lib/modules/site-settings/repository/site-settings", () => ({ getSiteSettings: vi.fn() }));
vi.mock("@/lib/modules/catalog/repository", () => ({
  deleteCatalogGame: vi.fn(),
  getGameById: vi.fn(),
  listCatalogGames: vi.fn(),
  listPendingCompletionRequests: vi.fn(),
  listPendingRerollRequests: vi.fn(),
  setGameBlacklisted: vi.fn(),
}));
vi.mock("@/lib/modules/iee/repository", () => ({ countPendingEventSubmissions: vi.fn() }));
vi.mock("@/lib/modules/notifications/service", () => ({
  notifySeasonParticipants: vi.fn(),
  notifyStaff: vi.fn(),
  notifyUser: vi.fn(),
}));
vi.mock("@/lib/modules/player/service/admin", () => ({
  adminSetUserBlocked: vi.fn(),
  adminVerifyEmail: vi.fn(),
  listUsers: vi.fn(),
}));
vi.mock("@/lib/modules/season/repository/players", () => ({
  getLeaderboard: vi.fn(),
  getSeasonPlayerForUser: vi.fn(),
}));
vi.mock("@/lib/modules/season/repository/seasons", () => ({
  getSeasonById: vi.fn(),
  getSeasonBySlug: vi.fn(),
  listSeasons: vi.fn(),
}));
vi.mock("@/lib/modules/season/service/players", () => ({
  adminAddPlayer: vi.fn(),
  adminAdjustPlayer: vi.fn(),
  adminRemovePlayer: vi.fn(),
}));
vi.mock("@/lib/modules/season/service/seasons", () => ({
  changeSeasonStatus: vi.fn(),
  resetSeason: vi.fn(),
}));

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { publish } from "@/lib/realtime/bus";
import { CHAT_ROOM } from "@/lib/realtime/protocol";
import { createChatMessage } from "@/lib/modules/chat/repository";
import { createBotRun } from "@/lib/modules/bots/service";
import { getBotRun, listBotLogs } from "@/lib/modules/bots/repository";
import { countUnread } from "@/lib/modules/notifications/repository";
import { listCatalogGames } from "@/lib/modules/catalog/repository";
import { notifyUser } from "@/lib/modules/notifications/service";
import { adminSetUserBlocked, listUsers } from "@/lib/modules/player/service/admin";
import { getLeaderboard, getSeasonPlayerForUser } from "@/lib/modules/season/repository/players";
import { getSeasonBySlug, listSeasons } from "@/lib/modules/season/repository/seasons";
import { changeSeasonStatus } from "@/lib/modules/season/service/seasons";
import type { AdminUserRow } from "@/lib/modules/player/service/admin";
import type { BotRun, CatalogGame, Season } from "@/db/schema";

import { AdminError } from "@/lib/modules/season/service/errors";
import { executeAdminCommand } from "./execute";

const mocks = {
  getCurrentUser: vi.mocked(getCurrentUser),
  publish: vi.mocked(publish),
  createChatMessage: vi.mocked(createChatMessage),
  createBotRun: vi.mocked(createBotRun),
  getBotRun: vi.mocked(getBotRun),
  listBotLogs: vi.mocked(listBotLogs),
  countUnread: vi.mocked(countUnread),
  listCatalogGames: vi.mocked(listCatalogGames),
  notifyUser: vi.mocked(notifyUser),
  adminSetUserBlocked: vi.mocked(adminSetUserBlocked),
  listUsers: vi.mocked(listUsers),
  getLeaderboard: vi.mocked(getLeaderboard),
  getSeasonPlayerForUser: vi.mocked(getSeasonPlayerForUser),
  getSeasonBySlug: vi.mocked(getSeasonBySlug),
  listSeasons: vi.mocked(listSeasons),
  changeSeasonStatus: vi.mocked(changeSeasonStatus),
};

function season(overrides: Partial<Season> = {}): Season {
  return {
    id: "s1",
    slug: "run-1",
    title: "Run 1",
    status: "active",
    ...overrides,
  } as Season;
}

function user(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: "u1",
    email: "alice@example.com",
    username: "alice",
    displayName: "Alice",
    avatarUrl: null,
    role: "player",
    isBlocked: false,
    lastSeenAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function game(overrides: Partial<CatalogGame> = {}): CatalogGame {
  return { id: "g1", title: "Hotline Miami", platform: "PC", isBlacklisted: false, ...overrides } as CatalogGame;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue({
    id: "admin-1",
    username: "root",
    email: "root@example.com",
    role: "admin",
  } as never);
  mocks.listSeasons.mockResolvedValue([]);
  mocks.listCatalogGames.mockResolvedValue([]);
  mocks.listUsers.mockResolvedValue([]);
  mocks.getLeaderboard.mockResolvedValue([]);
  mocks.countUnread.mockResolvedValue(0);
});

describe("authorization and framing", () => {
  it("refuses an actor who is not an admin before parsing anything", async () => {
    mocks.getCurrentUser.mockResolvedValue(user({ role: "judge" }) as never);
    await expect(executeAdminCommand("whoami")).rejects.toBeInstanceOf(AdminError);
  });

  it("refuses an anonymous actor", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(executeAdminCommand("whoami")).rejects.toMatchObject({ code: "adminStaffRequired" });
  });

  it("reports an unknown command without running anything", async () => {
    const outcome = await executeAdminCommand("frobnicate");
    expect(outcome).toEqual({ ok: false, code: "unknownCommand", params: { input: "frobnicate" } });
  });

  it("reports the missing argument by name", async () => {
    const outcome = await executeAdminCommand("season");
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("missingArg");
    expect(outcome.params).toEqual({ arg: "season" });
  });

  it("answers whoami from the session without any repository read", async () => {
    const outcome = await executeAdminCommand("whoami");
    expect(outcome.ok).toBe(true);
    expect(outcome.code).toBe("whoami");
    expect(outcome.params).toEqual({ user: "root" });
    expect(outcome.rows?.[0]).toMatchObject({ text: "root", href: "/admin/users/admin-1" });
  });
});

describe("season resolution", () => {
  it("lists every season with a count", async () => {
    mocks.listSeasons.mockResolvedValue([season(), season({ id: "s2", slug: "run-2", title: "Run 2" })]);
    const outcome = await executeAdminCommand("seasons");
    expect(outcome).toMatchObject({ ok: true, code: "seasonList", params: { count: 2 } });
    expect(outcome.rows).toHaveLength(2);
  });

  it("resolves a season by slug and reports its roster size", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.getLeaderboard.mockResolvedValue([
      { playerId: "p1", username: "a", displayName: "A", position: 1, balancePoints: 10, status: "active" },
    ] as never);
    const outcome = await executeAdminCommand("season run-1");
    expect(outcome).toMatchObject({ ok: true, code: "seasonInfo" });
    expect(outcome.params).toMatchObject({ title: "Run 1", players: 1 });
  });

  it("falls back to a case-insensitive title match when no slug matches", async () => {
    mocks.listSeasons.mockResolvedValue([season({ slug: "other", title: "Summer Run" })]);
    const outcome = await executeAdminCommand("season summer");
    expect(outcome).toMatchObject({ ok: true, code: "seasonInfo" });
  });

  it("reports a season that does not exist", async () => {
    const outcome = await executeAdminCommand("season nope");
    expect(outcome).toEqual({ ok: false, code: "seasonNotFound", params: { ref: "nope" } });
  });

  it("reports an ambiguous season match with the candidate count", async () => {
    mocks.listSeasons.mockResolvedValue([
      season({ id: "s1", slug: "run-a", title: "Run Alpha" }),
      season({ id: "s2", slug: "run-b", title: "Run Beta" }),
    ]);
    const outcome = await executeAdminCommand("season run");
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("seasonAmbiguous");
    expect(outcome.params).toEqual({ ref: "run", count: 2 });
  });

  it("rejects an out-of-contract status and names the allowed values", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    const outcome = await executeAdminCommand("season status run-1 flying");
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("invalidArg");
    expect(outcome.params).toMatchObject({ arg: "status", value: "flying" });
    expect(String(outcome.params?.options)).toContain("active");
  });

  it("applies a valid status change and asks the page to refresh", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    const outcome = await executeAdminCommand("season status run-1 paused");
    expect(outcome).toMatchObject({ ok: true, code: "seasonStatusChanged", refresh: true });
    expect(mocks.changeSeasonStatus).toHaveBeenCalledWith("s1", "paused");
  });
});

describe("player commands", () => {
  it("resolves the user by exact username before a fuzzy match", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.listUsers.mockResolvedValue([user({ id: "u1", username: "alice" }), user({ id: "u2", username: "alice2" })]);
    const outcome = await executeAdminCommand("player verify alice");
    expect(outcome).toMatchObject({ ok: true, code: "playerVerified" });
  });

  it("rejects a non-numeric position", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.listUsers.mockResolvedValue([user()]);
    const outcome = await executeAdminCommand("player position run-1 alice nope");
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("invalidNumber");
    expect(outcome.params).toMatchObject({ value: "nope" });
  });

  it("reports a user who is not a member of the season", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.listUsers.mockResolvedValue([user()]);
    mocks.getSeasonPlayerForUser.mockResolvedValue(null);
    const outcome = await executeAdminCommand("player position run-1 alice 5");
    expect(outcome).toEqual({
      ok: false,
      code: "playerNotInSeason",
      params: { user: "alice", season: "Run 1" },
    });
  });

  it("maps the on toggle to a block and reports the new state", async () => {
    mocks.listUsers.mockResolvedValue([user()]);
    const outcome = await executeAdminCommand("player block alice on");
    expect(outcome).toMatchObject({ ok: true, code: "playerBlocked", refresh: true });
    expect(mocks.adminSetUserBlocked).toHaveBeenCalledWith("u1", true);
  });
});

describe("chat and notifications", () => {
  it("refuses a say with only whitespace", async () => {
    const outcome = await executeAdminCommand('say " "');
    expect(outcome).toEqual({ ok: false, code: "textRequired", params: { arg: "text" } });
    expect(mocks.createChatMessage).not.toHaveBeenCalled();
  });

  it("publishes a chat message to the global room", async () => {
    mocks.createChatMessage.mockResolvedValue({
      id: "m1",
      userId: "admin-1",
      content: "hello",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      username: "root",
      displayName: "Root",
      avatarUrl: null,
      role: "admin",
    });
    const outcome = await executeAdminCommand("say hello world");
    expect(outcome).toMatchObject({ ok: true, code: "chatPosted" });
    expect(mocks.publish).toHaveBeenCalledWith(CHAT_ROOM, "chat:message", expect.objectContaining({ content: "hello" }));
  });

  it("translates the rate-limit error code into a console outcome", async () => {
    mocks.createChatMessage.mockRejectedValue(new Error("RATE_LIMITED"));
    const outcome = await executeAdminCommand("say hi");
    expect(outcome).toEqual({ ok: false, code: "rateLimited" });
  });

  it("refuses a notify with empty text", async () => {
    mocks.listUsers.mockResolvedValue([user()]);
    const outcome = await executeAdminCommand('notify user alice ""');
    expect(outcome).toEqual({ ok: false, code: "textRequired", params: { arg: "text" } });
    expect(mocks.notifyUser).not.toHaveBeenCalled();
  });

  it("sends a personal notification with the free-text note", async () => {
    mocks.listUsers.mockResolvedValue([user()]);
    const outcome = await executeAdminCommand("notify user alice great work");
    expect(outcome).toMatchObject({ ok: true, code: "notifiedUser" });
    expect(mocks.notifyUser).toHaveBeenCalledWith(
      "u1",
      "admin_broadcast",
      expect.objectContaining({ params: { note: "great work" } }),
    );
  });
});

describe("bots and games", () => {
  it("clamps bot creation arguments into range", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.createBotRun.mockResolvedValue({ id: "12345678-0000-0000-0000-000000000000" } as BotRun);
    const outcome = await executeAdminCommand("bot create run-1 999 99");
    expect(outcome).toMatchObject({ ok: true, code: "botCreated" });
    const config = mocks.createBotRun.mock.calls[0]![1];
    expect(config.botCount).toBe(20);
    expect(config.actionsPerTick).toBe(10);
  });

  it("uses the schema defaults when bot creation omits the sizes", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.createBotRun.mockResolvedValue({ id: "12345678-0000-0000-0000-000000000000" } as BotRun);
    await executeAdminCommand("bot create run-1");
    const config = mocks.createBotRun.mock.calls[0]![1];
    expect(config.botCount).toBe(3);
    expect(config.actionsPerTick).toBe(2);
  });

  it("renders the bot log with the error marker only for error entries", async () => {
    mocks.getBotRun.mockResolvedValue({ id: "12345678-0000-0000-0000-000000000000" } as BotRun);
    mocks.listBotLogs.mockResolvedValue([
      { level: "error", action: "roll", botUsername: "bot_1", message: "boom" },
      { level: "info", action: "tick", botUsername: null, message: "ok" },
    ] as never);
    const outcome = await executeAdminCommand("bot logs 12345678-0000-0000-0000-000000000000");
    expect(outcome).toMatchObject({ ok: true, code: "botLogs", params: { count: 2 } });
    expect(outcome.rows?.[0]?.text).toContain("✗");
    expect(outcome.rows?.[1]?.text).not.toContain("✗");
  });

  it("filters the game list by a case-insensitive title query", async () => {
    mocks.listCatalogGames.mockResolvedValue([
      game({ id: "g1", title: "Hotline Miami" }),
      game({ id: "g2", title: "Celeste" }),
    ]);
    const outcome = await executeAdminCommand("games HOT");
    expect(outcome).toMatchObject({ ok: true, code: "gameList" });
    expect(outcome.params).toMatchObject({ count: 1, shown: 1 });
    expect(outcome.rows?.[0]?.text).toBe("Hotline Miami");
  });
});

describe("system diagnostics", () => {
  it("reports the notifications section with the actor's unread count", async () => {
    mocks.countUnread.mockResolvedValue(4);
    const outcome = await executeAdminCommand("system notifications");
    expect(outcome).toMatchObject({ ok: true, code: "systemNotifications" });
    expect(outcome.params).toMatchObject({ state: "database-only" });
    expect(outcome.rows?.some((row) => row.text === "unread (you): 4")).toBe(true);
  });
});
