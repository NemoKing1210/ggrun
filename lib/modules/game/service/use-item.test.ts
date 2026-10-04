import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerInventoryRow, Season, SeasonPlayer, User } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, type SeasonConfig } from "@/lib/engine";

import { activateInventoryItem } from "./use-item";

/** Minimal thenable Drizzle stand-in that records writes and replays queued reads. */
const dbFake = vi.hoisted(() => {
  interface Chain {
    from(...args: unknown[]): Chain;
    where(...args: unknown[]): Chain;
    orderBy(...args: unknown[]): Chain;
    limit(...args: unknown[]): Chain;
    set(values: Record<string, unknown>): Chain;
    values(values: Record<string, unknown>): Chain;
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
  cleanseEffects: vi.fn(),
  consumeItemCharge: vi.fn(),
  getInventoryItem: vi.fn(),
  getMoveCount: vi.fn(),
  getSeasonRollSeq: vi.fn(),
}));
vi.mock("@/lib/modules/iee/repository", () => repo);

const grants = vi.hoisted(() => ({
  grantEffect: vi.fn(),
  grantInventoryItem: vi.fn(),
  hasActiveEffect: vi.fn(),
}));
vi.mock("./grant", () => grants);

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

function inventoryRow(overrides: Partial<PlayerInventoryRow> = {}): PlayerInventoryRow {
  return {
    id: "inv-1",
    seasonId: "season-1",
    seasonPlayerId: "sp-1",
    itemKey: "cleansing_salve",
    params: {},
    chargesLeft: 1,
    state: "held",
    source: "cell_bonus",
    seasonRollSeq: 12,
    sourceMoveId: null,
    acquiredAt: new Date(0),
    usedAt: null,
    ...overrides,
  } as PlayerInventoryRow;
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
  dbFake.reset();
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue(ACTOR);
  seasons.getSeasonById.mockResolvedValue(season());
  repo.getInventoryItem.mockResolvedValue(inventoryRow());
  repo.consumeItemCharge.mockResolvedValue(inventoryRow());
  repo.getMoveCount.mockResolvedValue(10);
  repo.getSeasonRollSeq.mockResolvedValue(12);
  repo.cleanseEffects.mockResolvedValue(1);
  grants.grantEffect.mockResolvedValue({ state: "granted" });
  grants.grantInventoryItem.mockResolvedValue(null);
  grants.hasActiveEffect.mockResolvedValue(false);
  eventsInfra.logEvent.mockResolvedValue(undefined);
});

describe("activateInventoryItem — guards", () => {
  it("refuses a guest before loading anything", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "gameLoginRequired",
    });
    expect(repo.getInventoryItem).not.toHaveBeenCalled();
  });

  it("refuses an unknown inventory row", async () => {
    repo.getInventoryItem.mockResolvedValue(null);
    await expect(activateInventoryItem({ inventoryId: "inv-404" })).rejects.toMatchObject({
      code: "ieeItemNotFound",
    });
  });

  it("refuses an item that was already used", async () => {
    repo.getInventoryItem.mockResolvedValue(inventoryRow({ state: "used" }));
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "ieeItemAlreadyUsed",
    });
  });

  it("refuses an item with no charges left", async () => {
    repo.getInventoryItem.mockResolvedValue(inventoryRow({ chargesLeft: 0 }));
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

  it("refuses an item key with no catalog definition", async () => {
    repo.getInventoryItem.mockResolvedValue(inventoryRow({ itemKey: "ghost_item" }));
    dbFake.selectResults.push([seasonPlayer()]);
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "ieeItemNotFound",
    });
  });
});

describe("activateInventoryItem — targeting windows", () => {
  it("refuses a before-roll item while the player has a game in flight", async () => {
    repo.getInventoryItem.mockResolvedValue(inventoryRow({ itemKey: "lodestone" }));
    dbFake.selectResults.push([seasonPlayer()]);
    openRoll();
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "ieeItemWrongWindow",
    });
    expect(repo.consumeItemCharge).not.toHaveBeenCalled();
  });

  it("requires a target for an offensive item", async () => {
    repo.getInventoryItem.mockResolvedValue(inventoryRow({ itemKey: "hex_scroll" }));
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "ieeTargetRequired",
    });
  });

  it("refuses aiming an other-target item at yourself", async () => {
    repo.getInventoryItem.mockResolvedValue(inventoryRow({ itemKey: "hex_scroll" }));
    dbFake.selectResults.push([seasonPlayer()]);
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    await expect(
      activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-1" }),
    ).rejects.toMatchObject({ code: "ieeTargetSelfNotAllowed" });
  });

  it("refuses targeting others when the season disables it", async () => {
    repo.getInventoryItem.mockResolvedValue(inventoryRow({ itemKey: "hex_scroll" }));
    dbFake.selectResults.push([seasonPlayer()]);
    dbFake.selectResults.push([seasonPlayer({ id: "sp-2", playerId: "user-2" })]);
    noOpenRoll();
    await expect(
      activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" }),
    ).rejects.toMatchObject({ code: "ieeTargetingDisabled" });
  });

  it("refuses a target still inside the PvP protection window", async () => {
    repo.getInventoryItem.mockResolvedValue(inventoryRow({ itemKey: "hex_scroll" }));
    seasons.getSeasonById.mockResolvedValue(
      season({ iee: { ...DEFAULT_SEASON_CONFIG.iee, allowTargetingOthers: true } }),
    );
    repo.getMoveCount.mockImplementation(async (id: string) => (id === "sp-2" ? 0 : 10));
    dbFake.selectResults.push([seasonPlayer()]);
    dbFake.selectResults.push([seasonPlayer({ id: "sp-2", playerId: "user-2" })]);
    noOpenRoll();
    await expect(
      activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" }),
    ).rejects.toMatchObject({ code: "ieeTargetProtected" });
  });

  it("refuses a target that is no longer active", async () => {
    repo.getInventoryItem.mockResolvedValue(inventoryRow({ itemKey: "hex_scroll" }));
    seasons.getSeasonById.mockResolvedValue(
      season({ iee: { ...DEFAULT_SEASON_CONFIG.iee, allowTargetingOthers: true } }),
    );
    dbFake.selectResults.push([seasonPlayer()]);
    dbFake.selectResults.push([seasonPlayer({ id: "sp-2", playerId: "user-2", status: "eliminated" })]);
    noOpenRoll();
    await expect(
      activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" }),
    ).rejects.toMatchObject({ code: "ieeTargetNotActive" });
  });

  it("refuses a unique status the target already carries, before spending the charge", async () => {
    repo.getInventoryItem.mockResolvedValue(inventoryRow({ itemKey: "jinx" }));
    seasons.getSeasonById.mockResolvedValue(
      season({ iee: { ...DEFAULT_SEASON_CONFIG.iee, allowTargetingOthers: true } }),
    );
    dbFake.selectResults.push([seasonPlayer()]);
    dbFake.selectResults.push([seasonPlayer({ id: "sp-2", playerId: "user-2" })]);
    noOpenRoll();
    username("bob");
    grants.hasActiveEffect.mockResolvedValue(true);

    await expect(
      activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" }),
    ).rejects.toMatchObject({ code: "ieeTargetAlreadyAffected" });
    expect(repo.consumeItemCharge).not.toHaveBeenCalled();
    expect(eventsInfra.logEvent).not.toHaveBeenCalled();
  });
});

