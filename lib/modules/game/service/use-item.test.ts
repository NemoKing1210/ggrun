import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IeeInstanceRow, Season, SeasonPlayer, User } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, type IeePlayerSnapshot, type SeasonConfig } from "@/lib/engine";
import type { ExecContext } from "@/lib/modules/iee/executor";
import type { ContextInput } from "@/lib/modules/iee/executor/context";
import { memoryStore } from "@/lib/modules/iee/executor/memory-store.test-helpers";
import { CORE_DOCS } from "@/lib/engine/iee/core-docs";
import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";
import { buildRegistry, coreRegistry, type SeasonRegistry } from "@/lib/modules/iee/registry";

import { activateInventoryItem, pickRequestOf, searchPickGames } from "./use-item";

/** Minimal thenable Drizzle stand-in: each `select()` resolves the next queued rows. */
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
  const db = {
    select: () => chain(() => selectResults.shift() ?? []),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ marker: "tx" }),
  };
  return { db, selectResults };
});
vi.mock("@/lib/infrastructure/db", () => ({ db: dbFake.db }));

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const eventsInfra = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => eventsInfra);

const seasons = vi.hoisted(() => ({ getSeasonById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => seasons);

const repo = vi.hoisted(() => ({
  getInstanceRow: vi.fn(),
  getMoveCount: vi.fn(),
  listActiveInstances: vi.fn(),
  // The objects standing on the board (wave D, spec §6.18): none, unless a test says so.
  listActiveObjects: vi.fn(async () => [] as { ownerPlayerId: string | null }[]),
}));
vi.mock("@/lib/modules/iee/repository", () => repo);

const context = vi.hoisted(() => ({ executionContext: vi.fn() }));
vi.mock("@/lib/modules/iee/executor/context", () => context);

// What waits for the user to choose (wave B, spec §7.6): nothing, unless a test says so.
const decisions = vi.hoisted(() => ({
  hasPendingDecision: vi.fn(async (_id: string, _kind?: string) => false),
  announceDecisions: vi.fn(async () => {}),
}));
vi.mock("@/lib/modules/iee/decisions", () => decisions);

// What the season's pool offers a pick for the next game (wave C, spec §6.16) is the pool's query;
// the roll in flight an item replaces is the rolls' (§6.16).
const catalogPick = vi.hoisted(() => ({
  offeredPick: vi.fn(),
  pickGames: vi.fn(async () => [{ id: "g-1", title: "Celeste" }]),
  endRollInFlight: vi.fn(async () => true),
  getPendingRerollForRoll: vi.fn(async () => null),
  getPendingCompletionForRoll: vi.fn(async () => null),
}));
vi.mock("@/lib/modules/catalog/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/catalog/repository")>()),
  ...catalogPick,
}));

// The next game an item's use picks and starts (spec §7.12; `./pick` is tested on its own).
const picking = vi.hoisted(() => ({ next: null as unknown, started: null as unknown }));
const pickMod = vi.hoisted(() => ({
  pickNextGame: vi.fn(async () => picking.next),
  startNextGame: vi.fn(async () => picking.started),
}));
vi.mock("./pick", async (importOriginal) => ({ ...(await importOriginal<typeof import("./pick")>()), ...pickMod }));

// Where an object may stand is the board's to say (wave D, spec §6.18; `./objects` reads it).
const objectsMod = vi.hoisted(() => ({ offeredCell: vi.fn() }));
vi.mock("./objects", async (importOriginal) => ({ ...(await importOriginal<typeof import("./objects")>()), ...objectsMod }));

// A season plays its catalog, read from the database; these tests play the
// system pack's fixture instead — or, where a test sets one, a catalog of its own.
const seasonRegistry = vi.hoisted(() => ({ current: null as SeasonRegistry | null }));
vi.mock("@/lib/modules/iee/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/modules/iee/registry")>();
  return { ...actual, getSeasonRegistry: async () => seasonRegistry.current ?? actual.coreRegistry() };
});

const REGISTRY = coreRegistry();
const ACTOR: User = { id: "user-1", role: "player" } as unknown as User;

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

const RIVAL = () => seasonPlayer({ id: "sp-2", playerId: "user-2", rollSeq: 7 });

/** A live instance of a core entry held by `holder`. */
function instance(key: string, overrides: Partial<IeeInstanceRow> = {}): IeeInstanceRow {
  const def = REGISTRY.get(key)!;
  const start = REGISTRY.start(def);
  return {
    id: def.kind === "item" ? "inv-1" : `eff-${key}`,
    seasonId: "season-1",
    entryId: def.entryId,
    revisionId: def.revisionId,
    kind: def.kind,
    holderKind: "player",
    holderPlayerId: "sp-1",
    holderCellIndex: null,
    holderRollId: null,
    ownerPlayerId: null,
    aimedPlayerId: null,
    chosen: null,
    params: start.params,
    chargesLeft: def.kind === "item" ? start.charges : null,
    remaining: def.kind === "effect" ? start.remaining : null,
    remainingUnit: def.kind === "effect" ? start.unit : null,
    anchorRollSeq: def.kind === "effect" ? 3 : null,
    countFromRollSeq: null,
    status: "active",
    endReason: null,
    source: "cell_bonus",
    sourceMoveId: null,
    causeJournalId: null,
    grantedRollSeq: 12,
    grantedAt: new Date(0),
    endedAt: null,
    ...overrides,
  };
}

