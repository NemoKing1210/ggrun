import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./config";
import { applyMovementModifiers, modifiedDice, normalizePosition } from "./board/movement";
import { emptyModifiers, reduceHookPatches, type PatchSource } from "./iee";

const src = (over: Partial<PatchSource>): PatchSource => ({
  id: "e1",
  effectKey: "x",
  priority: 100,
  appliedAt: 1,
  patch: {},
  ...over,
});

// --- reducer ---------------------------------------------------------------

describe("reduceHookPatches", () => {
  it("returns a neutral result for no patches", () => {
    expect(reduceHookPatches([])).toEqual(emptyModifiers());
  });

  it("accumulates additive fields", () => {
    const out = reduceHookPatches([
      src({ id: "a", patch: { stepsDelta: -1, balanceDelta: 2, diceCountDelta: 1 } }),
      src({ id: "b", patch: { stepsDelta: -2, balanceDelta: 3, diceSidesDelta: -2 } }),
    ]);
    expect(out.stepsDelta).toBe(-3);
    expect(out.balanceDelta).toBe(5);
    expect(out.diceCountDelta).toBe(1);
    expect(out.diceSidesDelta).toBe(-2);
  });

  it("gives an override to the highest-priority effect and records the loser", () => {
    const out = reduceHookPatches([
      src({ id: "low", effectKey: "low", priority: 500, patch: { forcedPosition: 30 } }),
      src({ id: "high", effectKey: "high", priority: 10, patch: { forcedPosition: 5 } }),
    ]);
    expect(out.forcedPosition).toBe(5);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0]).toContain("low");
  });

  it("resolves forcedOutcome the same way", () => {
    const out = reduceHookPatches([
      src({ id: "a", priority: 1, patch: { forcedOutcome: "passed" } }),
      src({ id: "b", priority: 2, patch: { forcedOutcome: "dropped" } }),
    ]);
    expect(out.forcedOutcome).toBe("passed");
    expect(out.conflicts).toHaveLength(1);
  });

  it("ORs vetoes — one shield is enough", () => {
    const out = reduceHookPatches([
      src({ id: "a", patch: {} }),
      src({ id: "b", patch: { skipCellEffect: true } }),
      src({ id: "c", patch: { immune: true } }),
    ]);
    expect(out.skipCellEffect).toBe(true);
    expect(out.immune).toBe(true);
  });

  it("collects charge consumption and reasons", () => {
    const out = reduceHookPatches([
      src({ id: "a", patch: { consumeCharge: true, reason: "effect:a" } }),
      src({ id: "b", patch: { reason: "effect:b" } }),
    ]);
    expect(out.consumed).toEqual(["a"]);
    expect(out.reasons).toEqual(["effect:a", "effect:b"]);
  });

  it("is order-independent: input order never changes the result", () => {
    const patches = [
      src({ id: "c", priority: 300, appliedAt: 3, patch: { stepsDelta: 1, forcedPosition: 9 } }),
      src({ id: "a", priority: 100, appliedAt: 1, patch: { stepsDelta: 2, forcedPosition: 4 } }),
      src({ id: "b", priority: 200, appliedAt: 2, patch: { stepsDelta: 3 } }),
    ];
    const forward = reduceHookPatches(patches);
    const reversed = reduceHookPatches([...patches].reverse());
    expect(forward).toEqual(reversed);
    expect(forward.forcedPosition).toBe(4);
  });

  it("breaks priority ties by application time, then id", () => {
    const out = reduceHookPatches([
      src({ id: "z", effectKey: "z", priority: 100, appliedAt: 5, patch: { forcedPosition: 2 } }),
      src({ id: "y", effectKey: "y", priority: 100, appliedAt: 1, patch: { forcedPosition: 7 } }),
    ]);
    expect(out.forcedPosition).toBe(7);
  });
});

// --- movement --------------------------------------------------------------

describe("movement modifiers", () => {
  const board = DEFAULT_SEASON_CONFIG.board;

  it("clamps dice to legal values", () => {
    const mods = { ...emptyModifiers(), diceCountDelta: -5, diceSidesDelta: -10 };
    expect(modifiedDice(DEFAULT_SEASON_CONFIG.dice, "passed", mods)).toEqual({
      count: 0,
      sides: 2,
    });
  });

  it("is a no-op when no modifiers are passed", () => {
    expect(modifiedDice(DEFAULT_SEASON_CONFIG.dice, "dropped")).toEqual({
      count: DEFAULT_SEASON_CONFIG.dice.dropDiceCount,
      sides: DEFAULT_SEASON_CONFIG.dice.sides,
    });
  });

  it("applies stepsDelta and re-normalizes", () => {
    const result = {
      diceResults: [4],
      newPosition: 14,
      newBalancePoints: 3,
      newStreakPass: 1,
      newStreakDrop: 0,
    };
    const mods = { ...emptyModifiers(), stepsDelta: -1 };
    expect(applyMovementModifiers(result, mods, board, 10).newPosition).toBe(13);
  });

  it("never drives the position below zero or past the board", () => {
    const at = (newPosition: number) => ({
      diceResults: [1],
      newPosition,
      newBalancePoints: 0,
      newStreakPass: 0,
      newStreakDrop: 0,
    });
    const back = { ...emptyModifiers(), stepsDelta: -100 };
    const fwd = { ...emptyModifiers(), stepsDelta: 100 };
    expect(applyMovementModifiers(at(2), back, board, 0).newPosition).toBe(0);
    expect(applyMovementModifiers(at(2), fwd, board, 0).newPosition).toBe(board.size - 1);
    expect(applyMovementModifiers(at(2), back, board, 0).newPosition).toBe(
      normalizePosition(-98, board),
    );
  });

  it("lets forcedPosition beat stepsDelta", () => {
    const result = {
      diceResults: [4],
      newPosition: 14,
      newBalancePoints: 0,
      newStreakPass: 0,
      newStreakDrop: 0,
    };
    const mods = { ...emptyModifiers(), stepsDelta: -1, forcedPosition: 30 };
    expect(applyMovementModifiers(result, mods, board, 10).newPosition).toBe(30);
  });

  it("clamps balance at zero", () => {
    const result = {
      diceResults: [],
      newPosition: 1,
      newBalancePoints: 2,
      newStreakPass: 0,
      newStreakDrop: 0,
    };
    const mods = { ...emptyModifiers(), balanceDelta: -10 };
    expect(applyMovementModifiers(result, mods, board, 0).newBalancePoints).toBe(0);
  });
});
