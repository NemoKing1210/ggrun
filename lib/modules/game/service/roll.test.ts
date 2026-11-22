import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameRoll, Season, SeasonPlayer, User } from "@/db/schema";

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
  const db: { select: () => Chain; transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> } = {
    select: () => chain(() => selectResults.shift() ?? []),
    transaction: async (fn) => fn("tx"),
  };
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

// What still waits for the player's answer takes its default first (spec §7.6).
const decisions = vi.hoisted(() => ({ settleDecisionsBeforeRoll: vi.fn(async () => {}) }));
vi.mock("./decisions", () => decisions);

// A choice of games waits for the player; what changed is announced after the commit (spec §7.12).
const ieeDecisions = vi.hoisted(() => ({ announceDecisions: vi.fn(async () => {}), hasPendingDecision: vi.fn(async () => false) }));
vi.mock("@/lib/modules/iee/decisions", () => ieeDecisions);

// The pick and its writes (spec §7.12; `./pick` is tested on its own): here they answer as told.
const HADES = { id: "game-1", title: "Hades" };
const picker = vi.hoisted(() => ({ next: null as unknown, started: null as unknown }));
const pick = vi.hoisted(() => ({
  pickNextGame: vi.fn(async () => picker.next),
  startNextGame: vi.fn(async () => picker.started),
}));
vi.mock("./pick", () => pick);

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
    postponedUntilSeq: null,
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
  seasons.getSeasonById.mockResolvedValue(season());
  ieeDecisions.hasPendingDecision.mockResolvedValue(false);
  picker.next = { kind: "game", game: HADES, shape: { exclude: [], require: [], favor: [], choice: 0, firings: [] }, relaxed: false, favoured: false, dropped: [] };
  picker.started = { rollId: "roll-1", game: HADES, returned: false, choice: null };
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
    expect(pick.pickNextGame).not.toHaveBeenCalled();
  });

  it("allows staff to roll on a participant's behalf", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    session.getCurrentUser.mockResolvedValue(actor("admin-1", "admin"));
    openRoll(null);
    await expect(rollNewGame("sp-1")).resolves.toEqual({ rollId: "roll-1", choice: null });
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
    expect(pick.pickNextGame).not.toHaveBeenCalled();
  });

  it.each(["finished", "eliminated", "withdrawn"] as const)(
    "refuses a %s participant",
    async (status) => {
      players.getSeasonPlayerById.mockResolvedValue(seasonPlayer({ status }));
      await expect(rollNewGame("sp-1")).rejects.toMatchObject({ code: "gamePlayerNotActive" });
      expect(pick.pickNextGame).not.toHaveBeenCalled();
    },
  );

  it("refuses when the participant already holds an open roll", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    openRoll(gameRoll({ status: "in_progress" }));
    await expect(rollNewGame("sp-1")).rejects.toMatchObject({ code: "gameAlreadyHaveRoll" });
    expect(pick.pickNextGame).not.toHaveBeenCalled();
  });

  it("refuses while a choice of games waits: the player takes one, they do not roll again (spec §7.12)", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    seasons.getSeasonById.mockResolvedValue(season({ config: { iee: { enabled: true } } }));
    openRoll(null);
    ieeDecisions.hasPendingDecision.mockResolvedValue(true);
    await expect(rollNewGame("sp-1")).rejects.toMatchObject({ code: "ieeDecisionPending" });
    expect(ieeDecisions.hasPendingDecision).toHaveBeenCalledWith("sp-1", "game_choice");
    expect(pick.pickNextGame).not.toHaveBeenCalled();
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
    picker.next = { kind: "none", reason };
    await expect(rollNewGame("sp-1")).rejects.toMatchObject({ code });
    expect(pick.startNextGame).not.toHaveBeenCalled();
  });

  it("starts the game in one transaction, logs the draw and returns its roll", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    openRoll(null);
    picker.started = { rollId: "roll-9", game: HADES, returned: false, choice: null };

    await expect(rollNewGame("sp-1")).resolves.toEqual({ rollId: "roll-9", choice: null });
    expect(pick.startNextGame).toHaveBeenCalledWith("tx", expect.objectContaining({ id: "sp-1" }), expect.any(Object), picker.next, {
      origin: "roll",
      replacedRollId: null,
      item: null,
      decisions: [],
    });
    expect(eventsInfra.logEvent).toHaveBeenCalledWith({
      seasonId: "season-1",
      seasonPlayerId: "sp-1",
      eventType: "game_rolled",
      payload: { gameId: "game-1", title: "Hades" },
    });
  });

  it("says when a set-aside game came back (spec §6.16)", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    openRoll(null);
    picker.started = { rollId: "roll-old", game: HADES, returned: true, choice: null };
    await expect(rollNewGame("sp-1")).resolves.toEqual({ rollId: "roll-old", choice: null });
    expect(eventsInfra.logEvent).toHaveBeenCalledWith(expect.objectContaining({ payload: { gameId: "game-1", title: "Hades", returned: true } }));
  });

  it("a choice the player's rules ask for waits for them: no roll, no draw in the feed, the choice announced", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    openRoll(null);
    picker.started = { rollId: null, game: null, returned: false, choice: { decisionId: "d-1", offered: 3 } };
    await expect(rollNewGame("sp-1")).resolves.toEqual({ rollId: null, choice: { decisionId: "d-1", offered: 3 } });
    expect(eventsInfra.logEvent).not.toHaveBeenCalled();
    expect(ieeDecisions.announceDecisions).toHaveBeenCalledWith([]);
  });

  it("answers what still waits with its default before the game starts (spec §7.6)", async () => {
    const order: string[] = [];
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    seasons.getSeasonById.mockResolvedValue(season({ config: { iee: { enabled: true } } }));
    openRoll(null);
    decisions.settleDecisionsBeforeRoll.mockImplementationOnce(async () => {
      order.push("settle");
    });
    pick.startNextGame.mockImplementationOnce(async () => {
      order.push("start");
      return picker.started;
    });

    await rollNewGame("sp-1");
    expect(order).toEqual(["settle", "start"]);
    expect(decisions.settleDecisionsBeforeRoll).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sp-1" }),
      expect.objectContaining({ iee: expect.objectContaining({ enabled: true }) }),
    );
  });

  it("settles nothing when the roll is refused", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    openRoll(null);
    picker.next = { kind: "none", reason: "catalog_empty" };
    await expect(rollNewGame("sp-1")).rejects.toMatchObject({ code: "catalogEmpty" });
    expect(decisions.settleDecisionsBeforeRoll).not.toHaveBeenCalled();
  });

  it("accepts an explicit actor instead of the session", async () => {
    players.getSeasonPlayerById.mockResolvedValue(seasonPlayer());
    openRoll(null);
    await rollNewGame("sp-1", { actor: actor("user-1", "player") });
    expect(session.getCurrentUser).not.toHaveBeenCalled();
  });
});