function season(configPatch: Partial<SeasonConfig> = {}): Season {
  return {
    id: "season-1",
    slug: "s1",
    title: "Season 1",
    status: "active",
    config: { ...structuredClone(DEFAULT_SEASON_CONFIG), ...configPatch },
    rulesMd: null,
    startedAt: null,
    finishedAt: null,
    createdBy: null,
    createdAt: new Date(0),
  };
}

const targetingOn = () => season({ iee: { ...DEFAULT_SEASON_CONFIG.iee, allowTargetingOthers: true } });

/**
 * The executor runs for real over an in-memory store: the test sees the
 * instances and the journal it leaves, not calls into mocks.
 */
let mem = memoryStore();
let inFlight = new Set<string>();

function holding(...rows: IeeInstanceRow[]): void {
  mem.instances.push(...rows.map((r) => ({ ...r })));
  repo.getInstanceRow.mockImplementation(async (id: string) => rows.find((r) => r.id === id) ?? null);
  repo.listActiveInstances.mockImplementation(async (holder: string) =>
    rows.filter((r) => r.holderPlayerId === holder && r.status === "active"),
  );
}

function openRoll(): void {
  dbFake.selectResults.push([{ id: "roll-1" }]);
}

function noOpenRoll(): void {
  dbFake.selectResults.push([]);
}

function username(name: string | null): void {
  dbFake.selectResults.push(name ? [{ username: name }] : []);
}

beforeEach(() => {
  dbFake.selectResults.length = 0;
  vi.clearAllMocks();
  seasonRegistry.current = null;
  mem = memoryStore({ balances: { "sp-1": 10, "sp-2": 5 } });
  inFlight = new Set();
  session.getCurrentUser.mockResolvedValue(ACTOR);
  seasons.getSeasonById.mockResolvedValue(season());
  repo.getMoveCount.mockResolvedValue(10);
  holding(instance("cleansing_salve"));
  eventsInfra.logEvent.mockResolvedValue(undefined);
  context.executionContext.mockImplementation(async (input: ContextInput): Promise<ExecContext> => ({
    store: mem.store,
    seasonId: input.seasonId,
    registry: input.registry ?? REGISTRY,
    config: input.config,
    seasonRollSeq: 12,
    actorPlayerId: input.actorPlayerId ?? null,
    actorUserId: input.actorUserId ?? null,
    rng: () => 0.5,
    snapshot: async (id): Promise<IeePlayerSnapshot> => ({
      seasonPlayerId: id,
      position: 3,
      balancePoints: 0,
      rollSeq: 4,
      moveCount: 10,
      rank: 1,
      status: "active",
    }),
    // What `executionContext` answers: a game in flight pushes the start one roll out.
    anchorFor: async (id) => {
      const rollSeq = id === "sp-2" ? 7 : 4;
      return { anchorRollSeq: inFlight.has(id) ? rollSeq + 1 : rollSeq };
    },
  }));
});

const live = (id: string) => mem.instances.find((i) => i.id === id);

describe("activateInventoryItem — guards", () => {
  it("refuses a guest before loading anything", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "gameLoginRequired",
    });
    expect(repo.getInstanceRow).not.toHaveBeenCalled();
  });

  it("refuses an unknown instance", async () => {
    await expect(activateInventoryItem({ inventoryId: "inv-404" })).rejects.toMatchObject({
      code: "ieeItemNotFound",
    });
  });

  it("refuses an effect passed off as an item", async () => {
    holding(instance("swamp", { id: "inv-1" }));
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "ieeItemNotFound",
    });
  });

  it("refuses an item that was already used", async () => {
    holding(instance("cleansing_salve", { status: "ended", endReason: "used" }));
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "ieeItemAlreadyUsed",
    });
  });

  it("refuses an item with no charges left", async () => {
    holding(instance("cleansing_salve", { chargesLeft: 0 }));
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "ieeItemAlreadyUsed",
    });
  });

  it("refuses when the holder's participant is gone", async () => {
    dbFake.selectResults.push([]);
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "gameParticipantNotFound",
    });
  });

  it("refuses one player using another player's item", async () => {
    dbFake.selectResults.push([seasonPlayer({ playerId: "someone-else" })]);
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "gameNotAllowed",
    });
  });

  it("refuses when the season is gone", async () => {
    dbFake.selectResults.push([seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue(null);
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "gameSeasonNotFound",
    });
  });

  it("refuses when the season is not active", async () => {
    dbFake.selectResults.push([seasonPlayer()]);
    seasons.getSeasonById.mockResolvedValue({ ...season(), status: "paused" });
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "gameSeasonNotActive",
    });
  });

  it("refuses an item whose revision the season does not play", async () => {
    holding(instance("cleansing_salve", { revisionId: "00000000-0000-4000-8000-00000000dead" }));
    dbFake.selectResults.push([seasonPlayer()]);
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "ieeItemNotFound",
    });
  });
});

