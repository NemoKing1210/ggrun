import { rollDice } from "../../dice";
import type { MovementInput, MovementResult, SeasonConfig } from "../../types";

export function normalizePosition(position: number, board: SeasonConfig["board"]): number {
  const { size, loop } = board;
  if (!loop) {
    return Math.min(Math.max(position, 0), size - 1);
  }
  const wrapped = position % size;
  return wrapped < 0 ? wrapped + size : wrapped;
}

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
