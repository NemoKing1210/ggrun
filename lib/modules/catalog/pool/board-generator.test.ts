import { describe, expect, it } from "vitest";

import { DEFAULT_SEASON_CONFIG } from "../../../engine/config/defaults";
import type { SeasonConfig } from "../../../engine/types/season";
import type { CellType } from "../../../engine/types/board";
import {
  boardMatchesConfig,
  boardShapeChanged,
  boardShapeOf,
  cellTypeCounts,
  generateBoardCells,
} from "./board-generator";

function cfg(board: Partial<SeasonConfig["board"]> = {}): SeasonConfig {
  const base = structuredClone(DEFAULT_SEASON_CONFIG);
  return { ...base, board: { ...base.board, ...board } };
}

/** The flat board `createSeason` used to write. */
function flatBoard(size = 40): CellType[] {
  return Array.from({ length: size }, (_, i) =>
    i === 0 ? "start" : i === size - 1 ? "finish" : "normal",
  ) as CellType[];
}

describe("generateBoardCells", () => {
  it("produces exactly `size` cells with start and finish at the ends", () => {
    const cells = generateBoardCells(cfg({ size: 30 }));
    expect(cells).toHaveLength(30);
    expect(cells[0]!.cellType).toBe("start");
    expect(cells[29]!.cellType).toBe("finish");
  });

  it("honours the configured special counts", () => {
    const counts = cellTypeCounts(
      generateBoardCells(
        cfg({ size: 40, bonusCount: 7, penaltyCount: 3, teleportCount: 5, eventCount: 2 }),
      ).map((c) => c.cellType),
    );
    expect(counts.bonus).toBe(7);
    expect(counts.penalty).toBe(3);
    expect(counts.teleport).toBe(5);
    expect(counts.event).toBe(2);
  });

  it("gives bonus and penalty cells an amount, teleports a target", () => {
    const cells = generateBoardCells(cfg({ size: 40, bonusCount: 5, penaltyCount: 5, teleportCount: 5 }));
    for (const c of cells) {
      if (c.cellType === "bonus" || c.cellType === "penalty") expect(typeof c.config.amount).toBe("number");
      if (c.cellType === "teleport") expect(typeof c.config.target).toBe("number");
    }
  });
});

describe("boardShapeOf", () => {
  it("keeps only the fields that change the layout", () => {
    expect(Object.keys(boardShapeOf(cfg().board)).sort()).toEqual(
      ["bonusCount", "distribution", "eventCount", "loop", "penaltyCount", "size", "teleportCount"],
    );
  });
});

describe("boardShapeChanged", () => {
  it("is true when a special count changes", () => {
    expect(boardShapeChanged(cfg().board, cfg({ bonusCount: 9 }).board)).toBe(true);
  });

  it("is true when size, loop or distribution change", () => {
    expect(boardShapeChanged(cfg().board, cfg({ size: 50 }).board)).toBe(true);
    expect(boardShapeChanged(cfg().board, cfg({ loop: true }).board)).toBe(true);
    expect(boardShapeChanged(cfg().board, cfg({ distribution: "even" }).board)).toBe(true);
  });

  it("is false for fields that do not affect the layout", () => {
    expect(boardShapeChanged(cfg().board, cfg({ perCellGenre: true }).board)).toBe(false);
    expect(boardShapeChanged(cfg().board, cfg({ regenerateOnSave: true }).board)).toBe(false);
  });

  it("is false when nothing changed", () => {
    expect(boardShapeChanged(cfg().board, cfg().board)).toBe(false);
  });

  it("treats a missing previous config as changed", () => {
    expect(boardShapeChanged(null, cfg().board)).toBe(true);
  });
});

describe("boardMatchesConfig", () => {
  // Regression: a season created before the fix has a flat board while its
  // config asks for specials. That mismatch is what triggers the one-off
  // regeneration on the next save of a draft.
  it("rejects the flat board a fresh season used to get", () => {
    expect(boardMatchesConfig(cfg(), flatBoard(40))).toBe(false);
  });

  it("accepts cells the generator itself produced", () => {
    const c = cfg({ size: 36, bonusCount: 3, penaltyCount: 4, teleportCount: 1, eventCount: 2 });
    const types = generateBoardCells(c).map((x) => x.cellType);
    expect(boardMatchesConfig(c, types)).toBe(true);
  });

  it("stays satisfied when more specials are asked for than fit, so saves do not loop", () => {
    // 10 cells, 8 inner — far more specials than positions.
    const c = cfg({ size: 10, bonusCount: 20, penaltyCount: 20, teleportCount: 20, eventCount: 20 });
    const types = generateBoardCells(c).map((x) => x.cellType);
    expect(boardMatchesConfig(c, types)).toBe(true);
  });

  it("notices a size change", () => {
    const types = generateBoardCells(cfg({ size: 40 })).map((x) => x.cellType);
    expect(boardMatchesConfig(cfg({ size: 50 }), types)).toBe(false);
  });
});
