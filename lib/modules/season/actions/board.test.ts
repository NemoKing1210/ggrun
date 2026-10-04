import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminError } from "@/lib/modules/season/service/errors";

import {
  bulkSetCellGenresAction,
  randomizeBoardGenresAction,
  setBoardCellAction,
} from "./board";

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const i18n = vi.hoisted(() => ({ getT: vi.fn() }));
vi.mock("@/lib/i18n/server", () => i18n);
i18n.getT.mockResolvedValue({
  locale: "en",
  t: {
    core: { errors: { formUnknown: "Unknown error", boardCellInvalid: "Bad cell" } },
    admin: { feedback: { cellSaved: "Cell {position} saved", cellsUpdated: "{count} cells updated", cellsRandomized: "{count} cells randomized" } },
  },
});

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const service = vi.hoisted(() => ({
  setBoardCell: vi.fn(),
  bulkSetBoardCellGenres: vi.fn(),
  randomizeBoardGenres: vi.fn(),
}));
vi.mock("@/lib/modules/season/service", () => service);

const EMPTY = {};

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  cache.revalidatePath.mockClear();
  session.getCurrentUser.mockReset();
  session.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin" });
  for (const fn of Object.values(service)) fn.mockReset();
  service.setBoardCell.mockResolvedValue(undefined);
  service.bulkSetBoardCellGenres.mockResolvedValue(4);
  service.randomizeBoardGenres.mockResolvedValue(2);
  logger.log.info.mockClear();
});

