import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "../../config";
import { emptyModifiers } from "../../iee";
import type { MovementResult } from "../../types";
import { applyMovementModifiers } from "./index";

const board = DEFAULT_SEASON_CONFIG.board;

const move = (newPosition: number): MovementResult => ({
  diceResults: [1],
  newPosition,
  newBalancePoints: 0,
  newStreakPass: 0,
  newStreakDrop: 1,
});

describe("applyMovementModifiers on a backwards move", () => {
  // Dropped moves travel negative. The floor is where the turn started, in the
  // direction it went: a shortening modifier may cancel the move but never
  // reverse it back past the starting cell.
  it("lets a step modifier cancel a backward move but not reverse it", () => {
    const result = move(17); // dropped one cell from 18
    expect(applyMovementModifiers(result, { ...emptyModifiers(), stepsDelta: 2 }, board, 18).newPosition).toBe(18);
    expect(applyMovementModifiers(result, { ...emptyModifiers(), stepsDelta: 100 }, board, 18).newPosition).toBe(18);
  });

  it("lets a negative modifier extend a backward move further back", () => {
    const result = move(17);
    expect(applyMovementModifiers(result, { ...emptyModifiers(), stepsDelta: -2 }, board, 18).newPosition).toBe(15);
  });

  it("still normalizes a backward move at the lower bound", () => {
    const result = move(1);
    expect(applyMovementModifiers(result, { ...emptyModifiers(), stepsDelta: -5 }, board, 3).newPosition).toBe(0);
  });
});

describe("applyMovementModifiers — forced position", () => {
  it("beats the step delta in either direction", () => {
    const result = move(17);
    expect(
      applyMovementModifiers(result, { ...emptyModifiers(), stepsDelta: -2, forcedPosition: 30 }, board, 18).newPosition,
    ).toBe(30);
  });

  it("clamps a forced position below the board start", () => {
    expect(
      applyMovementModifiers(move(17), { ...emptyModifiers(), forcedPosition: -5 }, board, 18).newPosition,
    ).toBe(0);
  });
});