describe("activateInventoryItem — targeting windows", () => {
  it("refuses a before-roll item while the player has a game in flight, spending nothing", async () => {
    holding(instance("speed_boots"));
    dbFake.selectResults.push([seasonPlayer()]);
    openRoll();
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "ieeItemWrongWindow",
    });
    expect(live("inv-1")).toMatchObject({ status: "active", chargesLeft: 1 });
    expect(mem.journal).toEqual([]);
  });

  it("requires a target for an offensive item", async () => {
    holding(instance("hex_scroll"));
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "ieeTargetRequired",
    });
  });

  it("refuses aiming an other-target item at yourself", async () => {
    holding(instance("hex_scroll"));
    dbFake.selectResults.push([seasonPlayer()], [seasonPlayer()]);
    noOpenRoll();
    await expect(
      activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-1" }),
    ).rejects.toMatchObject({ code: "ieeTargetSelfNotAllowed" });
  });

  it("refuses targeting others when the season disables it", async () => {
    holding(instance("hex_scroll"));
    dbFake.selectResults.push([seasonPlayer()], [RIVAL()]);
    noOpenRoll();
    await expect(
      activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" }),
    ).rejects.toMatchObject({ code: "ieeTargetingDisabled" });
  });

  it("refuses a target still inside the PvP protection window", async () => {
    holding(instance("hex_scroll"));
    seasons.getSeasonById.mockResolvedValue(targetingOn());
    repo.getMoveCount.mockImplementation(async (id: string) => (id === "sp-2" ? 0 : 10));
    dbFake.selectResults.push([seasonPlayer()], [RIVAL()]);
    noOpenRoll();
    await expect(
      activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" }),
    ).rejects.toMatchObject({ code: "ieeTargetProtected" });
  });

  it("refuses a target that is no longer active", async () => {
    holding(instance("hex_scroll"));
    seasons.getSeasonById.mockResolvedValue(targetingOn());
    dbFake.selectResults.push([seasonPlayer()], [seasonPlayer({ id: "sp-2", playerId: "user-2", status: "eliminated" })]);
    noOpenRoll();
    await expect(
      activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" }),
    ).rejects.toMatchObject({ code: "ieeTargetNotActive" });
  });

  it("treats a participant of another season as no valid target", async () => {
    holding(instance("hex_scroll"));
    seasons.getSeasonById.mockResolvedValue(targetingOn());
    dbFake.selectResults.push([seasonPlayer()], [seasonPlayer({ id: "sp-9", playerId: "user-9", seasonId: "season-2" })]);
    noOpenRoll();
    await expect(
      activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-9" }),
    ).rejects.toMatchObject({ code: "ieeTargetNotActive" });
  });

  it("refuses a unique status the target already carries, before spending the charge", async () => {
    holding(instance("jinx"), instance("unlucky", { holderPlayerId: "sp-2" }));
    seasons.getSeasonById.mockResolvedValue(targetingOn());
    dbFake.selectResults.push([seasonPlayer()], [RIVAL()]);
    noOpenRoll();
    username("bob");

    await expect(
      activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" }),
    ).rejects.toMatchObject({ code: "ieeTargetAlreadyAffected" });
    expect(live("inv-1")).toMatchObject({ status: "active", chargesLeft: 1 });
    expect(context.executionContext).not.toHaveBeenCalled();
    expect(eventsInfra.logEvent).not.toHaveBeenCalled();
  });
});

