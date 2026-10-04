/**
 * Branch coverage for `executeAdminCommand`: every command family and outcome
 * the base suite leaves out (seasons reset/roster, player add/remove/adjust,
 * catalog blacklist/delete, the whole bot lifecycle, notify season/staff,
 * system overview/sockets/moderation), plus resolution fallbacks and the
 * domain-error pass-through.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/db/health", () => ({ isDbAvailable: vi.fn() }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/config/env", () => ({ getEnv: vi.fn(() => ({})) }));
vi.mock("@/lib/realtime/bus", () => ({ publish: vi.fn() }));
vi.mock("@/lib/realtime/metrics", () => ({ snapshotRealtimeMetrics: vi.fn() }));
vi.mock("@/lib/realtime/state", () => ({ isRealtimeAttached: vi.fn() }));
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
import { isDbAvailable } from "@/lib/infrastructure/db/health";
import { getEnv } from "@/lib/config/env";
import { snapshotRealtimeMetrics } from "@/lib/realtime/metrics";
import { isRealtimeAttached } from "@/lib/realtime/state";
import { createChatMessage } from "@/lib/modules/chat/repository";
import {
  cleanupBotRun,
  createBotRun,
  pauseBotRun,
  restartBotRun,
  resumeBotRun,
  stopBotRun,
  tickBotRun,
} from "@/lib/modules/bots/service";
import { getBotRun, listAllBotRuns, listBotLogs } from "@/lib/modules/bots/repository";
import { countUnread } from "@/lib/modules/notifications/repository";
import { getSiteSettings } from "@/lib/modules/site-settings/repository/site-settings";
import {
  deleteCatalogGame,
  getGameById,
  listCatalogGames,
  listPendingCompletionRequests,
  listPendingRerollRequests,
  setGameBlacklisted,
} from "@/lib/modules/catalog/repository";
import { countPendingEventSubmissions } from "@/lib/modules/iee/repository";
import { notifySeasonParticipants, notifyStaff } from "@/lib/modules/notifications/service";
import { adminSetUserBlocked, adminVerifyEmail, listUsers } from "@/lib/modules/player/service/admin";
import { getLeaderboard, getSeasonPlayerForUser } from "@/lib/modules/season/repository/players";
import { getSeasonById, getSeasonBySlug, listSeasons } from "@/lib/modules/season/repository/seasons";
import { adminAddPlayer, adminAdjustPlayer, adminRemovePlayer } from "@/lib/modules/season/service/players";
import { changeSeasonStatus, resetSeason } from "@/lib/modules/season/service/seasons";
import { AdminError } from "@/lib/modules/season/service/errors";
import { DEFAULT_BOT_RUN_CONFIG, type BotRun, type CatalogGame, type Season } from "@/db/schema";
import type { AdminUserRow } from "@/lib/modules/player/service/admin";

import { executeAdminCommand } from "./execute";

const mocks = {
  getCurrentUser: vi.mocked(getCurrentUser),
  isDbAvailable: vi.mocked(isDbAvailable),
  getEnv: vi.mocked(getEnv),
  snapshotRealtimeMetrics: vi.mocked(snapshotRealtimeMetrics),
  isRealtimeAttached: vi.mocked(isRealtimeAttached),
  createChatMessage: vi.mocked(createChatMessage),
  cleanupBotRun: vi.mocked(cleanupBotRun),
  createBotRun: vi.mocked(createBotRun),
  pauseBotRun: vi.mocked(pauseBotRun),
  restartBotRun: vi.mocked(restartBotRun),
  resumeBotRun: vi.mocked(resumeBotRun),
  stopBotRun: vi.mocked(stopBotRun),
  tickBotRun: vi.mocked(tickBotRun),
  getBotRun: vi.mocked(getBotRun),
  listAllBotRuns: vi.mocked(listAllBotRuns),
  listBotLogs: vi.mocked(listBotLogs),
  countUnread: vi.mocked(countUnread),
  getSiteSettings: vi.mocked(getSiteSettings),
  deleteCatalogGame: vi.mocked(deleteCatalogGame),
  getGameById: vi.mocked(getGameById),
  listCatalogGames: vi.mocked(listCatalogGames),
  listPendingCompletionRequests: vi.mocked(listPendingCompletionRequests),
  listPendingRerollRequests: vi.mocked(listPendingRerollRequests),
  setGameBlacklisted: vi.mocked(setGameBlacklisted),
  countPendingEventSubmissions: vi.mocked(countPendingEventSubmissions),
  notifySeasonParticipants: vi.mocked(notifySeasonParticipants),
  notifyStaff: vi.mocked(notifyStaff),
  adminSetUserBlocked: vi.mocked(adminSetUserBlocked),
  adminVerifyEmail: vi.mocked(adminVerifyEmail),
  listUsers: vi.mocked(listUsers),
  getLeaderboard: vi.mocked(getLeaderboard),
  getSeasonPlayerForUser: vi.mocked(getSeasonPlayerForUser),
  getSeasonById: vi.mocked(getSeasonById),
  getSeasonBySlug: vi.mocked(getSeasonBySlug),
  listSeasons: vi.mocked(listSeasons),
  adminAddPlayer: vi.mocked(adminAddPlayer),
  adminAdjustPlayer: vi.mocked(adminAdjustPlayer),
  adminRemovePlayer: vi.mocked(adminRemovePlayer),
  changeSeasonStatus: vi.mocked(changeSeasonStatus),
  resetSeason: vi.mocked(resetSeason),
};

const METRICS = {
  connections: 0,
  disconnects: 0,
  joins: 0,
  joinDenied: 0,
  leaves: 0,
  published: 0,
  presenceUpdates: 0,
  typingRelayed: 0,
  typingDropped: 0,
};

function season(overrides: Partial<Season> = {}): Season {
  return { id: "s1", slug: "run-1", title: "Run 1", status: "active", ...overrides } as Season;
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

const BOT_ID = "12345678-1111-2222-3333-444444444444";

function botRun(overrides: Partial<BotRun> = {}): BotRun {
  return {
    id: BOT_ID,
    seasonId: "s1",
    status: "running",
    config: { ...DEFAULT_BOT_RUN_CONFIG },
    totalTicks: 3,
    totalActions: 6,
    totalErrors: 1,
    lastError: null,
    createdById: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as BotRun;
}

function botRow(overrides: Partial<BotRun> = {}, seasonTitle = "Run 1", seasonSlug = "run-1") {
  return { run: botRun(overrides), seasonTitle, seasonSlug };
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
  mocks.listAllBotRuns.mockResolvedValue([]);
  mocks.listBotLogs.mockResolvedValue([]);
  mocks.countUnread.mockResolvedValue(0);
  mocks.snapshotRealtimeMetrics.mockReturnValue(METRICS);
  mocks.isRealtimeAttached.mockReturnValue(false);
  mocks.isDbAvailable.mockResolvedValue(true);
  mocks.getEnv.mockReturnValue({} as never);
  mocks.getSiteSettings.mockResolvedValue({
    rawgApiKey: "",
    igdbClientId: "",
    steamApiKey: "",
    gamespotApiKey: "",
    registrationEnabled: true,
    registrationMode: "open",
    maintenanceMode: false,
  } as never);
});

describe("command framing", () => {
  it.each(["open board", "help", "clear"])("treats the client-only command %j as unknown", async (input) => {
    expect(await executeAdminCommand(input)).toEqual({
      ok: false,
      code: "unknownCommand",
      params: { input },
    });
  });

  it("names the first missing required argument of a multi-arg command", async () => {
    expect(await executeAdminCommand("player add run-1")).toEqual({
      ok: false,
      code: "missingArg",
      params: { arg: "user" },
    });
  });

  it("runs a command whose only arguments are optional", async () => {
    mocks.listCatalogGames.mockResolvedValue([game()]);
    const outcome = await executeAdminCommand("games");
    expect(outcome).toMatchObject({ ok: true, code: "gameList", params: { count: 1, query: "" } });
  });

  it("lets domain errors escape for the action layer to translate", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.changeSeasonStatus.mockRejectedValue(new AdminError("adminSeasonNotFound"));
    await expect(executeAdminCommand("season status run-1 active")).rejects.toBeInstanceOf(AdminError);
  });
});

describe("season management", () => {
  it("resets a season and asks the page to refresh", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    const outcome = await executeAdminCommand("season reset run-1");
    expect(outcome).toMatchObject({ ok: true, code: "seasonReset", params: { title: "Run 1" }, refresh: true });
    expect(mocks.resetSeason).toHaveBeenCalledWith("s1");
  });

  it("maps the roster, falling back to the username when there is no display name", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.getLeaderboard.mockResolvedValue([
      { playerId: "p1", username: "a", displayName: null, position: 1, balancePoints: 10, status: "active" },
      { playerId: "p2", username: "b", displayName: "Bee", position: 2, balancePoints: 4, status: "eliminated" },
    ] as never);
    const outcome = await executeAdminCommand("season roster run-1");
    expect(outcome).toMatchObject({ ok: true, code: "seasonRoster", params: { title: "Run 1", count: 2 } });
    expect(outcome.rows?.[0]).toMatchObject({ text: "a", href: "/admin/users/p1" });
    expect(outcome.rows?.[0]?.hint).toContain("pos 1");
    expect(outcome.rows?.[1]?.text).toBe("Bee");
  });

  it("resolves a season by id when the slug lookup misses", async () => {
    mocks.getSeasonById.mockResolvedValue(season({ status: "finished" }));
    const outcome = await executeAdminCommand("season status 12345678-1111-2222-3333-444444444444 paused");
    expect(outcome).toMatchObject({ ok: true, code: "seasonStatusChanged", params: { status: "paused" } });
  });

  it("falls through to a not-found when a UUID matches no season either", async () => {
    const outcome = await executeAdminCommand("season 12345678-1111-2222-3333-444444444444");
    expect(outcome).toEqual({
      ok: false,
      code: "seasonNotFound",
      params: { ref: "12345678-1111-2222-3333-444444444444" },
    });
  });
});

describe("player management", () => {
  it("adds a user to a season", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.listUsers.mockResolvedValue([user()]);
    const outcome = await executeAdminCommand("player add run-1 alice");
    expect(outcome).toMatchObject({ ok: true, code: "playerAdded", params: { user: "alice", season: "Run 1" } });
    expect(mocks.adminAddPlayer).toHaveBeenCalledWith("s1", "u1");
  });

  it("removes a user from a season", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.listUsers.mockResolvedValue([user()]);
    const outcome = await executeAdminCommand("player remove run-1 alice");
    expect(outcome).toMatchObject({ ok: true, code: "playerRemoved" });
    expect(mocks.adminRemovePlayer).toHaveBeenCalledWith("s1", "u1");
  });

  it("sets a board position through the shared adjust use-case", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.listUsers.mockResolvedValue([user()]);
    mocks.getSeasonPlayerForUser.mockResolvedValue({ id: "sp1" } as never);
    const outcome = await executeAdminCommand("player position run-1 alice 4");
    expect(outcome).toMatchObject({ ok: true, code: "playerPositionSet", params: { user: "alice", value: 4 } });
    expect(mocks.adminAdjustPlayer).toHaveBeenCalledWith({
      seasonPlayerId: "sp1",
      position: 4,
      reason: "admin console",
    });
  });

  it("sets balance points through the same use-case", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.listUsers.mockResolvedValue([user()]);
    mocks.getSeasonPlayerForUser.mockResolvedValue({ id: "sp1" } as never);
    const outcome = await executeAdminCommand("player points run-1 alice 12");
    expect(outcome).toMatchObject({ ok: true, code: "playerPointsSet" });
    expect(mocks.adminAdjustPlayer).toHaveBeenCalledWith({
      seasonPlayerId: "sp1",
      balancePoints: 12,
      reason: "admin console",
    });
  });

  it("applies a valid player status", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.listUsers.mockResolvedValue([user()]);
    mocks.getSeasonPlayerForUser.mockResolvedValue({ id: "sp1" } as never);
    const outcome = await executeAdminCommand("player status run-1 alice eliminated");
    expect(outcome).toMatchObject({ ok: true, code: "playerStatusSet", params: { status: "eliminated" } });
    expect(mocks.adminAdjustPlayer).toHaveBeenCalledWith({
      seasonPlayerId: "sp1",
      status: "eliminated",
      reason: "admin console",
    });
  });

  it("rejects an out-of-contract player status", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.listUsers.mockResolvedValue([user()]);
    const outcome = await executeAdminCommand("player status run-1 alice sleepy");
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("invalidArg");
    expect(outcome.params).toMatchObject({ arg: "status", value: "sleepy" });
  });

  it("maps the off toggle to an unblock", async () => {
    mocks.listUsers.mockResolvedValue([user()]);
    const outcome = await executeAdminCommand("player block alice off");
    expect(outcome).toMatchObject({ ok: true, code: "playerUnblocked" });
    expect(mocks.adminSetUserBlocked).toHaveBeenCalledWith("u1", false);
  });

  it("verifies an email and asks for a refresh", async () => {
    mocks.listUsers.mockResolvedValue([user()]);
    const outcome = await executeAdminCommand("player verify alice");
    expect(outcome).toMatchObject({ ok: true, code: "playerVerified", refresh: true });
    expect(mocks.adminVerifyEmail).toHaveBeenCalledWith("u1");
  });

  it("renders account details, using an em dash for a missing email", async () => {
    mocks.listUsers.mockResolvedValue([user({ email: null, role: "judge", isBlocked: true })]);
    const outcome = await executeAdminCommand("user alice");
    expect(outcome).toMatchObject({ ok: true, code: "userInfo", params: { user: "alice" } });
    expect(outcome.rows?.[0]?.hint).toBe("—");
    const texts = outcome.rows?.map((row) => row.text);
    expect(texts).toContain("role: judge");
    expect(texts).toContain("blocked: yes");
    expect(texts).toContain("created: 2026-01-01");
  });

  it("prefers an exact email match over a username prefix", async () => {
    mocks.listUsers.mockResolvedValue([
      user({ id: "u1", username: "alice2", email: "other@example.com" }),
      user({ id: "u2", username: "bob", email: "alice@example.com" }),
    ]);
    const outcome = await executeAdminCommand("user alice@example.com");
    expect(outcome).toMatchObject({ ok: true, code: "userInfo", params: { user: "bob" } });
  });

  it("takes the only fuzzy row when no field matches exactly", async () => {
    mocks.listUsers.mockResolvedValue([user({ id: "u9", username: "carol" })]);
    const outcome = await executeAdminCommand("user car");
    expect(outcome).toMatchObject({ ok: true, params: { user: "carol" } });
  });

  it("reports an ambiguous user match", async () => {
    mocks.listUsers.mockResolvedValue([user({ id: "u1" }), user({ id: "u2", username: "alicia" })]);
    const outcome = await executeAdminCommand("user ali");
    expect(outcome).toEqual({ ok: false, code: "userAmbiguous", params: { ref: "ali", count: 2 } });
  });

  it("reports a user that does not exist", async () => {
    expect(await executeAdminCommand("user nobody")).toEqual({
      ok: false,
      code: "userNotFound",
      params: { ref: "nobody" },
    });
  });
});

describe("catalog management", () => {
  it("lists the whole catalog with a truncation count for the shown page", async () => {
    const all = Array.from({ length: 30 }, (_, i) => game({ id: `g${i}`, title: `Game ${i}` }));
    all[0] = game({ id: "g0", title: "Game 0", isBlacklisted: true });
    mocks.listCatalogGames.mockResolvedValue(all);
    const outcome = await executeAdminCommand("games");
    expect(outcome).toMatchObject({ ok: true, code: "gameList", params: { count: 30, shown: 25 } });
    expect(outcome.rows).toHaveLength(25);
    expect(outcome.rows?.[0]?.hint).toContain("blacklisted");
  });

  it("blacklists a game by exact title", async () => {
    mocks.listCatalogGames.mockResolvedValue([game(), game({ id: "g2", title: "Celeste" })]);
    const outcome = await executeAdminCommand('game blacklist "Hotline Miami" on');
    expect(outcome).toMatchObject({ ok: true, code: "gameBlacklisted", params: { game: "Hotline Miami" } });
    expect(mocks.setGameBlacklisted).toHaveBeenCalledWith("g1", true);
  });

  it("restores a blacklisted game", async () => {
    mocks.listCatalogGames.mockResolvedValue([game({ isBlacklisted: true })]);
    const outcome = await executeAdminCommand("game blacklist \"Hotline Miami\" off");
    expect(outcome).toMatchObject({ ok: true, code: "gameUnblacklisted" });
    expect(mocks.setGameBlacklisted).toHaveBeenCalledWith("g1", false);
  });

  it("resolves a game by id when the reference is a UUID", async () => {
    mocks.getGameById.mockResolvedValue(game({ id: "12345678-1111-2222-3333-444444444444" }));
    const outcome = await executeAdminCommand("game delete 12345678-1111-2222-3333-444444444444");
    expect(outcome).toMatchObject({ ok: true, code: "gameDeleted", params: { game: "Hotline Miami" } });
    expect(mocks.deleteCatalogGame).toHaveBeenCalledWith("12345678-1111-2222-3333-444444444444");
  });

  it("prefers an exact title over longer partial matches", async () => {
    mocks.listCatalogGames.mockResolvedValue([game({ title: "Celeste 2" }), game({ id: "g2", title: "Celeste" })]);
    const outcome = await executeAdminCommand("game delete celeste");
    expect(outcome).toMatchObject({ ok: true, params: { game: "Celeste" } });
    expect(mocks.deleteCatalogGame).toHaveBeenCalledWith("g2");
  });

  it("reports a game that matches nothing", async () => {
    expect(await executeAdminCommand("game delete nope")).toEqual({
      ok: false,
      code: "gameNotFound",
      params: { ref: "nope" },
    });
  });

  it("reports an ambiguous game match with the candidate count", async () => {
    mocks.listCatalogGames.mockResolvedValue([
      game({ id: "g1", title: "Celeste" }),
      game({ id: "g2", title: "Celeste 2" }),
    ]);
    const outcome = await executeAdminCommand("game delete cel");
    expect(outcome).toEqual({ ok: false, code: "gameAmbiguous", params: { ref: "cel", count: 2 } });
  });
});

describe("bot runs", () => {
  it("lists every run, or only the runs of a named season", async () => {
    mocks.listAllBotRuns.mockResolvedValue([
      botRow({ id: `${"a".repeat(8)}-0000-0000-0000-000000000000` }, "Run 1", "run-1"),
      botRow({ id: `${"b".repeat(8)}-0000-0000-0000-000000000000`, seasonId: "s2" }, "Run 2", "run-2"),
    ]);
    const all = await executeAdminCommand("bots");
    expect(all).toMatchObject({ ok: true, code: "botsList", params: { count: 2 } });
    expect(all.rows?.[0]?.text).toContain("#aaaaaaaa");

    mocks.getSeasonBySlug.mockResolvedValue(season());
    const filtered = await executeAdminCommand("bots run-1");
    expect(filtered).toMatchObject({ ok: true, params: { count: 1 } });
  });

  it("propagates an unknown season filter as a console error", async () => {
    const outcome = await executeAdminCommand("bots ghost");
    expect(outcome).toEqual({ ok: false, code: "seasonNotFound", params: { ref: "ghost" } });
  });

  it("renders the run detail including the last error and season lookup", async () => {
    mocks.getBotRun.mockResolvedValue(
      botRun({ lastError: "boom", config: { ...DEFAULT_BOT_RUN_CONFIG, botCount: 7 } }),
    );
    mocks.getSeasonById.mockResolvedValue(season());
    const outcome = await executeAdminCommand(`bot ${BOT_ID}`);
    expect(outcome).toMatchObject({ ok: true, code: "botInfo", params: { id: "12345678" } });
    const texts = outcome.rows?.map((row) => row.text) ?? [];
    expect(texts).toContain("season: Run 1");
    expect(texts).toContain("bots: 7 · per tick: 2 · interval: 2000ms");
    expect(texts).toContain("last error: boom");
  });

  it("falls back to the season id when the season row is gone", async () => {
    mocks.getBotRun.mockResolvedValue(botRun());
    mocks.getSeasonById.mockResolvedValue(null);
    const outcome = await executeAdminCommand(`bot ${BOT_ID}`);
    expect(outcome.rows?.some((row) => row.text === "season: s1")).toBe(true);
  });

  it("resolves a run by its 8-char display prefix", async () => {
    mocks.listAllBotRuns.mockResolvedValue([botRow()]);
    mocks.getSeasonById.mockResolvedValue(season());
    const outcome = await executeAdminCommand("bot 12345678");
    expect(outcome).toMatchObject({ ok: true, code: "botInfo" });
  });

  it("rejects an ambiguous prefix", async () => {
    const other = `12345678-9999-0000-0000-000000000000`;
    mocks.listAllBotRuns.mockResolvedValue([botRow(), botRow({ id: other })]);
    const outcome = await executeAdminCommand("bot 12345678");
    expect(outcome).toEqual({ ok: false, code: "botAmbiguous", params: { ref: "12345678", count: 2 } });
  });

  it("resolves a run by season title", async () => {
    mocks.listAllBotRuns.mockResolvedValue([botRow()]);
    mocks.getSeasonById.mockResolvedValue(season());
    const outcome = await executeAdminCommand('bot "run 1"');
    expect(outcome).toMatchObject({ ok: true, code: "botInfo" });
  });

  it("reports a run that does not exist", async () => {
    expect(await executeAdminCommand("bot deadbeef")).toEqual({
      ok: false,
      code: "botNotFound",
      params: { ref: "deadbeef" },
    });
  });

  it("rejects a non-numeric bot size instead of silently defaulting", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    const outcome = await executeAdminCommand("bot create run-1 abc");
    expect(outcome).toEqual({ ok: false, code: "invalidNumber", params: { arg: "value", value: "abc" } });
    expect(mocks.createBotRun).not.toHaveBeenCalled();
  });

  it("floors fractional sizes and clamps them to the lower bound", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    mocks.createBotRun.mockResolvedValue(botRun());
    await executeAdminCommand("bot create run-1 0 0.9");
    const config = mocks.createBotRun.mock.calls[0]![1];
    expect(config.botCount).toBe(1);
    expect(config.actionsPerTick).toBe(1);
  });

  it.each([
    ["bot start", "botStarted", mocks.resumeBotRun],
    ["bot pause", "botPaused", mocks.pauseBotRun],
    ["bot stop", "botStopped", mocks.stopBotRun],
    ["bot restart", "botRestarted", mocks.restartBotRun],
  ] as const)("%s drives the lifecycle use-case", async (input, code, fn) => {
    mocks.getBotRun.mockResolvedValue(botRun());
    const outcome = await executeAdminCommand(`${input} ${BOT_ID}`);
    expect(outcome).toMatchObject({ ok: true, code, params: { id: "12345678" }, refresh: true });
    expect(fn).toHaveBeenCalledWith(BOT_ID);
  });

  it("aggregates several ticks and surfaces the last error", async () => {
    mocks.getBotRun.mockResolvedValue(botRun());
    mocks.tickBotRun
      .mockResolvedValueOnce({ actions: 3, errors: 0, stopped: false, lastError: null })
      .mockResolvedValueOnce({ actions: 1, errors: 2, stopped: false, lastError: "kaboom" });
    const outcome = await executeAdminCommand(`bot tick ${BOT_ID} 2`);
    expect(outcome).toMatchObject({
      ok: true,
      code: "botTicked",
      params: { count: 2, actions: 4, errors: 2 },
      refresh: true,
    });
    expect(outcome.rows?.[0]?.text).toBe("last error: kaboom");
  });

  it("stops ticking early when the run reports itself stopped", async () => {
    mocks.getBotRun.mockResolvedValue(botRun());
    mocks.tickBotRun.mockResolvedValueOnce({ actions: 2, errors: 0, stopped: true, lastError: null });
    const outcome = await executeAdminCommand(`bot tick ${BOT_ID} 5`);
    expect(outcome).toMatchObject({ ok: true, params: { count: 1 } });
    expect(mocks.tickBotRun).toHaveBeenCalledTimes(1);
    expect(outcome.rows).toEqual([]);
  });

  it("rejects a non-numeric tick count", async () => {
    mocks.getBotRun.mockResolvedValue(botRun());
    const outcome = await executeAdminCommand(`bot tick ${BOT_ID} many`);
    expect(outcome).toEqual({ ok: false, code: "invalidNumber", params: { arg: "value", value: "many" } });
  });

  it("defaults the log page size and clamps extreme values", async () => {
    mocks.getBotRun.mockResolvedValue(botRun());
    await executeAdminCommand(`bot logs ${BOT_ID}`);
    expect(mocks.listBotLogs).toHaveBeenLastCalledWith(BOT_ID, 20);
    await executeAdminCommand(`bot logs ${BOT_ID} 999`);
    expect(mocks.listBotLogs).toHaveBeenLastCalledWith(BOT_ID, 200);
    await executeAdminCommand(`bot logs ${BOT_ID} 0`);
    expect(mocks.listBotLogs).toHaveBeenLastCalledWith(BOT_ID, 1);
  });

  it("cleans up a run and reports how many bot players were removed", async () => {
    mocks.getBotRun.mockResolvedValue(botRun());
    mocks.cleanupBotRun.mockResolvedValue({ removedPlayers: 4 });
    const outcome = await executeAdminCommand(`bot cleanup ${BOT_ID}`);
    expect(outcome).toMatchObject({
      ok: true,
      code: "botCleaned",
      params: { players: 4, id: "12345678" },
      refresh: true,
    });
    expect(mocks.cleanupBotRun).toHaveBeenCalledWith(BOT_ID, true);
  });
});

describe("chat and broadcast notifications", () => {
  it("rethrows an unexpected chat failure", async () => {
    mocks.createChatMessage.mockRejectedValue(new Error("BOOM"));
    await expect(executeAdminCommand("say hi")).rejects.toThrow("BOOM");
  });

  it.each(["EMPTY_CONTENT", "CONTENT_TOO_LONG"])(
    "translates the %s chat rejection into a text error",
    async (code) => {
      mocks.createChatMessage.mockRejectedValue(new Error(code));
      expect(await executeAdminCommand("say hi")).toEqual({
        ok: false,
        code: "textRequired",
        params: { arg: "text" },
      });
    },
  );

  it("notifies every participant of a season and stamps the season identity", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    const outcome = await executeAdminCommand("notify season run-1 maintenance tonight");
    expect(outcome).toMatchObject({ ok: true, code: "notifiedSeason", params: { season: "Run 1" } });
    expect(mocks.notifySeasonParticipants).toHaveBeenCalledWith(
      "s1",
      "admin_broadcast",
      expect.objectContaining({
        params: { note: "maintenance tonight" },
        data: expect.objectContaining({ note: "maintenance tonight", seasonId: "s1", seasonSlug: "run-1" }),
      }),
    );
  });

  it("refuses a season notice with no text", async () => {
    mocks.getSeasonBySlug.mockResolvedValue(season());
    const outcome = await executeAdminCommand('notify season run-1 "  "');
    expect(outcome).toEqual({ ok: false, code: "textRequired", params: { arg: "text" } });
    expect(mocks.notifySeasonParticipants).not.toHaveBeenCalled();
  });

  it("notifies every staff member", async () => {
    const outcome = await executeAdminCommand("notify staff heads up");
    expect(outcome).toEqual({ ok: true, code: "notifiedStaff" });
    expect(mocks.notifyStaff).toHaveBeenCalledWith(
      "admin_broadcast",
      expect.objectContaining({ params: { note: "heads up" } }),
    );
  });

  it("refuses a staff notice with no text", async () => {
    expect(await executeAdminCommand('notify staff ""')).toEqual({
      ok: false,
      code: "textRequired",
      params: { arg: "text" },
    });
    expect(mocks.notifyStaff).not.toHaveBeenCalled();
  });
});

describe("system and moderation diagnostics", () => {
  it("reports the sockets section with the live attachment state", async () => {
    mocks.isRealtimeAttached.mockReturnValue(true);
    mocks.snapshotRealtimeMetrics.mockReturnValue({ ...METRICS, connections: 2, published: 9 });
    const outcome = await executeAdminCommand("system sockets");
    expect(outcome).toMatchObject({ ok: true, code: "systemSockets", params: { state: "on" } });
    expect(outcome.rows?.[0]?.text).toBe("sockets: attached");
    expect(outcome.rows?.some((row) => row.text === "connections: 2 · disconnects: 0")).toBe(true);
  });

  it("assembles the overview from the live sources", async () => {
    mocks.isDbAvailable.mockResolvedValue(false);
    mocks.listUsers.mockResolvedValue([user()]);
    mocks.listSeasons.mockResolvedValue([season(), season({ id: "s2", slug: "run-2", title: "Run 2" })]);
    mocks.listCatalogGames.mockResolvedValue([game()]);
    mocks.listAllBotRuns.mockResolvedValue([botRow(), botRow({ id: `${"c".repeat(8)}-0000-0000-0000-000000000000`, status: "paused" })]);
    mocks.countUnread.mockResolvedValue(3);
    mocks.getEnv.mockReturnValue({ RAWG_API_KEY: "key" } as never);
    const outcome = await executeAdminCommand("system");
    expect(outcome).toMatchObject({ ok: true, code: "systemOverview" });
    const texts = outcome.rows?.map((row) => row.text) ?? [];
    expect(texts).toContain("database: down");
    expect(texts).toContain("counts: 1 users · 2 seasons · 1 games");
    expect(texts).toContain("bot runs: 2 total · 1 running");
    expect(texts.some((line) => line.includes("rawg ✓") && line.includes("igdb —"))).toBe(true);
  });

  it("rejects an unknown system section and names the allowed values", async () => {
    const outcome = await executeAdminCommand("system nonsense");
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("invalidArg");
    expect(outcome.params).toMatchObject({ arg: "section", value: "nonsense" });
    expect(String(outcome.params?.options)).toContain("overview");
  });

  it("summarises the pending moderation queues", async () => {
    mocks.listPendingRerollRequests.mockResolvedValue([{}, {}] as never);
    mocks.listPendingCompletionRequests.mockResolvedValue([{}] as never);
    mocks.countPendingEventSubmissions.mockResolvedValue(5);
    const outcome = await executeAdminCommand("moderation");
    expect(outcome).toMatchObject({
      ok: true,
      code: "moderationSummary",
      params: { rerolls: 2, completions: 1, events: 5 },
    });
    expect(outcome.rows).toHaveLength(3);
  });
});
