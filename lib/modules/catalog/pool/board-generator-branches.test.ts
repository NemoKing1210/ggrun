import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SEASON_CONFIG } from "../../../engine/config/defaults";
import type { CellType } from "../../../engine/types/board";
import type { SeasonConfig } from "../../../engine/types/season";
import { boardMatchesConfig, boardShapeChanged, cellTypeCounts, generateBoardCells } from "./board-generator";

function cfg(board: Partial<SeasonConfig["board"]> = {}): SeasonConfig {
  const base = structuredClone(DEFAULT_SEASON_CONFIG);
  return { ...base, board: { ...base.board, ...board } };
}

function typesOf(config: SeasonConfig): CellType[] {
  return generateBoardCells(config).map((c) => c.cellType);
}

/** A deterministic, non-repeating sequence so the teleport retry never spins. */
function sequence(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

beforeEach(() => {
  vi.spyOn(Math, "random").mockImplementation(sequence());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateBoardCells branches", () => {
  it("has no finish on a looping board and fills every inner cell with normals", () => {
    const cells = generateBoardCells(
      cfg({ size: 5, loop: true, bonusCount: 0, penaltyCount: 0, teleportCount: 0, eventCount: 0 }),
    );

    expect(cells.map((c) => c.cellType)).toEqual(["start", "normal", "normal", "normal", "normal"]);
  });

  it("still starts at 0 and omits finish on a longer looping board", () => {
    const cells = generateBoardCells(cfg({ size: 12, loop: true, bonusCount: 3, penaltyCount: 2 }));

    expect(cells[0]!.cellType).toBe("start");
    expect(cells.some((c) => c.cellType === "finish")).toBe(false);
    expect(cells).toHaveLength(12);
  });

  it("caps specials at the inner positions in creation order", () => {
    const cells = generateBoardCells(
      cfg({
        size: 5,
        loop: false,
        distribution: "manual",
        bonusCount: 10,
        penaltyCount: 10,
        teleportCount: 10,
        eventCount: 10,
      }),
    );

    // 5 cells minus start and finish = 3 inner; the first three specials are bonus.
    expect(cells.map((c) => c.cellType)).toEqual(["start", "bonus", "bonus", "bonus", "finish"]);
    expect(
      cellTypeCounts(
        typesOf(cfg({ size: 5, bonusCount: 10, penaltyCount: 10, teleportCount: 10, eventCount: 10 })),
      ),
    ).toEqual({ start: 1, bonus: 3, finish: 1 });
  });

  it("interleaves cell types for the even distribution", () => {
    const cells = generateBoardCells(
      cfg({ size: 6, distribution: "even", bonusCount: 1, penaltyCount: 1, teleportCount: 0, eventCount: 0 }),
    );

    expect(cells.map((c) => c.cellType)).toEqual(["start", "bonus", "penalty", "normal", "normal", "finish"]);
  });

  it("groups specials toward the middle for the clustered distribution", () => {
    const cells = generateBoardCells(
      cfg({ size: 9, distribution: "clustered", bonusCount: 1, penaltyCount: 1, teleportCount: 1, eventCount: 0 }),
    );

    expect(cells.map((c) => c.cellType)).toEqual([
      "start",
      "normal",
      "normal",
      "bonus",
      "penalty",
      "normal",
      "normal",
      "teleport",
      "finish",
    ]);
  });

  it("keeps creation order for the manual distribution", () => {
    const cells = generateBoardCells(
      cfg({ size: 8, distribution: "manual", bonusCount: 2, penaltyCount: 1, teleportCount: 0, eventCount: 0 }),
    );

    expect(cells.map((c) => c.cellType)).toEqual([
      "start",
      "bonus",
      "bonus",
      "penalty",
      "normal",
      "normal",
      "normal",
      "finish",
    ]);
  });

  it("labels only start and finish", () => {
    const cells = generateBoardCells(cfg({ size: 6, bonusCount: 1 }));

    expect(cells.find((c) => c.cellType === "start")!.label).toBe("Старт");
    expect(cells.find((c) => c.cellType === "finish")!.label).toBe("Финиш");
    expect(cells.filter((c) => c.cellType !== "start" && c.cellType !== "finish").every((c) => c.label === null)).toBe(true);
  });

  it("gives bonus and penalty a 2-4 amount", () => {
    const cells = generateBoardCells(cfg({ size: 20, bonusCount: 4, penaltyCount: 4 }));

    for (const c of cells) {
      if (c.cellType === "bonus" || c.cellType === "penalty") {
        const amount = c.config.amount as number;
        expect(amount).toBeGreaterThanOrEqual(2);
        expect(amount).toBeLessThanOrEqual(4);
      }
    }
  });

  it("places a teleport far from its own cell", () => {
    const cells = generateBoardCells(cfg({ size: 20, teleportCount: 4 }));

    const teleports = cells.filter((c) => c.cellType === "teleport");
    expect(teleports).toHaveLength(4);
    for (const c of teleports) {
      const target = c.config.target as number;
      expect(target).toBeGreaterThanOrEqual(0);
      expect(target).toBeLessThan(20);
      expect(Math.abs(target - c.position)).toBeGreaterThanOrEqual(3);
    }
  });

  it("leaves a teleport without a target when the board is too small", () => {
    const cells = generateBoardCells(
      cfg({ size: 3, loop: false, bonusCount: 0, penaltyCount: 0, teleportCount: 5, eventCount: 0 }),
    );

    const teleport = cells.find((c) => c.cellType === "teleport");
    expect(teleport).toBeDefined();
    expect(teleport!.config.target).toBeUndefined();
  });
});

describe("boardMatchesConfig more branches", () => {
  const c = cfg({ size: 8, bonusCount: 1, penaltyCount: 1, teleportCount: 1 });

  it("is order independent", () => {
    const types = typesOf(c);
    expect(boardMatchesConfig(c, [...types].reverse())).toBe(true);
  });

  it("notices one cell type swapped for another", () => {
    const types = typesOf(c);
    const swapped: CellType[] = types.map((t) => (t === "bonus" ? "normal" : t));
    expect(boardMatchesConfig(c, swapped)).toBe(false);
  });

  it("notices an extra cell", () => {
    expect(boardMatchesConfig(c, [...typesOf(c), "normal"])).toBe(false);
  });
});

describe("boardShapeChanged with an undefined previous board", () => {
  it("counts a missing board as changed", () => {
    expect(boardShapeChanged(undefined, cfg().board)).toBe(true);
  });
});
