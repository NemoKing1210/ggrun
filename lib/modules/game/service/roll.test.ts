import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameRoll, Season, SeasonPlayer, User } from "@/db/schema";
import type * as CatalogRepository from "@/lib/modules/catalog/repository";

import { rollNewGame } from "./roll";

/** Minimal thenable Drizzle stand-in that records writes and replays queued reads. */
const dbFake = vi.hoisted(() => {
  interface Chain {
    from(...args: unknown[]): Chain;
    where(...args: unknown[]): Chain;
    orderBy(...args: unknown[]): Chain;
    limit(...args: unknown[]): Chain;
    then(onFulfilled: (rows: unknown[]) => unknown): Promise<unknown>;
  }
  const selectResults: unknown[][] = [];
  function chain(resolve: () => unknown[]): Chain {
    const c: Chain = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      then: (onFulfilled) => Promise.resolve(resolve()).then(onFulfilled),
    };
    return c;
  }
  const db = { select: () => chain(() => selectResults.shift() ?? []) };
  return {
    db,
    selectResults,
    reset: () => {
      selectResults.length = 0;
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

const eventsInfra = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => eventsInfra);

const players = vi.hoisted(() => ({ getSeasonPlayerById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/players", () => players);

const seasons = vi.hoisted(() => ({ getSeasonById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => seasons);

const catalogRepo = vi.hoisted(() => ({
  createRoll: vi.fn(),
  pickGameForRoll: vi.fn(),
}));
vi.mock("@/lib/modules/catalog/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof CatalogRepository>()),
  ...catalogRepo,
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

function season(overrides: Partial<Season> = {}): Season {
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

function actor(id: string, role: string): User {
  return { id, role } as unknown as User;
}

beforeEach(() => {
  dbFake.reset();
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue(actor("user-1", "player"));
  session.isStaff.mockImplementation(
    (user: { role?: string } | null) => user?.role === "admin" || user?.role === "judge",
  );
  eventsInfra.logEvent.mockResolvedValue(undefined);
  players.getSeasonPlayerById.mockReset();
  seasons.getSeasonById.mockReset();
  catalogRepo.createRoll.mockReset();
  catalogRepo.pickGameForRoll.mockReset();
  seasons.getSeasonById.mockResolvedValue(season());
});

/** Queues the result of the single `getOpenRollRow` read. */
function openRoll(row: GameRoll | null): void {
  dbFake.selectResults.push(row ? [row] : []);
}

describe("rollNewGame", () => {
  it("refuses a participant that does not exist", async () => {
    players.getSeasonPlayerById.mockResolvedValue(null);
    await expect(rollNewGame("sp-404")).rejects.toMatchObject({ code: "gameParticipantNotFound" });
    expect(seasons.getSeasonById).not.toHaveBeenCalled();
  });

  it("refuses an actor who is neither the participant nor staff", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    session.getCurrentUser.mockResolvedValue(actor("intruder", "player"));
    await expect(rollNewGame("sp-1")).rejects.toMatchObject({ code: "gameNotAllowed" });
    expect(seasons.getSeasonById).not.toHaveBeenCalled();
    expect(catalogRepo.pickGameForRoll).not.toHaveBeenCalled();
  });

  it("allows staff to roll on a participant's behalf", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    session.getCurrentUser.mockResolvedValue(actor("admin-1", "admin"));
    openRoll(null);
    catalogRepo.pickGameForRoll.mockResolvedValue({ game: { id: "game-1", title: "Hades" }, reason: null });
    catalogRepo.createRoll.mockResolvedValue(gameRoll());

    await expect(rollNewGame("sp-1")).resolves.toBe("roll-1");
  });

  it("refuses when the season is missing", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    seasons.getSeasonById.mockResolvedValue(null);
    await expect(rollNewGame("sp-1")).rejects.toMatchObject({ code: "gameSeasonNotActive" });
  });

  it("refuses a season that is not active", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    seasons.getSeasonById.mockResolvedValue(season({ status: "paused" }));
    await expect(rollNewGame("sp-1")).rejects.toMatchObject({ code: "gameSeasonNotActive" });
    expect(catalogRepo.pickGameForRoll).not.toHaveBeenCalled();
  });

  it.each(["finished", "eliminated", "withdrawn"] as const)(
    "refuses a %s participant",
    async (status) => {
      players.getSeasonPlayerById.mockResolvedValue(seasonPlayer({ status }));
      await expect(rollNewGame("sp-1")).rejects.toMatchObject({ code: "gamePlayerNotActive" });
      expect(catalogRepo.pickGameForRoll).not.toHaveBeenCalled();
    },
  );

  it("refuses when the participant already holds an open roll", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    openRoll(gameRoll({ status: "in_progress" }));
    await expect(rollNewGame("sp-1")).rejects.toMatchObject({ code: "gameAlreadyHaveRoll" });
    expect(catalogRepo.pickGameForRoll).not.toHaveBeenCalled();
  });

  it.each([
    ["catalog_empty", "catalogEmpty"],
    ["all_played", "catalogAllPlayed"],
    ["filters_exclude_all", "catalogFiltersExcludeAll"],
    ["provider_empty", "catalogProviderEmpty"],
    ["provider_unavailable", "catalogProviderUnavailable"],
  ] as const)("maps an empty pool reason %s to %s", async (reason, code) => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    openRoll(null);
    catalogRepo.pickGameForRoll.mockResolvedValue({ game: null, reason });
    await expect(rollNewGame("sp-1")).rejects.toMatchObject({ code });
    expect(catalogRepo.createRoll).not.toHaveBeenCalled();
  });

  it("creates the roll, logs the draw and returns its id", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    openRoll(null);
    catalogRepo.pickGameForRoll.mockResolvedValue({
      game: { id: "game-1", title: "Hades" },
      reason: null,
    });
    catalogRepo.createRoll.mockResolvedValue(gameRoll({ id: "roll-9" }));

    await expect(rollNewGame("sp-1")).resolves.toBe("roll-9");

    expect(catalogRepo.createRoll).toHaveBeenCalledWith("sp-1", "game-1");
    expect(eventsInfra.logEvent).toHaveBeenCalledWith({
      seasonId: "season-1",
      seasonPlayerId: "sp-1",
      eventType: "game_rolled",
      payload: { gameId: "game-1", title: "Hades" },
    });
  });

  it("accepts an explicit actor instead of the session", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    openRoll(null);
    catalogRepo.pickGameForRoll.mockResolvedValue({ game: { id: "game-1", title: "Hades" }, reason: null });
    catalogRepo.createRoll.mockResolvedValue(gameRoll());

    await rollNewGame("sp-1", { actor: actor("user-1", "player") });
    expect(session.getCurrentUser).not.toHaveBeenCalled();
  });
});
