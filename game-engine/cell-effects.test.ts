import { describe, expect, it } from "vitest";
import {
  applyCellEffect,
  CELL_EFFECTS,
  getCellEffect,
  registerCellEffect,
} from "./cell-effects";
import type { CellLike, CellType } from "./types";

const cell = (
  cellType: CellType,
  config: Record<string, unknown> = {},
  position = 10,
): CellLike => ({ position, cellType, config });

describe("applyCellEffect — neutral cells", () => {
  it.each(["normal", "start", "finish"] as CellType[])(
    "leaves %s untouched",
    (cellType) => {
      expect(applyCellEffect(cell(cellType), 10, 5)).toEqual({
        position: 10,
        balancePoints: 5,
        ledgerDelta: 0,
      });
    },
  );

  it("treats event as a no-op with a reserved extension point", () => {
    expect(applyCellEffect(cell("event", { wheel: ["gift", "skip"] }), 7, 2)).toEqual({
      position: 7,
      balancePoints: 2,
      ledgerDelta: 0,
    });
  });

  it("treats custom as a no-op until a plugin registers its key", () => {
    expect(applyCellEffect(cell("custom", { anything: true }), 7, 2)).toEqual({
      position: 7,
      balancePoints: 2,
      ledgerDelta: 0,
    });
  });
});

describe("applyCellEffect — penalty/bonus", () => {
  it("subtracts cell.config.amount for penalty and reports the ledger delta", () => {
    const result = applyCellEffect(cell("penalty", { amount: 3 }), 12, 5);
    expect(result).toEqual({
      position: 12,
      balancePoints: 2,
      ledgerDelta: -3,
      reason: "penalty",
    });
  });

  it("clamps balance at zero on harsh penalties", () => {
    const result = applyCellEffect(cell("penalty", { amount: 9 }), 12, 5);
    expect(result.balancePoints).toBe(0);
    expect(result.ledgerDelta).toBe(-9);
  });

  it("adds cell.config.amount for bonus", () => {
    const result = applyCellEffect(cell("bonus", { amount: 4 }), 12, 1);
    expect(result).toEqual({
      position: 12,
      balancePoints: 5,
      ledgerDelta: 4,
      reason: "bonus",
    });
  });

  it("shifts position when config.steps is set", () => {
    expect(applyCellEffect(cell("penalty", { steps: 3 }), 10, 0).position).toBe(7);
    expect(applyCellEffect(cell("bonus", { amount: 0, steps: 2 }), 10, 0).position).toBe(12);
  });
});

describe("applyCellEffect — teleport", () => {
  it("moves the player to cell.config.target", () => {
    const result = applyCellEffect(cell("teleport", { target: 25 }), 10, 0);
    expect(result.position).toBe(25);
    expect(result.reason).toBe("teleport:25");
  });

  it("is a no-op without a numeric target", () => {
    expect(applyCellEffect(cell("teleport"), 10, 0).position).toBe(10);
    expect(applyCellEffect(cell("teleport", { target: "start" }), 10, 0).position).toBe(10);
  });
});

describe("plugin registry", () => {
  it("routes config.effectKey ahead of cell_type", () => {
    registerCellEffect("double-or-nothing", () => ({
      balanceDelta: -1,
      reason: "gamble",
    }));
    const result = applyCellEffect(cell("normal", { effectKey: "double-or-nothing" }), 3, 4);
    expect(result).toEqual({
      position: 3,
      balancePoints: 3,
      ledgerDelta: -1,
      reason: "gamble",
    });
  });

  it("degrades unknown keys to a no-op", () => {
    expect(getCellEffect("no-such-key")).toBe(getCellEffect("also-missing"));
    const result = applyCellEffect(
      cell("custom", { effectKey: "unregistered" }),
      3,
      4,
    );
    expect(result.ledgerDelta).toBe(0);
    expect(result.balancePoints).toBe(4);
  });

  it("exposes built-in effects under their type names", () => {
    for (const key of ["normal", "penalty", "bonus", "teleport", "event"]) {
      expect(typeof CELL_EFFECTS[key]).toBe("function");
    }
  });
});
