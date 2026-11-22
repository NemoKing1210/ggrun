import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CompletionRequest, GameRoll, RerollRequest, Season, SeasonPlayer, User } from "@/db/schema";
import type * as CatalogRepository from "@/lib/modules/catalog/repository";
import { DEFAULT_SEASON_CONFIG, type SeasonConfig } from "@/lib/engine";

import { resolveGameRoll } from "./resolve";

/** Minimal thenable Drizzle stand-in that records writes and replays queued reads. */
const dbFake = vi.hoisted(() => {
  interface Chain {
    from(...args: unknown[]): Chain;
    where(...args: unknown[]): Chain;
    orderBy(...args: unknown[]): Chain;
    limit(...args: unknown[]): Chain;
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

const seasons = vi.hoisted(() => ({ getSeasonById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => seasons);

const catalogRepo = vi.hoisted(() => ({
  countRerollsForGame: vi.fn(),
  createCompletionRequest: vi.fn(),
  createRerollRequest: vi.fn(),
  endRollInFlight: vi.fn(),
  getApprovedRerollForRoll: vi.fn(),
  getPendingCompletionForRoll: vi.fn(),
  getPendingRerollForRoll: vi.fn(),
}));
vi.mock("@/lib/modules/catalog/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof CatalogRepository>()),
  ...catalogRepo,
}));

const notifications = vi.hoisted(() => ({ notifyUser: vi.fn(), notifyStaff: vi.fn() }));
vi.mock("@/lib/modules/notifications/service", () => notifications);

const turn = vi.hoisted(() => ({ applyResolvedTurn: vi.fn() }));
vi.mock("./turn", () => turn);

// A reaction window the player has open (wave B, spec §7.4): none unless a test opens one.
const decisions = vi.hoisted(() => ({ hasPendingDecision: vi.fn(async () => false), announceDecisions: vi.fn(async () => {}) }));
vi.mock("@/lib/modules/iee/decisions", () => decisions);

// The new pick and its writes (spec §7.12; `./pick` is tested on its own): here they answer as told.
const CELESTE = { id: "game-2", title: "Celeste" };
const picker = vi.hoisted(() => ({ next: null as unknown, started: null as unknown }));
const pick = vi.hoisted(() => ({
  pickNextGame: vi.fn(async () => picker.next),
  startNextGame: vi.fn(async () => picker.started),
}));
vi.mock("./pick", async (importOriginal) => ({ ...(await importOriginal<typeof import("./pick")>()), ...pick }));

const ACTOR: User = { id: "user-1", role: "player" } as unknown as User;
const TURN_RESULT = { diceResults: [3], fromPosition: 3, toPosition: 6, newBalancePoints: 12 };

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
    postponedUntilSeq: null,
    rolledAt: new Date(0),
    resolvedAt: null,
    ...overrides,
  };
}

function season(config: Partial<SeasonConfig> = {}): Season {
  return {
    id: "season-1",
    slug: "s1",
    title: "Season 1",
    status: "active",
    config: { ...structuredClone(DEFAULT_SEASON_CONFIG), ...config },
    rulesMd: null,
    startedAt: null,
    finishedAt: null,
    createdBy: null,
    createdAt: new Date(0),
  };
}

function rerollRequest(overrides: Partial<RerollRequest> = {}): RerollRequest {
  return {
    id: "rr-1",
    seasonPlayerId: "sp-1",
    gameRollId: "roll-1",
    reason: "because",
    status: "approved",
    adminNote: null,
    requestedAt: new Date(0),
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  };
}

function completionRequest(overrides: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    id: "cr-1",
    seasonPlayerId: "sp-1",
    gameRollId: "roll-1",
    outcome: "passed",
    reason: null,
    rating: null,
    status: "approved",
    adminNote: null,
    requestedAt: new Date(0),
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  };
}

/** Queues the two mandatory selects: the roll then the participant. */
function queueRollAndPlayer(roll: GameRoll | null, sp: SeasonPlayer | null): void {
  dbFake.selectResults.push(roll ? [roll] : []);
  dbFake.selectResults.push(sp ? [sp] : []);
}