describe("activateInventoryItem — a rival choosing a reaction (wave B, spec §7.4)", () => {
  it("refuses an item aimed at a rival whose reaction window is open: nothing is spent", async () => {
    holding(instance("hex_scroll"));
    seasons.getSeasonById.mockResolvedValue(targetingOn());
    dbFake.selectResults.push([seasonPlayer()], [RIVAL()]);
    noOpenRoll();
    // Asked for the user first (any question), then for the rival's window.
    decisions.hasPendingDecision.mockImplementation(async (id: string, kind?: string) => id === "sp-2" && kind === "reaction_window");

    await expect(activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" })).rejects.toMatchObject({ code: "ieeTargetReacting" });
    expect(decisions.hasPendingDecision).toHaveBeenCalledWith("sp-2", "reaction_window");
    expect(live("inv-1")).toMatchObject({ status: "active", chargesLeft: 1 });
    expect(context.executionContext).not.toHaveBeenCalled();
    decisions.hasPendingDecision.mockImplementation(async () => false);
  });

  it("a reaction item is never used from the inventory", async () => {
    const coin = compileSet([
      {
        entryId: "00000000-0000-4000-8000-000000000777",
        revisionId: "00000000-0000-4000-8000-000000000778",
        doc: {
          dslVersion: 1,
          kind: "item",
          slug: "coin",
          name: { ru: "coin" },
          character: "bonus",
          rarity: "common",
          tags: [],
          usage: { activation: "active", charges: 1, window: "after_dice" },
          rules: [{ when: "onUse", do: [{ op: "reroll" }] }],
        } as EntryDoc,
      },
    ]);
    seasonRegistry.current = buildRegistry(coin);
    const row: IeeInstanceRow = { ...instance("cleansing_salve"), entryId: "00000000-0000-4000-8000-000000000777", revisionId: "00000000-0000-4000-8000-000000000778" };
    holding(row);
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({ code: "ieeItemReactionOnly" });
    expect(live("inv-1")).toMatchObject({ status: "active", chargesLeft: 1 });
  });
});

describe("activateInventoryItem — a choice waits (wave B, spec §7.6)", () => {
  it("refuses any use while the user has a question to answer: nothing is spent", async () => {
    holding(instance("cleansing_salve"), instance("swamp"));
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    decisions.hasPendingDecision.mockResolvedValueOnce(true);

    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({ code: "ieeDecisionPending" });
    expect(decisions.hasPendingDecision).toHaveBeenCalledWith("sp-1");
    expect(live("inv-1")).toMatchObject({ status: "active", chargesLeft: 1 });
    expect(context.executionContext).not.toHaveBeenCalled();
  });

  it("collects what a use asks someone to choose, and announces it once the use has committed", async () => {
    holding(instance("cleansing_salve"), instance("swamp"));
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    username("alice");

    await activateInventoryItem({ inventoryId: "inv-1" });
    const input = context.executionContext.mock.calls[0]![0] as { decisions: unknown[] };
    expect(input.decisions).toEqual([]);
    expect(decisions.announceDecisions).toHaveBeenCalledWith(input.decisions);
  });
});

describe("activateInventoryItem — activation", () => {
  it("cleanses the holder's penalties, spends the item and logs the use", async () => {
    holding(instance("cleansing_salve"), instance("swamp"), instance("tailwind"));
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    username("alice");

    await expect(activateInventoryItem({ inventoryId: "inv-1" })).resolves.toEqual({
      itemKey: "cleansing_salve",
      targetUsername: "alice",
    });

    expect(context.executionContext).toHaveBeenCalledWith(
      expect.objectContaining({
        seasonId: "season-1",
        config: DEFAULT_SEASON_CONFIG.iee,
        registry: REGISTRY,
        actorPlayerId: "sp-1",
        actorUserId: "user-1",
      }),
    );
    expect(live("inv-1")).toMatchObject({ status: "ended", endReason: "used", chargesLeft: 0 });
    expect(live("eff-swamp")).toMatchObject({ status: "ended", endReason: "cleansed" });
    expect(live("eff-tailwind")).toMatchObject({ status: "active" });
    expect(mem.journal.map((j) => j.op)).toEqual(["use", "end"]);
    expect(mem.journal[1]!.causeId).toBe(mem.journal[0]!.id);
    expect(eventsInfra.logEvent).toHaveBeenCalledWith({
      seasonId: "season-1",
      seasonPlayerId: "sp-1",
      eventType: "item_used",
      payload: expect.objectContaining({
        itemKey: "cleansing_salve",
        name: REGISTRY.get("cleansing_salve")!.names,
        targetSeasonPlayerId: "sp-1",
        targetUsername: "alice",
      }),
    });
  });

  it("ignores a target sent to a self-targeted item", async () => {
    holding(instance("cleansing_salve"), instance("swamp"), instance("toll", { holderPlayerId: "sp-2" }));
    dbFake.selectResults.push([seasonPlayer()], [RIVAL()]);
    noOpenRoll();
    username("alice");

    await activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" });

    expect(live("eff-swamp")).toMatchObject({ status: "ended", endReason: "cleansed" });
    expect(live("eff-toll")).toMatchObject({ status: "active" });
  });

  it("grants a self-buff from the holder's next roll, owned by the holder", async () => {
    holding(instance("speed_boots"));
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    username("alice");

    await activateInventoryItem({ inventoryId: "inv-1" });

    const granted = mem.instances.find((i) => i.kind === "effect")!;
    expect(granted).toMatchObject({
      revisionId: REGISTRY.get("tailwind")!.revisionId,
      holderPlayerId: "sp-1",
      ownerPlayerId: "sp-1",
      source: "item",
      anchorRollSeq: 4,
    });
    expect(mem.journal.map((j) => j.op)).toEqual(["use", "grant"]);
    expect(mem.journal[1]).toMatchObject({ causeId: mem.journal[0]!.id, visibility: "staff" });
  });

  it("starts an offensive grant after the victim's game in flight (SC-HEXSCROLL-7)", async () => {
    holding(instance("hex_scroll"));
    seasons.getSeasonById.mockResolvedValue(targetingOn());
    inFlight.add("sp-2");
    dbFake.selectResults.push([seasonPlayer()], [RIVAL()]);
    noOpenRoll();
    username("bob");

    await activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" });

    expect(mem.instances.find((i) => i.kind === "effect")).toMatchObject({
      revisionId: REGISTRY.get("swamp")!.revisionId,
      holderPlayerId: "sp-2",
      ownerPlayerId: "sp-1",
      source: "item",
      anchorRollSeq: 8,
    });
    expect(mem.journal[0]).toMatchObject({ op: "use", actorPlayerId: "sp-1", targetPlayerId: "sp-2" });
    expect(eventsInfra.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ itemKey: "hex_scroll", targetSeasonPlayerId: "sp-2", targetUsername: "bob" }),
      }),
    );
  });

  it("fails the whole use when the guarded charge spend matches nothing", async () => {
    // A second submit raced the first: the read saw a charge, the store has none.
    holding(instance("cleansing_salve"), instance("swamp"));
    mem.instances.find((i) => i.id === "inv-1")!.chargesLeft = 0;
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    username("alice");

    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "ieeItemAlreadyUsed",
    });
    expect(live("eff-swamp")).toMatchObject({ status: "active" });
    expect(eventsInfra.logEvent).not.toHaveBeenCalled();
  });
});

