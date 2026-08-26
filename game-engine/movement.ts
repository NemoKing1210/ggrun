import { rollDice } from "./dice";
import type { MovementInput, MovementResult, SeasonConfig } from "./types";

/**
 * Maps a raw (possibly out-of-range) position onto the board.
 * loop=false: clamped to [0, size-1]; loop=true: wrapped modulo size
 * (negative positions wrap back from the start).
 */
export function normalizePosition(position: number, board: SeasonConfig["board"]): number {
  const { size, loop } = board;
  if (!loop) {
    return Math.min(Math.max(position, 0), size - 1);
  }
  const wrapped = position % size;
  return wrapped < 0 ? wrapped + size : wrapped;
}

/**
 * Resolves a single passed/dropped roll into movement (PLAN.md 6.2 rules):
 *
 * - passed: roll passDiceCount x d{sides}, move FORWARD by the sum; when the
 *   player holds a positive balance and `bonusAddsToRollOnPass` is set, the
 *   balance augments the step and is consumed (zeroed when
 *   `resetBalanceAfterUse`). streakDrop resets, streakPass increments.
 * - dropped: roll dropDiceCount x d{sides}; when `dropStreakMultiplier` is set
 *   and streakDrop > 0 the sum is multiplied by (streakDrop + 1); move
 *   BACKWARD by the resulting magnitude. The balance is processed the same way
 *   as on pass (added to the magnitude, consumed/reset per config).
 *   streakPass resets, streakDrop increments.
 * - rerolled never reaches movement (handled by the roll state machine).
 *
 * `diceResults` always holds the raw individual dice; the streak multiplier
 * applies only to the movement magnitude.
 */
export function resolveMovement(input: MovementInput): MovementResult {
  const { config, outcome, balancePoints, streakPass, streakDrop, rng } = input;

  const balanceUsable = config.points.bonusAddsToRollOnPass && balancePoints > 0;

  let diceResults: number[];
  let signedStep: number;

  if (outcome === "passed") {
    diceResults = rollDice(config.dice.passDiceCount, config.dice.sides, rng);
    signedStep = diceResults.reduce((acc, die) => acc + die, 0);
    if (balanceUsable) signedStep += balancePoints;
  } else {
    diceResults = rollDice(config.dice.dropDiceCount, config.dice.sides, rng);
    let magnitude = diceResults.reduce((acc, die) => acc + die, 0);
    if (config.dice.dropStreakMultiplier && streakDrop > 0) {
      magnitude *= streakDrop + 1;
    }
    if (balanceUsable) magnitude += balancePoints;
    signedStep = -magnitude;
  }

  const newPosition = normalizePosition(
    input.currentPosition + signedStep,
    config.board,
  );

  const newBalancePoints =
    balanceUsable && config.points.resetBalanceAfterUse ? 0 : balancePoints;

  return {
    diceResults,
    newPosition,
    newBalancePoints,
    newStreakPass: outcome === "passed" ? streakPass + 1 : 0,
    newStreakDrop: outcome === "dropped" ? streakDrop + 1 : 0,
  };
}
