import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerEventRow, SeasonPlayer } from "@/db/schema";
import type { Season } from "@/db/schema";
import { IeeConfigSchema } from "@/lib/engine";
import { grant, type ExecContext } from "@/lib/modules/iee/executor";
import type { ContextInput } from "@/lib/modules/iee/executor/context";
import { memoryStore } from "@/lib/modules/iee/executor/memory-store.test-helpers";
import { coreRegistry, type SeasonRegistry } from "@/lib/modules/iee/registry";
import { catalogRegistry } from "@/lib/modules/iee/registry/catalog.test-helpers";

import { GameLoopError } from "./errors";
import { assignEventFromCell, resolveEventUseCase, submitEventProofUseCase } from "./events";

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
    onConflictDoNothing(): Chain;
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
      onConflictDoNothing: () => c,
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

const eventsInfra = vi.hoisted(() => ({ logEvent: vi.fn(), logAdminAction: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => eventsInfra);

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const seasons = vi.hoisted(() => ({ getSeasonById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => seasons);

const repo = vi.hoisted(() => ({
  assignEvent: vi.fn(),
  getAssignedEventKeys: vi.fn(),
  getEventTemplatesByKeys: vi.fn(),
  getPlayerEvent: vi.fn(),
  getSeasonRollSeq: vi.fn(),
  resolveEvent: vi.fn(),
  submitEventProof: vi.fn(),
}));
vi.mock("@/lib/modules/iee/repository", () => repo);

const context = vi.hoisted(() => ({ executionContext: vi.fn() }));
vi.mock("@/lib/modules/iee/executor/context", () => context);

const REGISTRY = coreRegistry();

/**
 * Reward grants run through the real executor over an in-memory store; the
 * context's anchor rule is `executionContext`'s, stubbed here per test. The
 * season plays `seasonRegistry` — the whole fixture unless a test tunes it.
 */
let mem = memoryStore();
let inFlight = false;
let seasonRegistry: SeasonRegistry = REGISTRY;

function contextFor(input: ContextInput): ExecContext {
  return {
    store: mem.store,
    seasonId: input.seasonId,
    registry: input.registry ?? seasonRegistry,
    config: input.config,
    seasonRollSeq: input.seasonRollSeq ?? 0,
    actorUserId: input.actorUserId ?? null,
    rng: () => 0.5,
    snapshot: async (id) => ({
      seasonPlayerId: id,
      position: 3,
      balancePoints: 10,
      rollSeq: 4,
      moveCount: 4,
      rank: 1,
      status: "active",
    }),
    anchorFor: async () => ({ anchorRollSeq: inFlight ? 5 : 4 }),
  };
}

const ACTOR = { id: "admin-1", role: "admin" };
const TX = dbFake.db as unknown as Parameters<typeof assignEventFromCell>[0];

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

function playerEvent(overrides: Partial<PlayerEventRow> = {}): PlayerEventRow {
  return {
    id: "pe-1",
    seasonId: "season-1",
    seasonPlayerId: "sp-1",
    eventTemplateId: "tpl-1",
    eventKey: "collect_stamps",
    title: "Collect stamps",
    descriptionMd: "Bring the host five stamps.",
    reward: { points: 5 },
    requiresProof: true,
    status: "assigned",
    proof: null,
    adminNote: null,
    source: "cell_event",
    sourceMoveId: null,
    assignedBy: null,
    assignedAt: new Date(0),
    dueAt: null,
    submittedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  };
}

function season(config: unknown = {}): Season {
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
  for (const fn of Object.values(session)) fn.mockReset();
  session.isStaff.mockImplementation(
    (user: { role?: string } | null) => user?.role === "admin" || user?.role === "judge",
  );
  eventsInfra.logEvent.mockReset();
  eventsInfra.logAdminAction.mockReset();
  eventsInfra.logEvent.mockResolvedValue(undefined);
  eventsInfra.logAdminAction.mockResolvedValue(undefined);
  repo.assignEvent.mockReset();
  repo.getAssignedEventKeys.mockReset();
  repo.getEventTemplatesByKeys.mockReset();
  repo.getPlayerEvent.mockReset();
  repo.getSeasonRollSeq.mockReset();
  repo.resolveEvent.mockReset();
  repo.submitEventProof.mockReset();
  mem = memoryStore();
  inFlight = false;
  seasonRegistry = REGISTRY;
  context.executionContext.mockReset();
  context.executionContext.mockImplementation(async (input: ContextInput) => contextFor(input));
});

describe("assignEventFromCell", () => {
  const base = {
    seasonId: "season-1",
    seasonPlayerId: "sp-1",
    pool: ["k1", "k2"],
    moveId: "move-9",
    rng: () => 0,
  };

  it("does nothing when the season has no event pool", async () => {
    await expect(assignEventFromCell(TX, { ...base, pool: [] })).resolves.toEqual([]);
    expect(repo.getAssignedEventKeys).not.toHaveBeenCalled();
    expect(repo.assignEvent).not.toHaveBeenCalled();
  });

  it("does nothing once the player has every event in the pool", async () => {
    repo.getAssignedEventKeys.mockResolvedValue(["k1", "k2"]);
    await expect(assignEventFromCell(TX, base)).resolves.toEqual([]);
    expect(repo.assignEvent).not.toHaveBeenCalled();
  });

  it("does nothing when the picked template is missing", async () => {
    repo.getAssignedEventKeys.mockResolvedValue([]);
    repo.getEventTemplatesByKeys.mockResolvedValue([]);
    await expect(assignEventFromCell(TX, base)).resolves.toEqual([]);
    expect(repo.assignEvent).not.toHaveBeenCalled();
  });

  it("does nothing when the unique index wins the race", async () => {
    repo.getAssignedEventKeys.mockResolvedValue([]);
    repo.getEventTemplatesByKeys.mockResolvedValue([{ id: "tpl-1", key: "k1", title: "T" }]);
    repo.assignEvent.mockResolvedValue(null);
    await expect(assignEventFromCell(TX, base)).resolves.toEqual([]);
  });

  it("excludes the player's existing events before drawing", async () => {
    repo.getAssignedEventKeys.mockResolvedValue(["k1"]);
    repo.getEventTemplatesByKeys.mockResolvedValue([{ id: "tpl-2", key: "k2", title: "Second" }]);
    repo.assignEvent.mockResolvedValue({ id: "pe-2", eventKey: "k2", title: "Second" });
    await assignEventFromCell(TX, base);
    expect(repo.assignEvent).toHaveBeenCalledWith(
      expect.objectContaining({ template: expect.objectContaining({ key: "k2" }) }),
      TX,
    );
  });

  it("maps the assignment to a feed entry with the key, title and id", async () => {
    repo.getAssignedEventKeys.mockResolvedValue([]);
    repo.getEventTemplatesByKeys.mockResolvedValue([{ id: "tpl-1", key: "k1", title: "First" }]);
    repo.assignEvent.mockResolvedValue({ id: "pe-1", eventKey: "k1", title: "First" });

    await expect(assignEventFromCell(TX, base)).resolves.toEqual([
      { eventType: "event_assigned", payload: { eventKey: "k1", title: "First", playerEventId: "pe-1" } },
    ]);
  });

  it("records the assignment as a cell event on the move that triggered it", async () => {
    repo.getAssignedEventKeys.mockResolvedValue([]);
    repo.getEventTemplatesByKeys.mockResolvedValue([{ id: "tpl-1", key: "k1", title: "First" }]);
    repo.assignEvent.mockResolvedValue({ id: "pe-1", eventKey: "k1", title: "First" });

    await assignEventFromCell(TX, base);
    expect(repo.assignEvent).toHaveBeenCalledWith(
      {
        seasonId: "season-1",
        seasonPlayerId: "sp-1",
        template: { id: "tpl-1", key: "k1", title: "First" },
        source: "cell_event",
        sourceMoveId: "move-9",
      },
      TX,
    );
    expect(repo.getEventTemplatesByKeys).toHaveBeenCalledWith(["k1"]);
  });
});

describe("submitEventProofUseCase", () => {
  it("refuses a guest", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    await expect(submitEventProofUseCase({ playerEventId: "pe-1", proof: "evidence" })).rejects.toMatchObject({
      code: "gameLoginRequired",
    });
  });

  it("refuses an unknown assignment", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    repo.getPlayerEvent.mockResolvedValue(null);
    await expect(submitEventProofUseCase({ playerEventId: "pe-1", proof: "evidence" })).rejects.toMatchObject({
      code: "ieeEventNotFound",
    });
  });

  it("refuses when the assignment's participant is gone", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    repo.getPlayerEvent.mockResolvedValue(playerEvent());
    dbFake.selectResults.push([]);
    await expect(submitEventProofUseCase({ playerEventId: "pe-1", proof: "evidence" })).rejects.toMatchObject({
      code: "gameParticipantNotFound",
    });
  });

  it("refuses a player submitting someone else's proof", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "intruder", role: "player" });
    repo.getPlayerEvent.mockResolvedValue(playerEvent());
    dbFake.selectResults.push([seasonPlayer()]);
    await expect(submitEventProofUseCase({ playerEventId: "pe-1", proof: "evidence" })).rejects.toMatchObject({
      code: "gameNotAllowed",
    });
  });

  it("requires proof when the event says it does", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    repo.getPlayerEvent.mockResolvedValue(playerEvent({ requiresProof: true }));
    dbFake.selectResults.push([seasonPlayer()]);
    await expect(submitEventProofUseCase({ playerEventId: "pe-1", proof: "  " })).rejects.toMatchObject({
      code: "ieeProofRequired",
    });
  });

  it("treats a proof shorter than five characters as no proof", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    repo.getPlayerEvent.mockResolvedValue(playerEvent({ requiresProof: true }));
    dbFake.selectResults.push([seasonPlayer()]);
    await expect(submitEventProofUseCase({ playerEventId: "pe-1", proof: "abcd" })).rejects.toMatchObject({
      code: "ieeProofRequired",
    });
  });

  it("accepts a proof-free event without one", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    repo.getPlayerEvent.mockResolvedValue(playerEvent({ requiresProof: false }));
    dbFake.selectResults.push([seasonPlayer()]);
    repo.submitEventProof.mockResolvedValue(playerEvent({ requiresProof: false, status: "submitted" }));
    await submitEventProofUseCase({ playerEventId: "pe-1", proof: null });
    expect(repo.submitEventProof).toHaveBeenCalledWith("pe-1", null);
  });

  it("refuses a stale assignment the guarded update could not move", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    repo.getPlayerEvent.mockResolvedValue(playerEvent({ requiresProof: false }));
    dbFake.selectResults.push([seasonPlayer()]);
    repo.submitEventProof.mockResolvedValue(null);
    await expect(submitEventProofUseCase({ playerEventId: "pe-1", proof: null })).rejects.toMatchObject({
      code: "ieeEventNotOpen",
    });
  });

  it("trims the proof and returns the submitted row", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    repo.getPlayerEvent.mockResolvedValue(playerEvent());
    dbFake.selectResults.push([seasonPlayer()]);
    const updated = playerEvent({ status: "submitted", proof: "proof text" });
    repo.submitEventProof.mockResolvedValue(updated);

    await expect(submitEventProofUseCase({ playerEventId: "pe-1", proof: "  proof text  " })).resolves.toBe(updated);
    expect(repo.submitEventProof).toHaveBeenCalledWith("pe-1", "proof text");
    expect(eventsInfra.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        seasonId: "season-1",
        seasonPlayerId: "sp-1",
        eventType: "event_submitted",
        payload: { eventKey: "collect_stamps", title: "Collect stamps" },
      }),
    );
  });
});