describe("activateInventoryItem — out-of-turn moves (spec §7.3)", () => {
  const TELEPORT: EntryDoc = {
    dslVersion: 1,
    kind: "item",
    slug: "teleport",
    name: { ru: "Телепорт", en: "Teleport" },
    character: "bonus",
    rarity: "rare",
    tags: ["movement"],
    usage: { activation: "active", charges: 1, target: { who: "self" } },
    rules: [{ when: "onUse", do: [{ op: "move", by: 3 }] }],
  };
  const withTeleport = () =>
    buildRegistry(compileSet([...CORE_DOCS, { entryId: "77777777-7777-4777-8777-777777777777", revisionId: "rev-teleport", doc: TELEPORT }]));

  it("moves the holder at once and posts the move after the use, on the holder's line", async () => {
    const registry = withTeleport();
    seasonRegistry.current = registry;
    mem = memoryStore({ balances: { "sp-1": 10 }, positions: { "sp-1": 3, "sp-2": 9 } });
    const def = registry.get("teleport")!;
    holding(instance("cleansing_salve", { entryId: def.entryId, revisionId: def.revisionId, chargesLeft: 1 }));
    context.executionContext.mockImplementation(async (input: ContextInput): Promise<ExecContext> => ({
      store: mem.store,
      seasonId: input.seasonId,
      registry: input.registry ?? registry,
      config: input.config,
      seasonRollSeq: 12,
      actorPlayerId: input.actorPlayerId ?? null,
      actorUserId: input.actorUserId ?? null,
      rng: () => 0.5,
      snapshot: async (id) => ({ seasonPlayerId: id, position: 3, balancePoints: 0, rollSeq: 4, moveCount: 10, rank: 2, status: "active" }),
      anchorFor: async () => ({ anchorRollSeq: 4 }),
      board: async () => ({ size: 40, loop: false, finishAt: 39 }),
    }));
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    username("alice");

    await expect(activateInventoryItem({ inventoryId: "inv-1" })).resolves.toEqual({ itemKey: "teleport", targetUsername: "alice" });

    expect(mem.journal.map((j) => j.op)).toEqual(["use", "move_player"]);
    expect(eventsInfra.logEvent.mock.calls.map(([e]) => [e.eventType, e.seasonPlayerId])).toEqual([
      ["item_used", "sp-1"],
      ["moved_out_of_turn", "sp-1"],
    ]);
    expect(eventsInfra.logEvent.mock.calls[1]![0].payload).toEqual({ from: 3, to: 6, key: "teleport", name: def.names });
  });
});