describe("activateInventoryItem — activation", () => {
  it("cleanses the holder's negative statuses and logs the use", async () => {
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    username("alice");

    await expect(activateInventoryItem({ inventoryId: "inv-1" })).resolves.toEqual({
      itemKey: "cleansing_salve",
      targetUsername: "alice",
    });

    expect(repo.consumeItemCharge).toHaveBeenCalledWith("inv-1", dbFake.db);
    expect(repo.cleanseEffects).toHaveBeenCalledWith("sp-1", { polarity: "negative" }, dbFake.db);
    expect(eventsInfra.logEvent).toHaveBeenCalledWith({
      seasonId: "season-1",
      seasonPlayerId: "sp-1",
      eventType: "item_used",
      payload: expect.objectContaining({
        itemKey: "cleansing_salve",
        targetSeasonPlayerId: "sp-1",
        targetUsername: "alice",
      }),
    });
  });

  it("ignores a target sent to a self-targeted item", async () => {
    dbFake.selectResults.push([seasonPlayer()]);
    dbFake.selectResults.push([seasonPlayer({ id: "sp-2", playerId: "user-2" })]);
    noOpenRoll();
    username("alice");

    await activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" });

    expect(repo.cleanseEffects).toHaveBeenCalledWith("sp-1", { polarity: "negative" }, dbFake.db);
    expect(grants.grantEffect).not.toHaveBeenCalled();
  });

  it("grants a self-buff anchored to the holder's finished roll", async () => {
    repo.getInventoryItem.mockResolvedValue(inventoryRow({ itemKey: "lodestone" }));
    dbFake.selectResults.push([seasonPlayer({ rollSeq: 4 })]);
    noOpenRoll();
    username("alice");
    noOpenRoll();

    await activateInventoryItem({ inventoryId: "inv-1" });

    expect(grants.grantEffect).toHaveBeenCalledWith(
      dbFake.db,
      expect.objectContaining({
        seasonId: "season-1",
        seasonPlayerId: "sp-1",
        effectKey: "tailwind",
        anchorRollSeq: 4,
        seasonRollSeq: 12,
        source: "item",
        appliedBySeasonPlayerId: "sp-1",
      }),
    );
  });

  it("pushes an offensive grant one roll out when the victim has a game in flight", async () => {
    repo.getInventoryItem.mockResolvedValue(inventoryRow({ itemKey: "hex_scroll" }));
    seasons.getSeasonById.mockResolvedValue(
      season({ iee: { ...DEFAULT_SEASON_CONFIG.iee, allowTargetingOthers: true } }),
    );
    dbFake.selectResults.push([seasonPlayer()]);
    dbFake.selectResults.push([seasonPlayer({ id: "sp-2", playerId: "user-2", rollSeq: 7 })]);
    noOpenRoll();
    username("bob");
    openRoll();

    await activateInventoryItem({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" });

    expect(grants.grantEffect).toHaveBeenCalledWith(
      dbFake.db,
      expect.objectContaining({
        seasonPlayerId: "sp-2",
        effectKey: "slowed",
        anchorRollSeq: 8,
        source: "item",
        appliedBySeasonPlayerId: "sp-1",
      }),
    );
    expect(eventsInfra.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ targetSeasonPlayerId: "sp-2", targetUsername: "bob" }),
      }),
    );
  });

  it("fails the whole use when the guarded charge spend matches nothing", async () => {
    dbFake.selectResults.push([seasonPlayer()]);
    noOpenRoll();
    username("alice");
    repo.consumeItemCharge.mockResolvedValue(null);

    await expect(activateInventoryItem({ inventoryId: "inv-1" })).rejects.toMatchObject({
      code: "ieeItemAlreadyUsed",
    });
    expect(repo.cleanseEffects).not.toHaveBeenCalled();
    expect(eventsInfra.logEvent).not.toHaveBeenCalled();
  });
});
