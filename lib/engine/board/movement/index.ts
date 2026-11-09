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

/** What `afterDice` asked of the dice (spec §7.2, steps 3 and 5). */
export type DiceRules = Pick<
  IeeModifiers,
  "rerollValues" | "bestOfTwo" | "worstOfTwo" | "resultDelta" | "resultCap" | "reverseLowerHalf"
>;

export const NO_DICE_RULES: DiceRules = {
  rerollValues: [],
  bestOfTwo: false,
  worstOfTwo: false,
  resultDelta: 0,
  resultCap: null,
  reverseLowerHalf: false,
};

export interface ThrownDice {
  /** The faces that count. */
  faces: number[];
  /** Every throw in order — the first, then the second of a best- or worst-of-two — after its rerolls. */
  throws: number[][];
}

/** Each die showing one of `values` is thrown again, once. */
export function rerollFaces(faces: readonly number[], values: readonly number[], sides: number, rng: () => number): number[] {
  if (values.length === 0) return [...faces];
  return faces.map((face) => (values.includes(face) ? rollDice(1, sides, rng)[0]! : face));
}

const sumOf = (faces: readonly number[]) => faces.reduce((acc, die) => acc + die, 0);

/**
 * Steps 2–3 of the dice pipeline (spec §7.2), once the first throw is known:
 * the faces asked for are thrown again, once each; a best- or worst-of-two
 * throws the dice a second time — with the same rerolls — and keeps the throw
 * better or worse *for the player*: the higher sum on a pass, the lower on a
 * drop. Asked for both, the two cancel out and the first throw stands.
 */
export function finishThrow(
  first: readonly number[],
  composition: { count: number; sides: number },
  outcome: "passed" | "dropped",
  rng: () => number,
  rules: DiceRules,
): ThrownDice {
  const one = rerollFaces(first, rules.rerollValues, composition.sides, rng);
  if (rules.bestOfTwo === rules.worstOfTwo) return { faces: one, throws: [one] };
  const two = rerollFaces(rollDice(composition.count, composition.sides, rng), rules.rerollValues, composition.sides, rng);
  const higher = sumOf(two) > sumOf(one) ? two : one;
  const lower = sumOf(two) < sumOf(one) ? two : one;
  const playerWantsHigh = outcome === "passed";
  const keep = rules.bestOfTwo === playerWantsHigh ? higher : lower;
  return { faces: keep, throws: [one, two] };
}

export interface DiceResult {
  /** The dice sum after the result modifiers: additions, then the cap, then at least 1. */
  result: number;
  /** Set by a direction rule: the dice decide which way the move goes. */
  direction: "back" | "forward" | null;
}

/**
 * Step 5: the result modifiers. Additions first, then the cap (the lowest
 * asked for), then a minimum of 1 — a move made with dice is never a move of
 * nothing. A direction rule sends the lower half of the dice range back and
 * the upper half forward, judged on the faces as thrown.
 */
export function diceResult(faces: readonly number[], sides: number, rules: DiceRules): DiceResult {
  return diceResultOfSum(sumOf(faces), faces.length, sides, rules);
}

/** `diceResult` for a throw known by its sum and how many dice made it. */
export function diceResultOfSum(sum: number, count: number, sides: number, rules: DiceRules): DiceResult {
  if (count === 0) return { result: 0, direction: null };
  let result = sum + rules.resultDelta;
  if (rules.resultCap !== null) result = Math.min(result, rules.resultCap);
  result = Math.max(1, result);
  // The lower half of count..count·sides: below the middle of the range.
  const direction = rules.reverseLowerHalf ? (sum * 2 < count * (sides + 1) ? "back" : "forward") : null;
  return { result, direction };
}

export function resolveMovement(input: MovementInput): MovementResult {
  const { config, outcome, balancePoints, streakPass, streakDrop, rng } = input;
  const balanceUsable = config.points.bonusAddsToRollOnPass && balancePoints > 0;
  const { count: diceCount, sides: diceSides } = modifiedDice(
    config.dice,
    outcome,
    input.modifiers,
  );
  const faces = input.dice?.faces ?? rollDice(diceCount, diceSides, rng);
  const { result, direction } = input.dice ?? diceResult(faces, diceSides, NO_DICE_RULES);
  // A pass goes forward and a drop back, unless a direction rule decided.
  const back = direction === null ? outcome === "dropped" : direction === "back";
  let magnitude = result;
  if (outcome === "dropped" && config.dice.dropStreakMultiplier && streakDrop > 0) {
    magnitude *= streakDrop + 1;
  }
  // Points lengthen the move in whichever direction it goes.
  if (balanceUsable) magnitude += balancePoints;
  const signedStep = back ? -magnitude : magnitude;
  const newPosition = normalizePosition(input.currentPosition + signedStep, config.board);
  const newBalancePoints = balanceUsable && config.points.resetBalanceAfterUse ? 0 : balancePoints;
  return {
    diceResults: [...faces],
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
  // A cancelled move (`noMove`) leaves the token where the turn started; an
  // explicit `forcedPosition` still beats it, as it beats everything else.
  const settled = modifiers.cancelMove ? fromPosition : Math.max(0, directed);
  const target = modifiers.forcedPosition ?? settled;
  return {
    ...result,
    newPosition: normalizePosition(target, board),
    newBalancePoints: Math.max(
      0,
      result.newBalancePoints + modifiers.balanceDelta,
    ),
  };
}
