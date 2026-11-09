import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IeeInstanceRow, SeasonPlayer } from "@/db/schema";

import { coreRegistry, type SeasonRegistry } from "../registry";

import {
  countActivePlayers,
  countPlayersBehind,
  getMoveCount,
  getSeasonPlayerRow,
  hasOpenRoll,
  getPlayerRank,
  getSeasonRollSeq,
  listTargetOptions,
  loadPoolContext,
  toPlayerSnapshot,
  snapshotsOf,
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

const instances = vi.hoisted(() => ({
  listActiveInstances: vi.fn(),
  poolCounters: vi.fn(),
}));
vi.mock("./instances", () => instances);

const REGISTRY = coreRegistry();

/** A live instance of a core entry, as the instances reader returns it. */
function live(key: string, overrides: Partial<IeeInstanceRow> = {}): IeeInstanceRow {
  const def = REGISTRY.get(key)!;
  return {
    id: `inst-${key}`,
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
    params: {},
    chargesLeft: def.kind === "item" ? 1 : null,
    remaining: def.kind === "effect" ? 1 : null,
    remainingUnit: def.kind === "effect" ? "rolls" : null,
    anchorRollSeq: null,
    countFromRollSeq: null,
    status: "active",
    endReason: null,
    source: "cell_bonus",
    sourceMoveId: null,
    causeJournalId: null,
    grantedRollSeq: 0,
    grantedAt: new Date(0),
    endedAt: null,
    ...overrides,
  };
}

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
  for (const fn of Object.values(instances)) fn.mockReset();
  instances.poolCounters.mockResolvedValue({ perSeason: {}, perPlayer: {}, lastDropRollSeq: {} });
  instances.listActiveInstances.mockResolvedValue([]);
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

describe("participant lookups for the executor", () => {
  it("reads a participant row, or null", async () => {
    const row = seasonPlayer();
    dbFake.selectResults.push([row], []);
    await expect(getSeasonPlayerRow("sp-1")).resolves.toBe(row);
    await expect(getSeasonPlayerRow("ghost")).resolves.toBeNull();
  });

  it("knows whether a game is in flight", async () => {
    dbFake.selectResults.push([{ id: "roll-1" }], []);
    await expect(hasOpenRoll("sp-1")).resolves.toBe(true);
    await expect(hasOpenRoll("sp-1")).resolves.toBe(false);
  });
});

describe("countPlayersBehind", () => {
  it("counts the active rivals behind a cell, and none when no row comes back", async () => {
    dbFake.selectResults.push([{ n: 2 }], []);
    await expect(countPlayersBehind("season-1", "sp-1", 12)).resolves.toBe(2);
    await expect(countPlayersBehind("season-1", "sp-1", 12)).resolves.toBe(0);
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
    // Rank, moves, rivals behind, the last move's dice.
    dbFake.selectResults.push([{ n: 2 }], [{ n: 5 }], [{ n: 1 }], [{ dice: [4, 2] }]);
    await expect(toPlayerSnapshot(seasonPlayer())).resolves.toEqual({
      seasonPlayerId: "sp-1",
      position: 3,
      balancePoints: 12,
      rollSeq: 4,
      moveCount: 5,
      rank: 3,
      behind: 1,
      lastRoll: 6,
      status: "active",
    });
  });

  it("knows no last roll before the first move (wave A, «Магнит»)", async () => {
    dbFake.selectResults.push([{ n: 0 }], [{ n: 0 }], [{ n: 0 }], []);
    await expect(toPlayerSnapshot(seasonPlayer())).resolves.toMatchObject({ rank: 1, behind: 0, lastRoll: null });
  });
});

describe("snapshotsOf", () => {
  it("reads where each remembered player stands, once each (spec §6.11)", async () => {
    dbFake.selectResults.push([seasonPlayer()], [{ n: 0 }], [{ n: 3 }], [{ n: 2 }], [{ dice: [5] }]);
    const snapshots = await snapshotsOf(["sp-1", "sp-1"]);
    expect([...snapshots.keys()]).toEqual(["sp-1"]);
    expect(snapshots.get("sp-1")).toMatchObject({ rank: 1, behind: 2, lastRoll: 5 });
  });

  it("asks nothing for nobody", async () => {
    await expect(snapshotsOf([])).resolves.toEqual(new Map());
    expect(dbFake.selectResults).toEqual([]);
  });
});

describe("loadPoolContext", () => {
  it("passes the wheel's counters through, keyed by entry key", async () => {
    const counters = { perSeason: { hex_scroll: 1, ward: 2 }, perPlayer: { ward: 1 }, lastDropRollSeq: { ward: 4 } };
    instances.poolCounters.mockResolvedValue(counters);
    dbFake.selectResults.push([{ n: 9 }], [{ n: 3 }], [{ n: 1 }], [{ n: 7 }]);

    const ctx = await loadPoolContext(seasonPlayer(), REGISTRY);

    expect(instances.poolCounters).toHaveBeenCalledWith("season-1", "sp-1", REGISTRY);
    expect(ctx.counters).toBe(counters);
    expect(ctx.seasonRollSeq).toBe(9);
    expect(ctx.playerCount).toBe(3);
  });

  it("names the statuses in force and counts the bonus items held", async () => {
    instances.listActiveInstances.mockResolvedValue([
      live("ward"),
      live("swamp"),
      live("hex_scroll", { id: "inv-1" }),
      live("speed_boots", { id: "inv-2" }),
    ]);
    dbFake.selectResults.push([{ n: 0 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }]);

    const ctx = await loadPoolContext(seasonPlayer(), REGISTRY);
    expect(instances.listActiveInstances).toHaveBeenCalledWith("sp-1");
    expect(ctx.activeEffectKeys).toEqual(["ward", "swamp"]);
    expect(ctx.heldItemCount).toBe(2);
    // Every active instance counts towards its tags, items and effects alike.
    expect(ctx.activeTagCounts).toEqual({ protection: 1, movement: 2, directed: 1 });
  });

  it("does not let a planted penalty item fill the bonus inventory cap", async () => {
    const hex = REGISTRY.get("hex_scroll")!;
    const cursed = { ...hex, key: "cursed_scroll", revisionId: "rev-cursed", character: "penalty" as const };
    const registry: SeasonRegistry = {
      ...REGISTRY,
      get: (ref) => (ref === "rev-cursed" ? cursed : REGISTRY.get(ref)),
    };
    instances.listActiveInstances.mockResolvedValue([
      live("hex_scroll", { id: "inv-1" }),
      live("hex_scroll", { id: "inv-2", revisionId: "rev-cursed" }),
    ]);
    dbFake.selectResults.push([{ n: 0 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }]);

    const ctx = await loadPoolContext(seasonPlayer(), registry);
    expect(ctx.heldItemCount).toBe(1);
  });

  it("skips an instance whose revision the season does not play", async () => {
    instances.listActiveInstances.mockResolvedValue([
      live("ward", { revisionId: "00000000-0000-4000-8000-00000000dead" }),
      live("swamp"),
    ]);
    dbFake.selectResults.push([{ n: 0 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }]);

    const ctx = await loadPoolContext(seasonPlayer(), REGISTRY);
    expect(ctx.activeEffectKeys).toEqual(["swamp"]);
  });

  it("counts the rivals behind in the same round — the wheel hides what needs one", async () => {
    // Season clock, players, then the snapshot's four (rank, moves, behind now, last roll), then behind the landing.
    dbFake.selectResults.push([{ n: 11 }], [{ n: 2 }], [{ n: 1 }], [{ n: 4 }], [{ n: 0 }], [], [{ n: 3 }]);
    const ctx = await loadPoolContext(seasonPlayer(), REGISTRY, 17);
    expect(ctx.playersBehind).toBe(3);
  });

  it("builds the player snapshot from the same round of queries", async () => {
    dbFake.selectResults.push([{ n: 11 }], [{ n: 2 }], [{ n: 1 }], [{ n: 4 }], [{ n: 1 }], [{ dice: [3] }]);

    const ctx = await loadPoolContext(seasonPlayer(), REGISTRY);
    expect(ctx.player).toEqual({
      seasonPlayerId: "sp-1",
      position: 3,
      balancePoints: 12,
      rollSeq: 4,
      moveCount: 4,
      rank: 2,
      behind: 1,
      lastRoll: 3,
      status: "active",
    });
  });
});

describe("listTargetOptions", () => {
  const rows = [
    { seasonPlayerId: "sp-1", position: 1, username: "alice", displayName: null, avatarUrl: null, status: "active", moves: 5 },
    { seasonPlayerId: "sp-2", position: 2, username: "bob", displayName: "Bob", avatarUrl: "u.png", status: "active", moves: 3 },
    { seasonPlayerId: "sp-3", position: 3, username: "carol", displayName: null, avatarUrl: null, status: "active", moves: 1 },
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
      moveCount: 3,
      status: "active",
      targetable: true,
    });
  });

  it("returns nothing when the season has no other active players", async () => {
    dbFake.selectResults.push([]);
    await expect(listTargetOptions("season-1", "sp-1", 3)).resolves.toEqual([]);
  });
});