describe("activateInventoryItem — target filters, picks and unique items (spec §6.10)", () => {
  const MAGNET: EntryDoc = {
    dslVersion: 1,
    kind: "item",
    slug: "magnet",
    name: { ru: "Магнит", en: "Magnet" },
    character: "bonus",
    rarity: "common",
    tags: [],
    usage: { activation: "active", charges: 1, target: { who: "other", filter: "ahead" } },
    rules: [{ when: "onUse", do: [{ op: "balance", amount: -1, to: "target" }] }],
  };
  const withMagnet = () => buildRegistry(compileSet([...CORE_DOCS, { entryId: "77777777-7777-4777-8777-777777777779", revisionId: "rev-magnet", doc: MAGNET }]));

  it("refuses a player the filter does not allow, judged on where everyone stands", async () => {
    const registry = withMagnet();
    seasonRegistry.current = registry;
    seasons.getSeasonById.mockResolvedValue(targetingOn());
    const def = registry.get("magnet")!;
    holding(instance("hex_scroll", { entryId: def.entryId, revisionId: def.revisionId }));
    // The holder on 3, the rival on 1: behind, not ahead.
    dbFake.selectResults.push([seasonPlayer()], [seasonPlayer({ id: "sp-2", playerId: "user-2", position: 1 })]);
    noOpenRoll();
    dbFake.selectResults.push([
      { seasonPlayerId: "sp-1", position: 3, status: "active" },
      { seasonPlayerId: "sp-2", position: 1, status: "active" },
    ]);
    await expect(activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" })).rejects.toMatchObject({
      code: "ieeTargetNotEligible",
    });
    expect(mem.journal).toEqual([]);
  });
});

describe("activateInventoryItem — a pick for the next game (wave C, spec §6.16)", () => {
  // «Вето жанра» (`core`, wave C) asks its user for a genre and hands out «Жанр под вето», which remembers it.
  const holdingVeto = () => {
    holding(instance("genre_veto"));
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
  };

  it("what the form picked is asked of the season's pool, and the effect the use hands its user remembers it", async () => {
    holdingVeto();
    username("alice");
    catalogPick.offeredPick.mockResolvedValue({ genre: "horror" });
    await expect(activateInventoryItem({ inventoryId: "inv-1", pickedGenre: " Horror " })).resolves.toMatchObject({ itemKey: "genre_veto" });
    expect(catalogPick.offeredPick).toHaveBeenCalledWith("sp-1", { genre: "horror" });
    expect(mem.instances.find((i) => i.kind === "effect")).toMatchObject({ holderPlayerId: "sp-1", chosen: { genre: "horror" } });
  });

  it("is refused without a pick, or with one the pool does not offer — nothing is spent", async () => {
    holdingVeto();
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({ code: "ieePickRequired" });
    holdingVeto();
    catalogPick.offeredPick.mockResolvedValue(null);
    await expect(activateInventoryItem({ inventoryId: "inv-1", pickedGenre: "jazz" })).rejects.toMatchObject({ code: "ieePickInvalid" });
    expect(mem.journal).toEqual([]);
    expect(live("inv-1")).toMatchObject({ status: "active", chargesLeft: 1 });
  });
});

