import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SeasonPlayer } from "@/db/schema";

import {
  countActivePlayers,
  getMoveCount,
  getPlayerRank,
  getSeasonRollSeq,
  listTargetOptions,
  loadPoolContext,
  toPlayerSnapshot,
} from "./counters";

/** Minimal thenable Drizzle stand-in: `select()` resolves the next queued rows. */
const dbFake = vi.hoisted(() => {
  interface Chain {
    from(...args: unknown[]): Chain;
    where(...args: unknown[]): Chain;
    orderBy(...args: unknown[]): Chain;
    limit(...args: unknown[]): Chain;
    innerJoin(...args: unknown[]): Chain;
    then(onFulfilled: (rows: unknown[]) => unknown): Promise<unknown>;
  }
  const selectResults: unknown[][] = [];
  function chain(resolve: () => unknown[]): Chain {
    const c: Chain = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      innerJoin: () => c,
      then: (onFulfilled) => Promise.resolve(resolve()).then(onFulfilled),
    };
    return c;
  }
  return {
    db: { select: () => chain(() => selectResults.shift() ?? []) },
    selectResults,
    reset: () => {
      selectResults.length = 0;
    },
  };
});
vi.mock("@/lib/infrastructure/db", () => ({ db: dbFake.db }));

const effects = vi.hoisted(() => ({
  countEffectsPerPlayer: vi.fn(),
  countEffectsPerSeason: vi.fn(),
  getActiveEffectRows: vi.fn(),
  lastEffectDropSeq: vi.fn(),
}));
vi.mock("./effects", () => effects);

const inventory = vi.hoisted(() => ({
  countHeldItems: vi.fn(),
  countItemsPerPlayer: vi.fn(),
  countItemsPerSeason: vi.fn(),
  lastItemDropSeq: vi.fn(),
}));
vi.mock("./inventory", () => inventory);

