import { rollDice } from "../../dice";
import type {
  IeeModifiers,
  MovementInput,
  MovementResult,
  SeasonConfig,
} from "../../types";

export function normalizePosition(position: number, board: SeasonConfig["board"]): number {
  const { size, loop } = board;
  if (!loop) {
    return Math.min(Math.max(position, 0), size - 1);
  }
  const wrapped = position % size;
  return wrapped < 0 ? wrapped + size : wrapped;
}

/** Dice count/sides after `beforeMovement` modifiers, clamped to legal values. */
export function modifiedDice(
  dice: SeasonConfig["dice"],
  outcome: "passed" | "dropped",
  modifiers?: IeeModifiers,
): { count: number; sides: number } {
  const base = outcome === "passed" ? dice.passDiceCount : dice.dropDiceCount;
  return {
    count: Math.max(0, base + (modifiers?.diceCountDelta ?? 0)),
    // rollDice rejects fewer than 2 sides, so clamp rather than throw mid-turn.
    sides: Math.max(2, dice.sides + (modifiers?.diceSidesDelta ?? 0)),
  };
}

export function resolveMovement(input: MovementInput): MovementResult {
  const { config, outcome, balancePoints, streakPass, streakDrop, rng } = input;
  const balanceUsable = config.points.bonusAddsToRollOnPass && balancePoints > 0;
  const { count: diceCount, sides: diceSides } = modifiedDice(
    config.dice,
    outcome,
    input.modifiers,
  );
  let diceResults: number[];
  let signedStep: number;
  if (outcome === "passed") {
    diceResults = rollDice(diceCount, diceSides, rng);
    signedStep = diceResults.reduce((acc, die) => acc + die, 0);
    if (balanceUsable) signedStep += balancePoints;
  } else {
    diceResults = rollDice(diceCount, diceSides, rng);
    let magnitude = diceResults.reduce((acc, die) => acc + die, 0);
    if (config.dice.dropStreakMultiplier && streakDrop > 0) {
      magnitude *= streakDrop + 1;
    }
    if (balanceUsable) magnitude += balancePoints;
    signedStep = -magnitude;
  }
  const newPosition = normalizePosition(input.currentPosition + signedStep, config.board);
  const newBalancePoints = balanceUsable && config.points.resetBalanceAfterUse ? 0 : balancePoints;
  return {
    diceResults,
    newPosition,
    newBalancePoints,
    newStreakPass: outcome === "passed" ? streakPass + 1 : 0,
    newStreakDrop: outcome === "dropped" ? streakDrop + 1 : 0,
  };
}

/**
 * Applies the reduced `afterMovement` hook result to a computed move.
 *
 * Kept separate from `resolveMovement` because the two hooks fire at different
 * moments: dice modifiers must be known before the roll, step modifiers only
 * after it. An override (`forcedPosition`) beats the additive `stepsDelta`.
 */
export function applyMovementModifiers(
  result: MovementResult,
  modifiers: IeeModifiers,
  board: SeasonConfig["board"],
  /** Where the player stood before this turn — the floor a modifier may not cross. */
  fromPosition: number,
): MovementResult {
  // A step modifier may shrink a move to nothing. It may never reverse one.
  //
  // The clamp used to be `Math.max(0, …)` on the absolute position, which only
  // guarded cell 0: it stopped `normalizePosition(-1)` from wrapping a player
  // to the far end of a looping board, and stopped nothing else. Anywhere past
  // the start, a player who rolled a 1 while wearing heavy boots (-2) was
  // walked *backwards* one cell — a status that promises "your next move is
  // two cells shorter" quietly became a status that moves you back. The old
  // scenario passed because it only ever placed the player on cell 0.
  //
  // So the floor is where the turn started, in whichever direction the turn
  // went: a shortening modifier can cancel the move and stop there, while a
  // lengthening one is free to extend it. Forward wrapping on a loop board is
  // the point of a loop board and is untouched, and so is `forcedPosition`,
  // which is an explicit instruction rather than a nudge.
  const shifted = result.newPosition + modifiers.stepsDelta;
  const moved = result.newPosition - fromPosition;
  const directed = moved >= 0 ? Math.max(fromPosition, shifted) : Math.min(fromPosition, shifted);
  const target = modifiers.forcedPosition ?? Math.max(0, directed);
  return {
    ...result,
    newPosition: normalizePosition(target, board),
    newBalancePoints: Math.max(
      0,
      result.newBalancePoints + modifiers.balanceDelta,
    ),
  };
}