describe("activateInventoryItem — a game in flight replaced or set aside (wave C, spec §6.16)", () => {
  const CELESTE = { id: "game-2", title: "Celeste" };
  /** Holds the item, with a game in flight: the player, the window's open roll, the roll replaced and its title. */
  // «Переролл игры» and «Отложенная игра» (`core`, wave C) are used on the game in flight.
  const holdingOnOpenRoll = (slug: "game_reroll" | "postponed_game") => {
    const def = REGISTRY.get(slug)!;
    holding(instance(slug));
    dbFake.selectResults.push([seasonPlayer()]);
    dbFake.selectResults.push([{ id: "roll-1", gameId: "game-1" }]);
    dbFake.selectResults.push([{ id: "roll-1", gameId: "game-1" }]);
    dbFake.selectResults.push([{ title: "Doom" }]);
    username("alice");
    return def;
  };

  beforeEach(() => {
    catalogPick.endRollInFlight.mockResolvedValue(true);
    catalogPick.getPendingRerollForRoll.mockResolvedValue(null);
    catalogPick.getPendingCompletionForRoll.mockResolvedValue(null);
    picking.next = { kind: "game", game: CELESTE, shape: { exclude: [], require: [], favor: [], choice: 0, firings: [] }, relaxed: false, favoured: false, dropped: [] };
    picking.started = { rollId: "roll-2", game: CELESTE, returned: false, choice: null };
  });

  it("«Переролл игры»: the roll in flight ends, the next game starts in the use's transaction, the feed names the item", async () => {
    const def = holdingOnOpenRoll("game_reroll");
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).resolves.toMatchObject({ itemKey: "game_reroll" });
    expect(catalogPick.endRollInFlight).toHaveBeenCalledWith({ marker: "tx" }, "roll-1", null);
    expect(pickMod.startNextGame).toHaveBeenCalledWith({ marker: "tx" }, expect.objectContaining({ id: "sp-1" }), expect.any(Object), picking.next, {
      origin: "reroll",
      replacedRollId: "roll-1",
      item: { key: "game_reroll", names: def.names },
      decisions: [],
    });
    expect(live("inv-1")).toMatchObject({ status: "ended" });
    expect(eventsInfra.logEvent.mock.calls.map((c) => c[0].eventType)).toEqual(["item_used", "game_rerolled"]);
    expect(eventsInfra.logEvent.mock.calls[1]![0].payload).toEqual({
      oldGameId: "game-1",
      newGameId: "game-2",
      title: "Celeste",
      itemKey: "game_reroll",
      name: def.names,
    });
  });

  it("«Отложенная игра»: the game is set aside until the pick it comes back on, and the feed says when", async () => {
    const def = holdingOnOpenRoll("postponed_game");
    await activateInventoryItem({ inventoryId: "inv-1" });
    // Four rolls behind them: the game picked now is the fifth, the set-aside one comes back on the sixth.
    expect(catalogPick.endRollInFlight).toHaveBeenCalledWith({ marker: "tx" }, "roll-1", 5);
    expect(pickMod.startNextGame).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), picking.next, expect.objectContaining({ origin: "postpone" }));
    expect(eventsInfra.logEvent.mock.calls[1]![0]).toMatchObject({
      eventType: "game_postponed",
      payload: { gameId: "game-1", title: "Doom", afterRolls: 2, comesBackOn: 6, itemKey: "postponed_game", name: def.names, newGameId: "game-2", newTitle: "Celeste" },
    });
  });

  it("a choice the user's rules ask for opens instead of a new game", async () => {
    holdingOnOpenRoll("game_reroll");
    picking.started = { rollId: null, game: null, returned: false, choice: { decisionId: "d-1", offered: 3 } };
    await activateInventoryItem({ inventoryId: "inv-1" });
    expect(eventsInfra.logEvent.mock.calls[1]![0].payload).toMatchObject({ newGameId: null, title: null, choosing: 3 });
  });

  it.each([
    ["a reroll the judge has", "getPendingRerollForRoll", "gameRerollPending"],
    ["a completion the judge has", "getPendingCompletionForRoll", "gameCompletionPending"],
  ] as const)("is refused while %s — nothing is spent", async (_what, fn, code) => {
    holdingOnOpenRoll("game_reroll");
    catalogPick[fn].mockResolvedValue({ id: "req-1" } as never);
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({ code });
    expect(live("inv-1")).toMatchObject({ status: "active", chargesLeft: 1 });
    expect(catalogPick.endRollInFlight).not.toHaveBeenCalled();
  });

  it("is refused when the pool has no game to pick — nothing is spent", async () => {
    holdingOnOpenRoll("game_reroll");
    picking.next = { kind: "none", reason: "all_played" };
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({ code: "catalogAllPlayed" });
    expect(live("inv-1")).toMatchObject({ status: "active", chargesLeft: 1 });
  });

  it("a roll resolved meanwhile fails the whole use", async () => {
    holdingOnOpenRoll("game_reroll");
    catalogPick.endRollInFlight.mockResolvedValue(false);
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({ code: "gameRollAlreadyResolved" });
    expect(pickMod.startNextGame).not.toHaveBeenCalled();
    expect(eventsInfra.logEvent).not.toHaveBeenCalled();
  });

  it("is used on an open roll only: without one the window refuses it before anything is picked", async () => {
    holding(instance("game_reroll"));
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({ code: "ieeItemWrongWindow" });
    expect(pickMod.pickNextGame).not.toHaveBeenCalled();
  });
});

describe("searchPickGames — the games a pick may take, for the dashboard's picker (wave C, spec §6.16)", () => {
  // «Любимчик» (`core`, wave C) asks its user for a game.
  const holdingFavourite = () => {
    holding(instance("favourite"));
  };

  it("lists the pool's games by title for the holder of an item that asks for a game", async () => {
    holdingFavourite();
    dbFake.selectResults.push([seasonPlayer()]);
    await expect(searchPickGames("inv-1", "  cel  ")).resolves.toEqual([{ id: "g-1", title: "Celeste" }]);
    expect(catalogPick.pickGames).toHaveBeenCalledWith("sp-1", "cel", 30);
  });

  it("is the holder's alone, and an item that asks for no game offers none", async () => {
    holdingFavourite();
    dbFake.selectResults.push([seasonPlayer({ playerId: "user-2" })]);
    await expect(searchPickGames("inv-1", "")).rejects.toMatchObject({ code: "gameNotAllowed" });
    holding(instance("cleansing_salve"));
    dbFake.selectResults.push([seasonPlayer()]);
    await expect(searchPickGames("inv-1", "")).resolves.toEqual([]);
    session.getCurrentUser.mockResolvedValueOnce(null);
    await expect(searchPickGames("inv-1", "")).rejects.toMatchObject({ code: "gameLoginRequired" });
    await expect(searchPickGames("inv-404", "")).rejects.toMatchObject({ code: "ieeItemNotFound" });
  });
});