beforeEach(() => {
  dbFake.reset();
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue(null);
  session.isStaff.mockImplementation(
    (user: { role?: string } | null) => user?.role === "admin" || user?.role === "judge",
  );
  seasons.getSeasonById.mockResolvedValue(season());
  for (const fn of Object.values(catalogRepo)) fn.mockReset();
  catalogRepo.getPendingRerollForRoll.mockResolvedValue(null);
  catalogRepo.getPendingCompletionForRoll.mockResolvedValue(null);
  catalogRepo.getApprovedRerollForRoll.mockResolvedValue(null);
  catalogRepo.countRerollsForGame.mockResolvedValue(0);
  catalogRepo.endRollInFlight.mockResolvedValue(true);
  picker.next = { kind: "game", game: CELESTE, shape: { exclude: [], require: [], favor: [], choice: 0, firings: [] }, relaxed: false, favoured: false, dropped: [] };
  picker.started = { rollId: "roll-2", game: CELESTE, returned: false, choice: null };
  catalogRepo.createRerollRequest.mockResolvedValue(rerollRequest({ status: "pending" }));
  catalogRepo.createCompletionRequest.mockResolvedValue(completionRequest({ status: "pending" }));
  notifications.notifyUser.mockResolvedValue(null);
  notifications.notifyStaff.mockResolvedValue(undefined);
  turn.applyResolvedTurn.mockResolvedValue(TURN_RESULT);
});

describe("resolveGameRoll — guards", () => {
  it("refuses a guest", async () => {
    await expect(resolveGameRoll({ rollId: "roll-1", outcome: "passed" })).rejects.toMatchObject({
      code: "gameLoginRequired",
    });
    expect(dbFake.selectResults).toHaveLength(0);
  });

  it("refuses an unknown roll", async () => {
    queueRollAndPlayer(null, null);
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "passed" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "gameRollNotFound" });
  });

  it.each(["passed", "dropped", "rerolled"] as const)(
    "refuses a roll already %s",
    async (status) => {
      queueRollAndPlayer(gameRoll({ status }), seasonPlayer());
      await expect(
        resolveGameRoll({ rollId: "roll-1", outcome: "passed" }, { actor: ACTOR }),
      ).rejects.toMatchObject({ code: "gameRollAlreadyResolved" });
    },
  );

  it("refuses when the participant is gone", async () => {
    queueRollAndPlayer(gameRoll(), null);
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "passed" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "gameParticipantNotFound" });
  });

  it("refuses an actor who is neither the participant nor staff", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    session.getCurrentUser.mockResolvedValue({ id: "intruder", role: "player" });
    await expect(resolveGameRoll({ rollId: "roll-1", outcome: "passed" })).rejects.toMatchObject({
      code: "gameNotAllowed",
    });
  });

  it("refuses when the season is gone", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    seasons.getSeasonById.mockResolvedValue(null);
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "passed" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "gameSeasonNotFound" });
  });

  it("refuses a season that is not active", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    seasons.getSeasonById.mockResolvedValue({ ...season(), status: "paused" });
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "passed" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "gameSeasonNotActive" });
  });

  it("refuses a participant who is out of the run", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer({ status: "eliminated" }));
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "passed" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "gamePlayerNotActive" });
  });

  it("refuses while a reroll request is pending", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    catalogRepo.getPendingRerollForRoll.mockResolvedValue(rerollRequest({ status: "pending" }));
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "passed" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "gameRerollPending" });
  });

  it("refuses while a completion request is pending", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    catalogRepo.getPendingCompletionForRoll.mockResolvedValue(completionRequest({ status: "pending" }));
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "passed" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "gameCompletionPending" });
    expect(turn.applyResolvedTurn).not.toHaveBeenCalled();
  });

  it.each(["passed", "dropped", "rerolled"] as const)(
    "refuses a %s report while the turn waits for the player's reaction (spec §7.4)",
    async (outcome) => {
      queueRollAndPlayer(gameRoll(), seasonPlayer());
      decisions.hasPendingDecision.mockResolvedValueOnce(true);
      await expect(
        resolveGameRoll({ rollId: "roll-1", outcome, reason: "the game was broken" }, { actor: ACTOR }),
      ).rejects.toMatchObject({ code: "gameReactionPending" });
      expect(decisions.hasPendingDecision).toHaveBeenCalledWith("sp-1", "reaction_window");
      expect(turn.applyResolvedTurn).not.toHaveBeenCalled();
      expect(catalogRepo.createRerollRequest).not.toHaveBeenCalled();
    },
  );
});