describe("resolveEventUseCase", () => {
  it("refuses a non-staff judge", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    await expect(
      resolveEventUseCase({ playerEventId: "pe-1", outcome: "approved" }),
    ).rejects.toMatchObject({ code: "adminStaffRequired" });
    expect(repo.getPlayerEvent).not.toHaveBeenCalled();
  });

  it("refuses an unknown assignment", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getPlayerEvent.mockResolvedValue(null);
    await expect(
      resolveEventUseCase({ playerEventId: "pe-1", outcome: "approved" }),
    ).rejects.toMatchObject({ code: "ieeEventNotFound" });
  });

  it("refuses when the participant is gone", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getPlayerEvent.mockResolvedValue(playerEvent());
    dbFake.selectResults.push([]);
    await expect(
      resolveEventUseCase({ playerEventId: "pe-1", outcome: "approved" }),
    ).rejects.toMatchObject({ code: "gameParticipantNotFound" });
  });

  it("refuses when the season is gone", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getPlayerEvent.mockResolvedValue(playerEvent());
    dbFake.selectResults.push([seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(null);
    await expect(
      resolveEventUseCase({ playerEventId: "pe-1", outcome: "approved" }),
    ).rejects.toMatchObject({ code: "gameSeasonNotFound" });
  });

  it("pays a points reward through the ledger and the player's balance", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getPlayerEvent.mockResolvedValue(playerEvent({ reward: { points: 7 } }));
    dbFake.selectResults.push([seasonPlayer({ balancePoints: 10 })]);
    seasons.getSeasonById.mockResolvedValue(season());
    repo.getSeasonRollSeq.mockResolvedValue(12);
    repo.resolveEvent.mockResolvedValue(playerEvent({ status: "approved" }));

    await resolveEventUseCase({ playerEventId: "pe-1", outcome: "approved", adminNote: "  nice  " });

    expect(repo.resolveEvent).toHaveBeenCalledWith("pe-1", "approved", "admin-1", "nice", dbFake.db);
    expect(dbFake.inserts).toContainEqual(
      expect.objectContaining({
        values: expect.objectContaining({ seasonPlayerId: "sp-1", delta: 7, reason: "event_reward:collect_stamps" }),
      }),
    );
    expect(dbFake.updates).toContainEqual(
      expect.objectContaining({ values: expect.objectContaining({ balancePoints: 17 }) }),
    );
  });

  it("grants an item reward through the executor, with the season's tuning at the current season clock", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getPlayerEvent.mockResolvedValue(playerEvent({ reward: { itemKey: "hex_scroll" } }));
    dbFake.selectResults.push([seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(season());
    seasonRegistry = catalogRegistry({ hex_scroll: { durationOverride: 2 } });
    repo.getSeasonRollSeq.mockResolvedValue(12);
    repo.resolveEvent.mockResolvedValue(playerEvent({ status: "approved" }));

    await resolveEventUseCase({ playerEventId: "pe-1", outcome: "approved" });

    expect(context.executionContext).toHaveBeenCalledWith(
      expect.objectContaining({ tx: dbFake.db, seasonId: "season-1", seasonRollSeq: 12, actorUserId: "admin-1" }),
    );
    expect(mem.instances).toEqual([
      expect.objectContaining({
        kind: "item",
        revisionId: REGISTRY.get("hex_scroll")!.revisionId,
        holderPlayerId: "sp-1",
        chargesLeft: 2,
        source: "event_reward",
        grantedRollSeq: 12,
      }),
    ]);
    // Rewards are announced by the verdict, not as a drop.
    expect(mem.journal[0]).toMatchObject({ op: "grant", visibility: "staff" });
  });

  it("starts an effect reward with the player's next roll", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getPlayerEvent.mockResolvedValue(playerEvent({ reward: { effectKey: "ward" } }));
    dbFake.selectResults.push([seasonPlayer({ rollSeq: 4 })]);
    seasons.getSeasonById.mockResolvedValue(season());
    repo.getSeasonRollSeq.mockResolvedValue(12);
    repo.resolveEvent.mockResolvedValue(playerEvent({ status: "approved" }));

    await resolveEventUseCase({ playerEventId: "pe-1", outcome: "approved" });

    expect(mem.instances).toEqual([
      expect.objectContaining({
        kind: "effect",
        revisionId: REGISTRY.get("ward")!.revisionId,
        anchorRollSeq: 4,
        grantedRollSeq: 12,
        source: "event_reward",
      }),
    ]);
  });

  it("never lets an effect reward touch a game the player has in flight", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    inFlight = true;
    repo.getPlayerEvent.mockResolvedValue(playerEvent({ reward: { effectKey: "swamp" } }));
    dbFake.selectResults.push([seasonPlayer({ rollSeq: 4 })]);
    seasons.getSeasonById.mockResolvedValue(season());
    repo.getSeasonRollSeq.mockResolvedValue(12);
    repo.resolveEvent.mockResolvedValue(playerEvent({ status: "approved" }));

    await resolveEventUseCase({ playerEventId: "pe-1", outcome: "approved" });

    expect(mem.instances[0]).toMatchObject({ anchorRollSeq: 5 });
  });

  it("grants nothing and logs a rejection when the outcome is rejected", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getPlayerEvent.mockResolvedValue(playerEvent({ reward: { points: 7, itemKey: "hex_scroll", effectKey: "ward" } }));
    dbFake.selectResults.push([seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(season());
    repo.getSeasonRollSeq.mockResolvedValue(12);
    repo.resolveEvent.mockResolvedValue(playerEvent({ status: "rejected" }));

    await resolveEventUseCase({ playerEventId: "pe-1", outcome: "rejected" });

    expect(context.executionContext).not.toHaveBeenCalled();
    expect(mem.instances).toEqual([]);
    expect(dbFake.updates).toEqual([]);
    expect(eventsInfra.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "event_rejected", payload: expect.objectContaining({ reward: {} }) }),
    );
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "iee_event_rejected", actorId: "admin-1", targetId: "pe-1" }),
    );
  });

  it("still lands the rest of a reward when a unique effect is already held", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await grant(contextFor({ tx: dbFake.db as never, seasonId: "season-1", config: IeeConfigSchema.parse({}) }), {
      entry: "lucky",
      to: "sp-1",
      source: "cell_bonus",
      reveal: false,
    });
    repo.getPlayerEvent.mockResolvedValue(playerEvent({ reward: { points: 2, effectKey: "lucky" } }));
    dbFake.selectResults.push([seasonPlayer({ balancePoints: 3 })]);
    seasons.getSeasonById.mockResolvedValue(season());
    repo.getSeasonRollSeq.mockResolvedValue(12);
    repo.resolveEvent.mockResolvedValue(playerEvent({ status: "approved" }));

    await expect(resolveEventUseCase({ playerEventId: "pe-1", outcome: "approved" })).resolves.toBeUndefined();

    expect(mem.instances).toHaveLength(1);
    expect(logger.log.debug).toHaveBeenCalledWith(
      "iee.event.reward_blocked_unique",
      expect.objectContaining({ playerEventId: "pe-1", effectKey: "lucky" }),
    );
    expect(dbFake.updates).toContainEqual(expect.objectContaining({ values: expect.objectContaining({ balancePoints: 5 }) }));
  });

  it("notes a reward the season does not play, and still lands the rest", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    seasonRegistry = catalogRegistry({ ward: {} });
    repo.getPlayerEvent.mockResolvedValue(playerEvent({ reward: { points: 1, itemKey: "hex_scroll", effectKey: "ward" } }));
    dbFake.selectResults.push([seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(season());
    repo.getSeasonRollSeq.mockResolvedValue(12);
    repo.resolveEvent.mockResolvedValue(playerEvent({ status: "approved" }));

    await resolveEventUseCase({ playerEventId: "pe-1", outcome: "approved" });

    expect(mem.instances.map((i) => i.kind)).toEqual(["effect"]);
    expect(logger.log.warn).toHaveBeenCalledWith("iee.event.reward_not_granted", {
      playerEventId: "pe-1",
      itemKey: "hex_scroll",
      state: "unknown_entry",
    });
    expect(dbFake.updates).toContainEqual(expect.objectContaining({ values: expect.objectContaining({ balancePoints: 11 }) }));
  });

  it("fails the whole verdict when the guarded resolve matched no row", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getPlayerEvent.mockResolvedValue(playerEvent({ reward: { points: 2 } }));
    dbFake.selectResults.push([seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(season());
    repo.getSeasonRollSeq.mockResolvedValue(12);
    repo.resolveEvent.mockResolvedValue(null);

    const error = await resolveEventUseCase({ playerEventId: "pe-1", outcome: "approved" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GameLoopError);
    expect((error as GameLoopError).code).toBe("ieeEventNotOpen");
    expect(eventsInfra.logAdminAction).not.toHaveBeenCalled();
  });
});
