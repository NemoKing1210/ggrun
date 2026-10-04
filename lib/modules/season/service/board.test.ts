import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/infrastructure/auth/session", () => ({ getCurrentUser: vi.fn(), isStaff: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { db } from "@/lib/infrastructure/db";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { boardCells } from "@/db/schema";

import {
  bulkSetBoardCellGenres,
  randomizeBoardGenres,
  setBoardCell,
} from "./board";

let rows: Array<{ position: number; config: unknown }> = [];

const insertValues = vi.fn();
const insertConflict = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();

function wireDb(): void {
  vi.mocked(db.select).mockReturnValue({
    from: () => ({ where: () => Promise.resolve(rows) }),
  } as never);
  vi.mocked(db.insert).mockReturnValue({
    values: (value: unknown) => {
      insertValues(value);
      return { onConflictDoUpdate: insertConflict };
    },
  } as never);
  vi.mocked(db.update).mockReturnValue({
    set: (patch: unknown) => {
      updateSet(patch);
      return {
        where: (cond: unknown) => {
          updateWhere(cond);
          return Promise.resolve(undefined);
        },
      };
    },
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  rows = [];
  insertConflict.mockResolvedValue(undefined);
  wireDb();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1" } as never);
  vi.mocked(isStaff).mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("setBoardCell", () => {
  it("refuses a non-staff actor", async () => {
    vi.mocked(isStaff).mockReturnValue(false);
    await expect(
      setBoardCell({ boardId: "b1", position: 3, cellType: "normal" }),
    ).rejects.toMatchObject({ code: "adminStaffRequired" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("defaults a missing label to null and a missing config to an object", async () => {
    await setBoardCell({ boardId: "b1", position: 3, cellType: "start" });
    expect(insertValues).toHaveBeenCalledWith({
      boardId: "b1",
      position: 3,
      cellType: "start",
      label: null,
      config: {},
    });
  });

  it("upserts on the boardId + position pair with the same values", async () => {
    await setBoardCell({ boardId: "b1", position: 3, cellType: "bonus", label: "Bonus", config: { points: 5 } });
    expect(insertConflict).toHaveBeenCalledWith({
      target: [boardCells.boardId, boardCells.position],
      set: { cellType: "bonus", label: "Bonus", config: { points: 5 } },
    });
  });
});

describe("bulkSetBoardCellGenres", () => {
  it("trims, lowercases and deduplicates the genre list", async () => {
    rows = [{ position: 1, config: { keep: true } }];
    const count = await bulkSetBoardCellGenres({ boardId: "b1", positions: [1], genres: [" Action ", "action", "", "RPG"] });

    expect(count).toBe(1);
    expect(updateSet).toHaveBeenCalledWith({ config: { keep: true, genres: ["action", "rpg"] } });
  });

  it("removes the genres key when the submitted list is empty", async () => {
    rows = [{ position: 2, config: { genres: ["old"], keep: 1 } }];
    await bulkSetBoardCellGenres({ boardId: "b1", positions: [2], genres: ["   "] });
    expect(updateSet).toHaveBeenCalledWith({ config: { keep: 1 } });
  });

  it("inserts a normal cell for a position that has no row yet", async () => {
    rows = [];
    const count = await bulkSetBoardCellGenres({ boardId: "b1", positions: [7], genres: ["racing"] });
    expect(count).toBe(1);
    expect(insertValues).toHaveBeenCalledWith({
      boardId: "b1",
      position: 7,
      cellType: "normal",
      label: null,
      config: { genres: ["racing"] },
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("counts every requested position, updated or inserted", async () => {
    rows = [{ position: 1, config: {} }];
    const count = await bulkSetBoardCellGenres({ boardId: "b1", positions: [1, 2, 3], genres: ["rpg"] });
    expect(count).toBe(3);
    expect(updateWhere).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(2);
  });
});

describe("randomizeBoardGenres", () => {
  it("picks deterministically from the supplied pool", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    rows = [{ position: 1, config: {} }];
    const count = await randomizeBoardGenres({ boardId: "b1", positions: [1], poolGenres: ["RPG", "racing"] });

    expect(count).toBe(1);
    expect(updateSet).toHaveBeenCalledWith({ config: { genres: ["rpg"] } });
  });

  it("falls back to the built-in pool when none is supplied", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9999);
    rows = [];
    await randomizeBoardGenres({ boardId: "b1", positions: [5] });
    const inserted = insertValues.mock.calls[0]![0] as { config: { genres: string[] } };
    expect(inserted.config.genres).toHaveLength(1);
    expect(inserted.config.genres[0]).toBe("indie");
  });

  it("requires staff", async () => {
    vi.mocked(isStaff).mockReturnValue(false);
    await expect(randomizeBoardGenres({ boardId: "b1", positions: [1] })).rejects.toMatchObject({
      code: "adminStaffRequired",
    });
  });
});
