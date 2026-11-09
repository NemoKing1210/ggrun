import { beforeEach, describe, expect, it, vi } from "vitest";

const seasons = vi.hoisted(() => ({ getMainBoard: vi.fn(), getBoardCells: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => seasons);

const repo = vi.hoisted(() => ({ listActiveObjects: vi.fn() }));
vi.mock("@/lib/modules/iee/repository", () => repo);

import { freeObjectCells, objectCellsOf, offeredCell, ownedObjects } from "./objects";

const cell = (position: number, cellType = "normal") => ({ position, cellType });
const BOARD = [cell(0, "start"), cell(3), cell(1, "bonus"), cell(2), cell(4, "finish")];

beforeEach(() => {
  vi.clearAllMocks();
  seasons.getMainBoard.mockResolvedValue({ id: "board-1" });
  seasons.getBoardCells.mockResolvedValue(BOARD);
  repo.listActiveObjects.mockResolvedValue([{ holderCellIndex: 2, ownerPlayerId: "sp-2" }]);
});

describe("where an object may stand (wave D, spec §6.18)", () => {
  it("any cell but the start and the finish, one object per cell, in board order", () => {
    expect(objectCellsOf(BOARD, [])).toEqual([1, 2, 3]);
    expect(objectCellsOf(BOARD, [{ holderCellIndex: 3 }])).toEqual([1, 2]);
  });

  it("counts a player's own objects only", () => {
    const objects = [{ ownerPlayerId: "sp-1" }, { ownerPlayerId: "sp-2" }, { ownerPlayerId: "sp-1" }, { ownerPlayerId: null }];
    expect(ownedObjects(objects, "sp-1")).toBe(2);
    expect(ownedObjects(objects, "sp-3")).toBe(0);
  });

  it("reads the season's main board and what stands on it now", async () => {
    await expect(freeObjectCells("season-1")).resolves.toEqual([1, 3]);
    expect(seasons.getMainBoard).toHaveBeenCalledWith("season-1");
    expect(seasons.getBoardCells).toHaveBeenCalledWith("board-1");
    expect(repo.listActiveObjects).toHaveBeenCalledWith("season-1");
    await expect(offeredCell("season-1", 3)).resolves.toEqual({ cell: 3 });
    await expect(offeredCell("season-1", 2)).resolves.toBeNull();
    await expect(offeredCell("season-1", 0)).resolves.toBeNull();
  });

  it("a season without a board offers no cell", async () => {
    seasons.getMainBoard.mockResolvedValue(null);
    await expect(freeObjectCells("season-1")).resolves.toEqual([]);
    await expect(offeredCell("season-1", 3)).resolves.toBeNull();
    expect(seasons.getBoardCells).not.toHaveBeenCalled();
  });
});