describe("setBoardCellAction", () => {
  it("coerces amount, genres and target into the cell config", async () => {
    const result = await setBoardCellAction(
      EMPTY,
      formData({
        boardId: "board-1",
        seasonId: "season-1",
        position: "5",
        cellType: "bonus",
        label: "Bonus",
        amount: "3",
        genres: "RPG, action",
        target: "9",
      }),
    );

    expect(service.setBoardCell).toHaveBeenCalledWith({
      boardId: "board-1",
      position: 5,
      cellType: "bonus",
      label: "Bonus",
      config: { amount: 3, genres: ["rpg", "action"], target: 9 },
    });
    expect(result).toEqual({ ok: "Cell 5 saved" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/board");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/seasons/season-1/board");
  });

  it("accepts a JSON genre array and the legacy cellGenres field", async () => {
    await setBoardCellAction(
      EMPTY,
      formData({
        boardId: "board-1",
        seasonId: "season-1",
        position: "1",
        cellType: "normal",
        cellGenres: '["RPG","Action"]',
      }),
    );
    expect(service.setBoardCell).toHaveBeenCalledWith(
      expect.objectContaining({ config: { genres: ["rpg", "action"] } }),
    );
  });

  it("omits blank label, amount and non-numeric target", async () => {
    await setBoardCellAction(
      EMPTY,
      formData({
        boardId: "board-1",
        seasonId: "season-1",
        position: "2",
        cellType: "normal",
        label: "",
        amount: "",
        target: "not-a-number",
      }),
    );
    expect(service.setBoardCell).toHaveBeenCalledWith({
      boardId: "board-1",
      position: 2,
      cellType: "normal",
      label: null,
      config: {},
    });
  });

  it("translates a domain failure without revalidating", async () => {
    service.setBoardCell.mockRejectedValue(new AdminError("boardCellInvalid"));
    const result = await setBoardCellAction(
      EMPTY,
      formData({ boardId: "board-1", seasonId: "season-1", position: "1", cellType: "normal" }),
    );
    expect(result).toEqual({ error: "Bad cell" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("bulkSetCellGenresAction", () => {
  it("rejects an empty selection when applyToAll is off", async () => {
    const result = await bulkSetCellGenresAction(
      EMPTY,
      formData({ boardId: "board-1", seasonId: "season-1", genres: "rpg", positions: "" }),
    );
    expect(result).toEqual({ error: "formUnknown" });
    expect(service.bulkSetBoardCellGenres).not.toHaveBeenCalled();
  });

  it("expands ranges, dedupes and sorts positions", async () => {
    const result = await bulkSetCellGenresAction(
      EMPTY,
      formData({ boardId: "board-1", seasonId: "season-1", genres: "rpg, action", positions: "5,1,3-5" }),
    );

    expect(service.bulkSetBoardCellGenres).toHaveBeenCalledWith({
      boardId: "board-1",
      positions: [1, 3, 4, 5],
      genres: ["rpg", "action"],
    });
    expect(result).toEqual({ ok: "4 cells updated" });
  });

  it("falls back to the full range when applyToAll is set with a board size", async () => {
    await bulkSetCellGenresAction(
      EMPTY,
      formData({ boardId: "board-1", seasonId: "season-1", genres: "rpg", positions: "", applyToAll: "true", boardSize: "3" }),
    );
    expect(service.bulkSetBoardCellGenres).toHaveBeenCalledWith({
      boardId: "board-1",
      positions: [0, 1, 2],
      genres: ["rpg"],
    });
  });

  it("normalizes a JSON position array the same way as the CSV branch", async () => {
    await bulkSetCellGenresAction(
      EMPTY,
      formData({ boardId: "board-1", seasonId: "season-1", genres: "rpg", positions: '["4","2","2"]' }),
    );
    expect(service.bulkSetBoardCellGenres).toHaveBeenCalledWith({
      boardId: "board-1",
      positions: [2, 4],
      genres: ["rpg"],
    });
  });

  it("reports a form error when applyToAll is set without a usable board size", async () => {
    const result = await bulkSetCellGenresAction(
      EMPTY,
      formData({ boardId: "board-1", seasonId: "season-1", genres: "rpg", positions: "", applyToAll: "true", boardSize: "0" }),
    );
    expect(result).toEqual({ error: "formUnknown" });
    expect(service.bulkSetBoardCellGenres).not.toHaveBeenCalled();
  });

  it("translates a domain failure", async () => {
    service.bulkSetBoardCellGenres.mockRejectedValue(new AdminError("formUnknown"));
    const result = await bulkSetCellGenresAction(
      EMPTY,
      formData({ boardId: "board-1", seasonId: "season-1", genres: "rpg", positions: "1" }),
    );
    expect(result).toEqual({ error: "Unknown error" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("randomizeBoardGenresAction", () => {
  it("rejects an empty selection when applyToAll is off", async () => {
    const result = await randomizeBoardGenresAction(
      EMPTY,
      formData({ boardId: "board-1", seasonId: "season-1", positions: "" }),
    );
    expect(result).toEqual({ error: "formUnknown" });
    expect(service.randomizeBoardGenres).not.toHaveBeenCalled();
  });

  it("randomizes the requested positions with an optional genre pool", async () => {
    const result = await randomizeBoardGenresAction(
      EMPTY,
      formData({ boardId: "board-1", seasonId: "season-1", positions: "1-3", poolGenres: "rpg, action" }),
    );

    expect(service.randomizeBoardGenres).toHaveBeenCalledWith({
      boardId: "board-1",
      positions: [1, 2, 3],
      poolGenres: ["rpg", "action"],
    });
    expect(result).toEqual({ ok: "2 cells randomized" });
  });

  it("passes an undefined pool when none is supplied", async () => {
    await randomizeBoardGenresAction(
      EMPTY,
      formData({ boardId: "board-1", seasonId: "season-1", positions: "2", poolGenres: "" }),
    );
    expect(service.randomizeBoardGenres).toHaveBeenCalledWith({
      boardId: "board-1",
      positions: [2],
      poolGenres: undefined,
    });
  });

  it("derives every position from the board size when applyToAll is set", async () => {
    await randomizeBoardGenresAction(
      EMPTY,
      formData({ boardId: "board-1", seasonId: "season-1", positions: "", applyToAll: "1", boardSize: "4" }),
    );
    expect(service.randomizeBoardGenres).toHaveBeenCalledWith({
      boardId: "board-1",
      positions: [0, 1, 2, 3],
      poolGenres: undefined,
    });
  });

  it("translates a domain failure", async () => {
    service.randomizeBoardGenres.mockRejectedValue(new AdminError("formUnknown"));
    const result = await randomizeBoardGenresAction(
      EMPTY,
      formData({ boardId: "board-1", seasonId: "season-1", positions: "1" }),
    );
    expect(result).toEqual({ error: "Unknown error" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
