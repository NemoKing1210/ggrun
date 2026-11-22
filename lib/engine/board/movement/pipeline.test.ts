/**
 * The dice pipeline's pure steps (docs/IEE_CONSTRUCTOR_SPEC.md §7.2): the
 * throw finished with its rerolls and a second throw, the result and its
 * modifiers, the move it makes.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_SEASON_CONFIG } from "../../config";
import type { SeasonConfig } from "../../types";
import { NO_DICE_RULES, diceResult, finishThrow, resolveMovement, type DiceRules } from "./index";

/** Faces drawn in order; `rollDice` turns r into floor(r · sides) + 1. */
const draws = (faces: number[], sides = 6) => {
  let next = 0;
  return () => (faces[next++]! - 0.5) / sides;
};

const rules = (over: Partial<DiceRules>): DiceRules => ({ ...NO_DICE_RULES, ...over });
const d6 = { count: 1, sides: 6 };
const twoD6 = { count: 2, sides: 6 };

describe("finishThrow — rerolls and a second throw (steps 2–3)", () => {
  it("leaves a throw alone when nothing is asked", () => {
    expect(finishThrow([3], d6, "passed", draws([]), NO_DICE_RULES)).toEqual({ faces: [3], throws: [[3]] });
  });

  it("throws a listed face again, once — and only that die", () => {
    // 1 is thrown again and shows 1 again: once means once.
    expect(finishThrow([1], d6, "passed", draws([1]), rules({ rerollValues: [1] })).faces).toEqual([1]);
    expect(finishThrow([1, 5], twoD6, "dropped", draws([4]), rules({ rerollValues: [1] })).faces).toEqual([4, 5]);
    expect(finishThrow([6, 6], twoD6, "dropped", draws([2, 3]), rules({ rerollValues: [6] })).faces).toEqual([2, 3]);
  });

  it("keeps the throw better for the player: the higher on a pass, the lower on a drop", () => {
    expect(finishThrow([2], d6, "passed", draws([5]), rules({ bestOfTwo: true }))).toEqual({ faces: [5], throws: [[2], [5]] });
    expect(finishThrow([2, 2], twoD6, "dropped", draws([5, 6]), rules({ bestOfTwo: true })).faces).toEqual([2, 2]);
    // The worse throw: the lower pass, the higher drop.
    expect(finishThrow([2], d6, "passed", draws([5]), rules({ worstOfTwo: true })).faces).toEqual([2]);
    expect(finishThrow([2, 2], twoD6, "dropped", draws([5, 6]), rules({ worstOfTwo: true })).faces).toEqual([5, 6]);
  });

  it("a tie keeps the first throw", () => {
    expect(finishThrow([4], d6, "passed", draws([4]), rules({ bestOfTwo: true }))).toEqual({ faces: [4], throws: [[4], [4]] });
  });

  it("best and worst of two together cancel out: one ordinary throw", () => {
    const thrown = finishThrow([3], d6, "passed", draws([6]), rules({ bestOfTwo: true, worstOfTwo: true }));
    expect(thrown).toEqual({ faces: [3], throws: [[3]] });
  });

  it("the second throw gets the same rerolls", () => {
    const thrown = finishThrow([1], d6, "passed", draws([2, 1, 5]), rules({ rerollValues: [1], bestOfTwo: true }));
    // First: 1 → 2. Second: 1 → 5. The better is 5.
    expect(thrown).toEqual({ faces: [5], throws: [[2], [5]] });
  });
});

describe("diceResult — the result modifiers (step 5)", () => {
  it("adds, then caps at the lowest asked, then never goes below 1", () => {
    expect(diceResult([4], 6, NO_DICE_RULES)).toEqual({ result: 4, direction: null });
    expect(diceResult([4], 6, rules({ resultDelta: 2 })).result).toBe(6);
    expect(diceResult([4], 6, rules({ resultDelta: 2, resultCap: 3 })).result).toBe(3);
    expect(diceResult([2], 6, rules({ resultDelta: -2 })).result).toBe(1);
    expect(diceResult([3, 4], 6, rules({ resultDelta: -2 })).result).toBe(5);
  });

  it("no dice is a result of nothing, not a minimum of 1", () => {
    expect(diceResult([], 6, rules({ resultDelta: 3 }))).toEqual({ result: 0, direction: null });
  });

  it("a direction rule sends the lower half of the range back, the upper half forward", () => {
    const compass = rules({ reverseLowerHalf: true });
    expect([1, 2, 3, 4, 5, 6].map((f) => diceResult([f], 6, compass).direction)).toEqual([
      "back",
      "back",
      "back",
      "forward",
      "forward",
      "forward",
    ]);
    // Two dice: 2–6 below the middle of 2..12, 7 and up forward.
    expect(diceResult([3, 3], 6, compass).direction).toBe("back");
    expect(diceResult([3, 4], 6, compass).direction).toBe("forward");
    // Judged on the faces, not on the modified result.
    expect(diceResult([3], 6, rules({ reverseLowerHalf: true, resultDelta: 3 }))).toEqual({ result: 6, direction: "back" });
  });
});

describe("resolveMovement — the move a result makes (step 6)", () => {
  const config = (over: Partial<SeasonConfig["dice"]> = {}, points: Partial<SeasonConfig["points"]> = {}): SeasonConfig => ({
    ...DEFAULT_SEASON_CONFIG,
    dice: { ...DEFAULT_SEASON_CONFIG.dice, ...over },
    points: { ...DEFAULT_SEASON_CONFIG.points, bonusAddsToRollOnPass: false, ...points },
    board: { ...DEFAULT_SEASON_CONFIG.board, size: 60, loop: false },
  });
  const move = (input: {
    outcome: "passed" | "dropped";
    result: number;
    direction?: "back" | "forward" | null;
    streakDrop?: number;
    balance?: number;
    cfg?: SeasonConfig;
  }) =>
    resolveMovement({
      currentPosition: 30,
      balancePoints: input.balance ?? 0,
      outcome: input.outcome,
      streakPass: 0,
      streakDrop: input.streakDrop ?? 0,
      config: input.cfg ?? config(),
      rng: () => 0,
      dice: { faces: [input.result], result: input.result, direction: input.direction ?? null },
    }).newPosition - 30;

  it("a pass goes forward and a drop back by the result", () => {
    expect(move({ outcome: "passed", result: 4 })).toBe(4);
    expect(move({ outcome: "dropped", result: 4 })).toBe(-4);
  });

  it("a direction rule decides the sign on either outcome; the size is what the move would have been", () => {
    expect(move({ outcome: "passed", result: 2, direction: "back" })).toBe(-2);
    expect(move({ outcome: "dropped", result: 5, direction: "forward" })).toBe(5);
    const streak = config({ dropStreakMultiplier: true });
    expect(move({ outcome: "dropped", result: 5, direction: "forward", streakDrop: 1, cfg: streak })).toBe(10);
  });

  it("points lengthen the move in whichever direction it goes", () => {
    const points = config({}, { bonusAddsToRollOnPass: true });
    expect(move({ outcome: "passed", result: 3, balance: 2, cfg: points })).toBe(5);
    expect(move({ outcome: "dropped", result: 3, balance: 2, cfg: points })).toBe(-5);
    expect(move({ outcome: "passed", result: 3, balance: 2, direction: "back", cfg: points })).toBe(-5);
  });
});