function seasonPlayer(overrides: Partial<SeasonPlayer> = {}): SeasonPlayer {
  return {
    id: "sp-1",
    seasonId: "season-1",
    playerId: "user-1",
    position: 3,
    balancePoints: 12,
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

beforeEach(() => {
  dbFake.reset();
  for (const fn of Object.values(effects)) fn.mockReset();
  for (const fn of Object.values(inventory)) fn.mockReset();
});

describe("season counters", () => {
  it("sums the participants' resolved rolls", async () => {
    dbFake.selectResults.push([{ n: 42 }]);
    await expect(getSeasonRollSeq("season-1")).resolves.toBe(42);
  });

  it("reports a zero clock when no row comes back", async () => {
    dbFake.selectResults.push([]);
    await expect(getSeasonRollSeq("season-1")).resolves.toBe(0);
  });

  it("counts active participants", async () => {
    dbFake.selectResults.push([{ n: 7 }]);
    await expect(countActivePlayers("season-1")).resolves.toBe(7);
  });

  it("reports no active participants when the query returns nothing", async () => {
    dbFake.selectResults.push([]);
    await expect(countActivePlayers("season-1")).resolves.toBe(0);
  });
});

describe("getPlayerRank", () => {
  it("is one plus the players ahead on the board", async () => {
    dbFake.selectResults.push([{ n: 4 }]);
    await expect(getPlayerRank("season-1", 3)).resolves.toBe(5);
  });

  it("makes the leader rank 1", async () => {
    dbFake.selectResults.push([{ n: 0 }]);
    await expect(getPlayerRank("season-1", 9)).resolves.toBe(1);
  });
});

describe("getMoveCount", () => {
  it("counts the participant's moves", async () => {
    dbFake.selectResults.push([{ n: 6 }]);
    await expect(getMoveCount("sp-1")).resolves.toBe(6);
  });

  it("reports zero moves for a newcomer", async () => {
    dbFake.selectResults.push([]);
    await expect(getMoveCount("sp-1")).resolves.toBe(0);
  });
});

describe("toPlayerSnapshot", () => {
  it("carries the row plus the rank and move history the guards need", async () => {
    dbFake.selectResults.push([{ n: 2 }], [{ n: 5 }]);
    await expect(toPlayerSnapshot(seasonPlayer())).resolves.toEqual({
      seasonPlayerId: "sp-1",
      position: 3,
      balancePoints: 12,
      rollSeq: 4,
      moveCount: 5,
      rank: 3,
      status: "active",
    });
  });
});

describe("loadPoolContext", () => {
  it("merges the item and effect counters under their shared keys", async () => {
    inventory.countItemsPerSeason.mockResolvedValue({ hex_scroll: 1 });
    effects.countEffectsPerSeason.mockResolvedValue({ shield: 2 });
    inventory.countItemsPerPlayer.mockResolvedValue({ hex_scroll: 1 });
    effects.countEffectsPerPlayer.mockResolvedValue({ shield: 1 });
    inventory.lastItemDropSeq.mockResolvedValue({ hex_scroll: 3 });
    effects.lastEffectDropSeq.mockResolvedValue({ shield: 4 });
    effects.getActiveEffectRows.mockResolvedValue([{ effectKey: "shield" }, { effectKey: "slowed" }]);
    inventory.countHeldItems.mockResolvedValue(2);
    dbFake.selectResults.push([{ n: 9 }], [{ n: 3 }], [{ n: 1 }], [{ n: 7 }]);

    const ctx = await loadPoolContext(seasonPlayer());

    expect(ctx.counters.perSeason).toEqual({ hex_scroll: 1, shield: 2 });
    expect(ctx.counters.perPlayer).toEqual({ hex_scroll: 1, shield: 1 });
    expect(ctx.counters.lastDropRollSeq).toEqual({ hex_scroll: 3, shield: 4 });
    expect(ctx.activeEffectKeys).toEqual(["shield", "slowed"]);
    expect(ctx.heldItemCount).toBe(2);
    expect(ctx.seasonRollSeq).toBe(9);
    expect(ctx.playerCount).toBe(3);
  });

  it("lets the effect counters win a key both pools happen to share", async () => {
    inventory.countItemsPerSeason.mockResolvedValue({ shared: 1 });
    effects.countEffectsPerSeason.mockResolvedValue({ shared: 2 });
    inventory.countItemsPerPlayer.mockResolvedValue({});
    effects.countEffectsPerPlayer.mockResolvedValue({});
    inventory.lastItemDropSeq.mockResolvedValue({});
    effects.lastEffectDropSeq.mockResolvedValue({});
    effects.getActiveEffectRows.mockResolvedValue([]);
    inventory.countHeldItems.mockResolvedValue(0);
    dbFake.selectResults.push([{ n: 0 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }]);

    const ctx = await loadPoolContext(seasonPlayer());
    expect(ctx.counters.perSeason).toEqual({ shared: 2 });
  });

  it("builds the player snapshot from the same round of queries", async () => {
    inventory.countItemsPerSeason.mockResolvedValue({});
    effects.countEffectsPerSeason.mockResolvedValue({});
    inventory.countItemsPerPlayer.mockResolvedValue({});
    effects.countEffectsPerPlayer.mockResolvedValue({});
    inventory.lastItemDropSeq.mockResolvedValue({});
    effects.lastEffectDropSeq.mockResolvedValue({});
    effects.getActiveEffectRows.mockResolvedValue([]);
    inventory.countHeldItems.mockResolvedValue(0);
    dbFake.selectResults.push([{ n: 11 }], [{ n: 2 }], [{ n: 1 }], [{ n: 4 }]);

    const ctx = await loadPoolContext(seasonPlayer());
    expect(ctx.player).toEqual({
      seasonPlayerId: "sp-1",
      position: 3,
      balancePoints: 12,
      rollSeq: 4,
      moveCount: 4,
      rank: 2,
      status: "active",
    });
  });
});

describe("listTargetOptions", () => {
  const rows = [
    { seasonPlayerId: "sp-1", position: 1, username: "alice", displayName: null, avatarUrl: null, moves: 5 },
    { seasonPlayerId: "sp-2", position: 2, username: "bob", displayName: "Bob", avatarUrl: "u.png", moves: 3 },
    { seasonPlayerId: "sp-3", position: 3, username: "carol", displayName: null, avatarUrl: null, moves: 1 },
  ];

  it("excludes the chooser from their own target list", async () => {
    dbFake.selectResults.push(rows);
    const options = await listTargetOptions("season-1", "sp-1", 3);
    expect(options.map((o) => o.seasonPlayerId)).toEqual(["sp-2", "sp-3"]);
  });

  it("marks a target as targetable exactly at the protection boundary", async () => {
    dbFake.selectResults.push(rows);
    const options = await listTargetOptions("season-1", "sp-1", 3);
    expect(options[0]).toMatchObject({ seasonPlayerId: "sp-2", targetable: true });
    expect(options[1]).toMatchObject({ seasonPlayerId: "sp-3", targetable: false });
  });

  it("protects nobody when the window is zero", async () => {
    dbFake.selectResults.push(rows);
    const options = await listTargetOptions("season-1", "neither", 0);
    expect(options.every((o) => o.targetable)).toBe(true);
  });

  it("carries the identity fields the picker renders", async () => {
    dbFake.selectResults.push(rows);
    const options = await listTargetOptions("season-1", "sp-1", 0);
    expect(options[0]).toEqual({
      seasonPlayerId: "sp-2",
      username: "bob",
      displayName: "Bob",
      avatarUrl: "u.png",
      position: 2,
      targetable: true,
    });
  });

  it("returns nothing when the season has no other active players", async () => {
    dbFake.selectResults.push([]);
    await expect(listTargetOptions("season-1", "sp-1", 3)).resolves.toEqual([]);
  });
});
