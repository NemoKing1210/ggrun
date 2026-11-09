import { beforeEach, describe, expect, it, vi } from "vitest";

import { IeeConfigSchema } from "@/lib/engine";

const counters = vi.hoisted(() => ({
  getSeasonPlayerRow: vi.fn(),
  getSeasonRollSeq: vi.fn(),
  hasOpenRoll: vi.fn(),
  toPlayerSnapshot: vi.fn(),
}));
vi.mock("../repository/counters", () => counters);

// The board an out-of-turn move reads: the season's settings and its main board's cells.
const boards = vi.hoisted(() => ({ getMainBoard: vi.fn(), getBoardCells: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => boards);
const seasonRows = vi.hoisted(() => ({ rows: [] as { config: unknown }[] }));
vi.mock("@/lib/infrastructure/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => seasonRows.rows }) }) }) },
}));

// A season plays its catalog, read from the database; these tests play the
// system pack's fixture instead.
vi.mock("../registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../registry")>();
  return { ...actual, getSeasonRegistry: async () => actual.coreRegistry() };
});

import { coreRegistry } from "../registry";
import { executionContext, loadBoardInfo } from "./context";

const tx = {} as never;
const config = IeeConfigSchema.parse({ enabled: true });

beforeEach(() => {
  vi.clearAllMocks();
  counters.getSeasonRollSeq.mockResolvedValue(12);
});

describe("executionContext", () => {
  it("reads the season clock and registry unless given", async () => {
    const ctx = await executionContext({ tx, seasonId: "s", config });
    expect(ctx.seasonRollSeq).toBe(12);
    expect(ctx.registry).toBe(coreRegistry());
    expect(ctx.rng).toBe(Math.random);
    expect(ctx.actorPlayerId).toBeNull();

    const given = await executionContext({ tx, seasonId: "s", config, seasonRollSeq: 3, rng: () => 0.1, actorUserId: "u" });
    expect(given.seasonRollSeq).toBe(3);
    expect(given.actorUserId).toBe("u");
    expect(counters.getSeasonRollSeq).toHaveBeenCalledTimes(1);
  });

  it("anchors a grant one roll out while the recipient has a game in flight", async () => {
    const ctx = await executionContext({ tx, seasonId: "s", config, seasonRollSeq: 0 });
    counters.getSeasonPlayerRow.mockResolvedValue({ id: "sp", rollSeq: 7 });
    counters.hasOpenRoll.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await ctx.anchorFor("sp")).toEqual({ anchorRollSeq: 8 });
    expect(await ctx.anchorFor("sp")).toEqual({ anchorRollSeq: 7 });
    expect(counters.hasOpenRoll).toHaveBeenCalledWith("sp", tx);

    counters.getSeasonPlayerRow.mockResolvedValue(null);
    counters.hasOpenRoll.mockResolvedValue(false);
    expect(await ctx.anchorFor("ghost")).toEqual({ anchorRollSeq: 0 });
  });

  it("snapshots a participant, or an inert stand-in when they are gone", async () => {
    const ctx = await executionContext({ tx, seasonId: "s", config, seasonRollSeq: 0 });
    const snap = { seasonPlayerId: "sp", position: 4, balancePoints: 2, rollSeq: 7, moveCount: 7, rank: 2, status: "active" };
    counters.getSeasonPlayerRow.mockResolvedValueOnce({ id: "sp" });
    counters.toPlayerSnapshot.mockResolvedValueOnce(snap);
    expect(await ctx.snapshot("sp")).toBe(snap);
    counters.getSeasonPlayerRow.mockResolvedValueOnce(null);
    expect(await ctx.snapshot("ghost")).toMatchObject({ seasonPlayerId: "ghost", status: "withdrawn" });
  });
});

describe("loadBoardInfo", () => {
  const cell = (position: number, cellType = "neutral") => ({ position, cellType });

  it("reads the size and the finish from the main board's cells, the loop from the settings", async () => {
    seasonRows.rows = [{ config: { board: { size: 99, loop: true } } }];
    boards.getMainBoard.mockResolvedValue({ id: "b" });
    boards.getBoardCells.mockResolvedValue([cell(0, "start"), cell(1), cell(2, "finish")]);
    expect(await loadBoardInfo("s")).toEqual({ size: 3, loop: true, finishAt: 2 });
    expect(boards.getBoardCells).toHaveBeenCalledWith("b");
  });

  it("falls back to the settings without a board, and to the defaults without settings", async () => {
    seasonRows.rows = [{ config: { board: { size: 30, loop: false } } }];
    boards.getMainBoard.mockResolvedValue(null);
    expect(await loadBoardInfo("s")).toEqual({ size: 30, loop: false, finishAt: null });
    seasonRows.rows = [];
    const defaults = await loadBoardInfo("s");
    expect(defaults.finishAt).toBeNull();
    expect(defaults.size).toBeGreaterThan(0);
  });

  it("is read once per context, on first use, unless the caller passes it", async () => {
    seasonRows.rows = [];
    boards.getMainBoard.mockResolvedValue(null);
    const ctx = await executionContext({ tx, seasonId: "s", config, seasonRollSeq: 0 });
    await ctx.board!();
    await ctx.board!();
    expect(boards.getMainBoard).toHaveBeenCalledTimes(1);
    const given = { size: 5, loop: false, finishAt: 4 };
    const passed = await executionContext({ tx, seasonId: "s", config, seasonRollSeq: 0, board: given });
    expect(await passed.board!()).toBe(given);
    expect(boards.getMainBoard).toHaveBeenCalledTimes(1);
  });
});