describe("pickRequestOf — what the form picked for the next game (wave C, spec §6.16)", () => {
  it("a genre in lowercase, a decade by its first year or by both, a game by its id — the first one sent", () => {
    expect(pickRequestOf({ pickedGenre: " Horror " })).toEqual({ genre: "horror" });
    expect(pickRequestOf({ pickedYears: "1990" })).toEqual({ years: [1990, 1999] });
    expect(pickRequestOf({ pickedYears: "1990 – 1999" })).toEqual({ years: [1990, 1999] });
    // Whether it is a decade the pool has is the pool's to say.
    expect(pickRequestOf({ pickedYears: "1990-1995" })).toEqual({ years: [1990, 1995] });
    expect(pickRequestOf({ pickedYears: "nineties" })).toBeNull();
    expect(pickRequestOf({ pickedGameId: " game-1 " })).toEqual({ gameId: "game-1" });
    expect(pickRequestOf({ pickedGenre: "rpg", pickedGameId: "game-1" })).toEqual({ genre: "rpg" });
    expect(pickRequestOf({ pickedGenre: "  ", pickedYears: null })).toBeNull();
  });

  it("a cell an item places itself on, by its number (wave D, spec §6.18)", () => {
    expect(pickRequestOf({ pickedCell: " 14 " })).toEqual({ cell: 14 });
    expect(pickRequestOf({ pickedCell: "0" })).toEqual({ cell: 0 });
    expect(pickRequestOf({ pickedCell: "-3" })).toBeNull();
    expect(pickRequestOf({ pickedCell: "1e2" })).toBeNull();
    expect(pickRequestOf({ pickedCell: "", pickedGenre: "rpg" })).toEqual({ genre: "rpg" });
  });
});

describe("activateInventoryItem — an object on the board (wave D, spec §6.18)", () => {
  // `core`'s «Мина» (wave D): an active item placed on the cell its user picks.
  const holdingMine = () => {
    const registry = buildRegistry(compileSet(CORE_DOCS));
    seasonRegistry.current = registry;
    const def = registry.get("mine")!;
    // The mine in place of the salve every test starts with.
    mem = memoryStore({ balances: { "sp-1": 10, "sp-2": 5 } });
    holding(instance("cleansing_salve", { entryId: def.entryId, revisionId: def.revisionId, chargesLeft: 1 }));
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    return def;
  };

  it("the cell picked is the board's to offer: the item stands there, its use posted, then the object", async () => {
    const def = holdingMine();
    username("alice");
    objectsMod.offeredCell.mockResolvedValue({ cell: 14 });
    await expect(activateInventoryItem({ inventoryId: "inv-1", pickedCell: "14" })).resolves.toEqual({ itemKey: "mine", targetUsername: "alice" });
    expect(objectsMod.offeredCell).toHaveBeenCalledWith("season-1", 14);
    expect(repo.listActiveObjects).toHaveBeenCalledWith("season-1");
    const object = mem.instances.find((i) => i.kind === "board_object");
    expect(object).toMatchObject({ holderKind: "cell", holderCellIndex: 14, ownerPlayerId: "sp-1", revisionId: def.revisionId, status: "active" });
    expect(live("inv-1")).toMatchObject({ status: "ended" });
    expect(mem.journal.map((j) => j.op)).toEqual(["use", "place"]);
    expect(eventsInfra.logEvent.mock.calls.map(([e]) => [e.eventType, e.seasonPlayerId])).toEqual([
      ["item_used", "sp-1"],
      ["object_placed", "sp-1"],
    ]);
    expect(eventsInfra.logEvent.mock.calls[1]![0].payload).toEqual({ itemKey: "mine", name: def.names, instanceId: object!.id, cell: 14 });
  });

  it("is refused without a cell, on a cell the board does not offer, or past the objects one may have — nothing is spent", async () => {
    holdingMine();
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({ code: "ieePickRequired" });
    holdingMine();
    await expect(activateInventoryItem({ inventoryId: "inv-1", pickedGenre: "rpg" })).rejects.toMatchObject({ code: "ieePickRequired" });
    holdingMine();
    objectsMod.offeredCell.mockResolvedValue(null);
    await expect(activateInventoryItem({ inventoryId: "inv-1", pickedCell: "0" })).rejects.toMatchObject({ code: "ieeCellUnavailable" });
    holdingMine();
    objectsMod.offeredCell.mockResolvedValue({ cell: 14 });
    repo.listActiveObjects.mockResolvedValue([{ ownerPlayerId: "sp-1" }, { ownerPlayerId: "sp-2" }, { ownerPlayerId: "sp-1" }]);
    await expect(activateInventoryItem({ inventoryId: "inv-1", pickedCell: "14" })).rejects.toMatchObject({ code: "ieeObjectLimit" });
    expect(mem.journal).toEqual([]);
    expect(live("inv-1")).toMatchObject({ status: "active", chargesLeft: 1 });
    expect(mem.instances.some((i) => i.kind === "board_object")).toBe(false);
  });
});