describe("resolveGameRoll — rerolled", () => {
  it("requires a reason of at least five characters without an approval", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "rerolled", reason: "nope" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "formReasonRequired" });
    expect(catalogRepo.createRerollRequest).not.toHaveBeenCalled();
  });

  it("refuses when rerolls are turned off for the season", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    seasons.getSeasonById.mockResolvedValue(season({ rerolls: { allowed: false, limitPerGame: 1, requireApproval: true } }));
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "rerolled", reason: "a good reason" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "gameRerollLimit" });
  });

  it("refuses when the participant has spent every reroll", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer({ rerollsUsed: 1 }));
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "rerolled", reason: "a good reason" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "gameRerollLimit" });
  });

  it("refuses when this game has hit its per-game reroll limit", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    catalogRepo.countRerollsForGame.mockResolvedValue(1);
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "rerolled", reason: "a good reason" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "gameRerollLimitForGame" });
  });

  it("keeps an approval usable when the pool has nothing to reroll into", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    catalogRepo.getApprovedRerollForRoll.mockResolvedValue(rerollRequest());
    picker.next = { kind: "none", reason: "all_played" };
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "rerolled", reason: "" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "catalogAllPlayed" });
    expect(dbFake.inserts).toEqual([]);
    expect(catalogRepo.endRollInFlight).not.toHaveBeenCalled();
  });

  it("performs an instant reroll inside the transaction when approval is not required", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer({ rerollsUsed: 0 }));
    seasons.getSeasonById.mockResolvedValue(
      season({ rerolls: { allowed: true, limitPerGame: 2, requireApproval: false } }),
    );

    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "rerolled", reason: "a good reason" }, { actor: ACTOR }),
    ).resolves.toEqual({ fromPosition: 3, toPosition: 3, newBalancePoints: 10 });

    // The roll in flight ends, and the next game starts as any pick does (spec §7.12).
    expect(catalogRepo.endRollInFlight).toHaveBeenCalledWith(dbFake.db, "roll-1", null);
    expect(pick.startNextGame).toHaveBeenCalledWith(dbFake.db, expect.objectContaining({ id: "sp-1" }), expect.any(Object), picker.next, {
      origin: "reroll",
      replacedRollId: "roll-1",
      item: null,
      decisions: [],
    });
    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({ values: expect.objectContaining({ rerollsUsed: 1 }) }),
    );
    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        values: expect.objectContaining({
          eventType: "game_rerolled",
          payload: { oldGameId: "game-1", newGameId: "game-2", title: "Celeste", instant: true },
        }),
      }),
    );
    expect(decisions.announceDecisions).toHaveBeenCalledWith([]);
    expect(catalogRepo.createRerollRequest).not.toHaveBeenCalled();
    expect(turn.applyResolvedTurn).not.toHaveBeenCalled();
  });

  it("a reroll that opens a choice of games says so: no new game yet (spec §7.12)", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    seasons.getSeasonById.mockResolvedValue(season({ rerolls: { allowed: true, limitPerGame: 2, requireApproval: false } }));
    picker.started = { rollId: null, game: null, returned: false, choice: { decisionId: "d-1", offered: 3 } };
    await resolveGameRoll({ rollId: "roll-1", outcome: "rerolled", reason: "a good reason" }, { actor: ACTOR });
    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        values: expect.objectContaining({
          eventType: "game_rerolled",
          payload: { oldGameId: "game-1", newGameId: null, title: null, choosing: 3, instant: true },
        }),
      }),
    );
  });

  it("refuses a reroll of a roll resolved meanwhile — nothing is spent", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    seasons.getSeasonById.mockResolvedValue(season({ rerolls: { allowed: true, limitPerGame: 2, requireApproval: false } }));
    catalogRepo.endRollInFlight.mockResolvedValue(false);
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "rerolled", reason: "a good reason" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "gameRollAlreadyResolved" });
    expect(pick.startNextGame).not.toHaveBeenCalled();
  });

  it("attributes an approved reroll to its request", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    catalogRepo.getApprovedRerollForRoll.mockResolvedValue(rerollRequest({ id: "rr-7" }));

    await resolveGameRoll({ rollId: "roll-1", outcome: "rerolled", reason: "" }, { actor: ACTOR });

    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        values: expect.objectContaining({
          eventType: "game_rerolled",
          payload: expect.objectContaining({ requestId: "rr-7" }),
        }),
      }),
    );
    expect(catalogRepo.createRerollRequest).not.toHaveBeenCalled();
  });

  it("files a reroll request when the season requires approval", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    dbFake.selectResults.push([{ title: "Hades", coverUrl: "cover.png" }]);

    await resolveGameRoll(
      { rollId: "roll-1", outcome: "rerolled", reason: "  the game was broken  " },
      { actor: ACTOR },
    );

    expect(catalogRepo.createRerollRequest).toHaveBeenCalledWith("sp-1", "roll-1", "the game was broken");
    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        values: expect.objectContaining({ eventType: "reroll_requested" }),
      }),
    );
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      "user-1",
      "reroll_requested",
      expect.objectContaining({ rollId: "roll-1", gameTitle: "Hades" }),
    );
    expect(notifications.notifyStaff).toHaveBeenCalledWith(
      "reroll_requested",
      expect.objectContaining({ rollId: "roll-1" }),
    );
    expect(turn.applyResolvedTurn).not.toHaveBeenCalled();
  });
});

