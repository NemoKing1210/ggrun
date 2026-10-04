import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

import { db } from "@/lib/infrastructure/db";

import {
  addPlayerToSeason,
  getActiveRolls,
  getEventFeed,
  getLeaderboard,
  getPlayerLedger,
  getPlayerMoves,
  getSeasonPlayerById,
  getSeasonPlayerForUser,
  getSeasonStats,
  getUserActivityDays,
  removePlayerFromSeason,
  updateSeasonPlayer,
} from "./players";

const selectQueue: unknown[][] = [];
const inserts: unknown[] = [];
const updates: unknown[] = [];
const deletes: unknown[] = [];
const limits: unknown[] = [];

function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  c.from = () => c;
  c.where = () => c;
  c.orderBy = () => c;
  c.groupBy = () => c;
  c.innerJoin = () => c;
  c.leftJoin = () => c;
  c.limit = (n: unknown) => {
    limits.push(n);
    return c;
  };
  c.set = () => c;
  c.values = (values: unknown) => {
    inserts.push(values);
    return c;
  };
  c.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
  return c;
}

beforeEach(() => {
  vi.resetAllMocks();
  selectQueue.length = 0;
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
  limits.length = 0;
  vi.mocked(db.select).mockImplementation(() => chain(selectQueue.shift() ?? []) as never);
  vi.mocked(db.insert).mockImplementation(() => chain([]) as never);
  vi.mocked(db.update).mockImplementation(
    () =>
      ({
        set: (values: unknown) => {
          updates.push(values);
          return { where: () => Promise.resolve(undefined) };
        },
      }) as never,
  );
  vi.mocked(db.delete).mockImplementation(
    () =>
      ({
        where: () => {
          deletes.push(true);
          return Promise.resolve(undefined);
        },
      }) as never,
  );
});

describe("season player lookups", () => {
  it("returns the row or null", async () => {
    const row = { id: "sp1" };
    selectQueue.push([row]);
    await expect(getSeasonPlayerForUser("s1", "u1")).resolves.toBe(row);
    selectQueue.push([]);
    await expect(getSeasonPlayerForUser("s1", "u2")).resolves.toBeNull();

    selectQueue.push([row]);
    await expect(getSeasonPlayerById("sp1")).resolves.toBe(row);
    selectQueue.push([]);
    await expect(getSeasonPlayerById("nope")).resolves.toBeNull();
  });
});

describe("roster writes", () => {
  it("inserts a roster row with the season and player ids", async () => {
    await addPlayerToSeason("s1", "u1");
    expect(inserts).toEqual([{ seasonId: "s1", playerId: "u1" }]);
  });

  it("removes the roster row for that season+player pair", async () => {
    await removePlayerFromSeason("s1", "u1");
    expect(deletes).toHaveLength(1);
  });

  it("passes the patch through to the update", async () => {
    await updateSeasonPlayer("sp1", { position: 8, balancePoints: -3 });
    expect(updates).toEqual([{ position: 8, balancePoints: -3 }]);
  });
});

describe("history queries", () => {
  it("caps moves and ledger at 50 by default and honours an explicit limit", async () => {
    const moves = [{ id: "m1" }];
    selectQueue.push(moves);
    await expect(getPlayerMoves("sp1")).resolves.toBe(moves);
    selectQueue.push(moves);
    await getPlayerMoves("sp1", 5);
    expect(limits).toEqual([50, 5]);

    const ledger = [{ id: "l1" }];
    selectQueue.push(ledger);
    await expect(getPlayerLedger("sp1")).resolves.toBe(ledger);
    selectQueue.push(ledger);
    await getPlayerLedger("sp1", 3);
    expect(limits).toEqual([50, 5, 50, 3]);
  });
});

describe("getLeaderboard", () => {
  it("flattens each joined row into player fields plus user profile fields", async () => {
    selectQueue.push([
      {
        player: { id: "sp1", seasonId: "s1", position: 12, balancePoints: 4, status: "finished" },
        username: "neo",
        displayName: "Neo",
        avatarUrl: "a.png",
        bannerUrl: null,
        bio: null,
        links: { site: "x" },
        lastSeenAt: null,
      },
    ]);
    await expect(getLeaderboard("s1")).resolves.toEqual([
      {
        id: "sp1",
        seasonId: "s1",
        position: 12,
        balancePoints: 4,
        status: "finished",
        username: "neo",
        displayName: "Neo",
        avatarUrl: "a.png",
        bannerUrl: null,
        bio: null,
        links: { site: "x" },
        lastSeenAt: null,
      },
    ]);
  });
});

describe("getEventFeed", () => {
  it("spreads the log entry and attaches nullable author fields", async () => {
    selectQueue.push([
      { entry: { id: "e1", seasonId: "s1", eventType: "season_started" }, username: null, displayName: null, avatarUrl: null, lastSeenAt: null },
    ]);
    await expect(getEventFeed("s1")).resolves.toEqual([
      { id: "e1", seasonId: "s1", eventType: "season_started", username: null, displayName: null, avatarUrl: null, lastSeenAt: null },
    ]);
  });

  it("defaults the feed window to 30 entries", async () => {
    selectQueue.push([]);
    await getEventFeed("s1");
    expect(limits).toEqual([30]);
  });
});

describe("getActiveRolls", () => {
  it("returns the in-flight rows verbatim", async () => {
    const rows = [{ gameTitle: "Hades", status: "in_progress" }];
    selectQueue.push(rows);
    await expect(getActiveRolls("s1")).resolves.toBe(rows);
  });
});

describe("getSeasonStats", () => {
  it("counts moves and buckets rolls by status", async () => {
    selectQueue.push([{ n: 7 }]);
    selectQueue.push([
      { status: "passed", n: 2 },
      { status: "dropped", n: 1 },
      { status: "rerolled", n: 3 },
    ]);
    await expect(getSeasonStats("s1")).resolves.toEqual({
      totalMoves: 7,
      passedRolls: 2,
      droppedRolls: 1,
      rerolls: 3,
    });
  });

  it("reports zero for absent counts and statuses", async () => {
    selectQueue.push([]);
    selectQueue.push([]);
    await expect(getSeasonStats("s1")).resolves.toEqual({
      totalMoves: 0,
      passedRolls: 0,
      droppedRolls: 0,
      rerolls: 0,
    });
  });
});

describe("getUserActivityDays", () => {
  it("returns no days when the user has never joined a season", async () => {
    selectQueue.push([]);
    await expect(getUserActivityDays("u1")).resolves.toEqual([]);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("merges events, moves and rolls into per-day counts, dropping null roll dates", async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    selectQueue.push([{ id: "sp1" }, { id: "sp2" }]);
    selectQueue.push([{ createdAt: now }, { createdAt: now }]);
    selectQueue.push([{ createdAt: now }]);
    selectQueue.push([{ createdAt: now }, { createdAt: null }]);

    await expect(getUserActivityDays("u1")).resolves.toEqual([{ date: day, count: 4 }]);
  });

  it("sorts the merged activity ascending by date", async () => {
    const recent = new Date();
    const older = new Date(recent.getTime() - 24 * 60 * 60 * 1000);
    selectQueue.push([{ id: "sp1" }]);
    selectQueue.push([{ createdAt: recent }, { createdAt: older }]);
    selectQueue.push([]);
    selectQueue.push([]);

    await expect(getUserActivityDays("u1")).resolves.toEqual([
      { date: older.toISOString().slice(0, 10), count: 1 },
      { date: recent.toISOString().slice(0, 10), count: 1 },
    ]);
  });
});