describe("resolveGameRoll — completion moderation", () => {
  const moderated = () =>
    season({ moderation: { completionRequireApproval: true } });

  it("requires a five-character reason for a moderated drop", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    seasons.getSeasonById.mockResolvedValue(moderated());
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "dropped", reason: "no" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "formReasonRequired" });
    expect(catalogRepo.createCompletionRequest).not.toHaveBeenCalled();
  });

  it.each([0, 11, 4.5])("rejects an out-of-range rating (%s) on a moderated pass", async (rating) => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    seasons.getSeasonById.mockResolvedValue(moderated());
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "passed", rating }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "formRatingInvalid" });
  });

  it("queues a moderated pass with the trimmed comment and rating", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    seasons.getSeasonById.mockResolvedValue(moderated());
    dbFake.selectResults.push([{ title: "Hades", coverUrl: null }]);

    await resolveGameRoll(
      { rollId: "roll-1", outcome: "passed", comment: "  great  ", rating: 8 },
      { actor: ACTOR },
    );

    expect(catalogRepo.createCompletionRequest).toHaveBeenCalledWith("sp-1", "roll-1", "passed", "great", 8);
    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        values: expect.objectContaining({
          eventType: "completion_requested",
          payload: expect.objectContaining({ outcome: "passed", reason: "great", rating: 8 }),
        }),
      }),
    );
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      "user-1",
      "completion_requested",
      expect.objectContaining({ rollId: "roll-1", outcome: "passed" }),
    );
    expect(turn.applyResolvedTurn).not.toHaveBeenCalled();
  });

  it("queues a moderated drop with its reason", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    seasons.getSeasonById.mockResolvedValue(moderated());
    dbFake.selectResults.push([]);

    await resolveGameRoll(
      { rollId: "roll-1", outcome: "dropped", reason: "  could not finish  " },
      { actor: ACTOR },
    );

    expect(catalogRepo.createCompletionRequest).toHaveBeenCalledWith("sp-1", "roll-1", "dropped", "could not finish", null);
  });
});

describe("resolveGameRoll — direct outcome", () => {
  it("requires a five-character reason for a drop", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "dropped", comment: "bad" }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "formReasonRequired" });
    expect(turn.applyResolvedTurn).not.toHaveBeenCalled();
  });

  it("rejects a non-integer rating", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "passed", rating: 1.5 }, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: "formRatingInvalid" });
  });

  it("delegates a valid pass to the canonical turn with trimmed notes", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    await expect(
      resolveGameRoll(
        { rollId: "roll-1", outcome: "passed", comment: "  nice run  ", rating: 9 },
        { actor: ACTOR },
      ),
    ).resolves.toBe(TURN_RESULT);

    expect(turn.applyResolvedTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sp: expect.objectContaining({ id: "sp-1" }),
        roll: expect.objectContaining({ id: "roll-1" }),
        outcome: "passed",
        notes: "nice run",
        rating: 9,
        config: expect.objectContaining({ rerolls: expect.any(Object) }),
      }),
    );
  });

  it("passes an empty comment through as null notes", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    await resolveGameRoll({ rollId: "roll-1", outcome: "passed", comment: "   " }, { actor: ACTOR });
    expect(turn.applyResolvedTurn).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null, rating: null }),
    );
  });

  it("forwards the turn result unchanged", async () => {
    queueRollAndPlayer(gameRoll(), seasonPlayer());
    turn.applyResolvedTurn.mockResolvedValue({ diceResults: [1], fromPosition: 0, toPosition: 1, newBalancePoints: 0 });
    await expect(
      resolveGameRoll({ rollId: "roll-1", outcome: "dropped", reason: "gave up" }, { actor: ACTOR }),
    ).resolves.toEqual({ diceResults: [1], fromPosition: 0, toPosition: 1, newBalancePoints: 0 });
  });
});
