/**
 * The reaction window's arithmetic (docs/IEE_CONSTRUCTOR_SPEC.md §6.15, §7.4):
 * what a reaction item does to a throw at step 4, whether it changes anything
 * at all, and what it is expected to gain the player who uses it. The bots'
 * policy and the power estimate read the same numbers, so what a bot does is
 * what the power of the item assumes a player does.
 *
 * Pure. Expected values are exact: a throw is known by its sum, and a sum's
 * chances are a convolution of its dice.
 */
import { diceResultOfSum, rerollFaces, type DiceRules, type ThrownDice } from "../board/movement";
import { rollDice } from "../dice";

/** What a reaction item asks of the throw it is used on (§6.15). */
export interface ReactionRules {
  /** The dice are thrown again; the new throw stands. */
  reroll: boolean;
  /** The dice are thrown again; the better throw for the player counts. */
  bestOfTwo: boolean;
  /** Each die showing one of these faces is thrown again, once. */
  rerollValues: number[];
  /** Added to the result at step 5, with the statuses' additions. */
  resultDelta: number;
  /** The result is at most this, with the statuses' caps; null for none. */
  resultCap: number | null;
}

export const NO_REACTION: ReactionRules = { reroll: false, bestOfTwo: false, rerollValues: [], resultDelta: 0, resultCap: null };

/** The throw the window shows, as a reaction reads it. */
export interface ReactionView {
  outcome: "passed" | "dropped";
  dice: { count: number; sides: number };
  /** The faces that count after step 3. */
  faces: readonly number[];
  /** Every throw so far, each after its rerolls. */
  throws: readonly (readonly number[])[];
  /** What the holder's statuses asked of the dice at `afterDice` (steps 3 and 5). */
  rules: DiceRules;
}

const sumOf = (faces: readonly number[]) => faces.reduce((acc, face) => acc + face, 0);

/** The statuses' result modifiers joined by the reaction's: additions add up, the lower cap wins. */
export function withReaction(rules: DiceRules, reaction: ReactionRules): DiceRules {
  const caps = [rules.resultCap, reaction.resultCap].filter((c): c is number => c !== null);
  return {
    ...rules,
    resultDelta: rules.resultDelta + reaction.resultDelta,
    resultCap: caps.length > 0 ? Math.min(...caps) : null,
  };
}

/** Better for the player: the higher sum on a pass, the lower on a drop; a tie keeps the first. */
function betterFor(outcome: "passed" | "dropped", first: number[], second: number[]): number[] {
  const a = sumOf(first);
  const b = sumOf(second);
  return (outcome === "passed" ? b > a : b < a) ? second : first;
}

/**
 * Step 4 (§7.2): the reaction acts on the throw. A throw again is a new
 * throw — a die on it showing a face the statuses reroll at step 3 is thrown
 * again once too; a best- or worst-of-two of step 3 is not repeated.
 */
export function applyReaction(view: ReactionView, reaction: ReactionRules, rng: () => number): ThrownDice {
  const { count, sides } = view.dice;
  let faces = [...view.faces];
  const throws = view.throws.map((t) => [...t]);
  const again = () => rerollFaces(rollDice(count, sides, rng), view.rules.rerollValues, sides, rng);
  if (reaction.reroll) {
    faces = again();
    throws.push(faces);
  }
  if (reaction.bestOfTwo) {
    const second = again();
    throws.push(second);
    faces = betterFor(view.outcome, faces, second);
  }
  if (reaction.rerollValues.length > 0 && faces.some((f) => reaction.rerollValues.includes(f))) {
    faces = rerollFaces(faces, reaction.rerollValues, sides, rng);
    throws.push(faces);
  }
  return { faces, throws };
}

/** Whether a reaction would change anything on this throw — what the window offers (§6.15). */
export function reactionActs(view: ReactionView, reaction: ReactionRules): boolean {
  if (view.faces.length === 0) return false;
  if (reaction.reroll || reaction.bestOfTwo) return true;
  if (reaction.rerollValues.some((v) => view.faces.includes(v))) return true;
  const sum = sumOf(view.faces);
  const before = diceResultOfSum(sum, view.faces.length, view.dice.sides, view.rules).result;
  const after = diceResultOfSum(sum, view.faces.length, view.dice.sides, withReaction(view.rules, reaction)).result;
  return before !== after;
}

/** A die's faces after the statuses' rerolls at step 3: index = face. */
function dieChances(sides: number, rerollValues: readonly number[]): number[] {
  const chances = new Array<number>(sides + 1).fill(0);
  const listed = rerollValues.filter((v) => v >= 1 && v <= sides);
  for (let face = 1; face <= sides; face++) {
    // Thrown once; a listed face is thrown again once, and that one stands.
    chances[face] += (listed.includes(face) ? 0 : 1) / sides + listed.length / sides / sides;
  }
  return chances;
}

/** The chance of each sum `count` such dice show: index = sum. */
function sumChances(die: readonly number[], count: number): number[] {
  let dist = [1];
  for (let i = 0; i < count; i++) {
    const next = new Array<number>(dist.length + die.length - 1).fill(0);
    dist.forEach((p, s) => {
      if (p === 0) return;
      die.forEach((q, f) => {
        if (q !== 0) next[s + f]! += p * q;
      });
    });
    dist = next;
  }
  return dist;
}

/** The move a throw makes for the player, in cells: forward positive, back negative. */
function signedMove(sum: number, count: number, sides: number, rules: DiceRules, outcome: "passed" | "dropped"): number {
  if (count === 0) return 0;
  const { result, direction } = diceResultOfSum(sum, count, sides, rules);
  const back = direction === null ? outcome === "dropped" : direction === "back";
  return back ? -result : result;
}

/** The expected move of a sum distribution under `rules`. */
function expectedMove(dist: readonly number[], view: ReactionView, rules: DiceRules): number {
  let total = 0;
  dist.forEach((p, sum) => {
    if (p !== 0) total += p * signedMove(sum, view.dice.count, view.dice.sides, rules, view.outcome);
  });
  return total;
}

/** The move the throw shown makes, as it stands. */
export function currentMove(view: ReactionView): number {
  return signedMove(sumOf(view.faces), view.faces.length, view.dice.sides, view.rules, view.outcome);
}

/** The move an average throw of these dice makes, with the statuses' rules. */
export function averageMove(view: ReactionView): number {
  return expectedMove(sumChances(dieChances(view.dice.sides, view.rules.rerollValues), view.dice.count), view, view.rules);
}

/**
 * A bad throw for the player (§6.15): a move worse than an average throw's —
 * a pass that goes less far, a drop that goes further back.
 */
export function isBadThrow(view: ReactionView): boolean {
  return view.faces.length > 0 && currentMove(view) < averageMove(view);
}

/**
 * What a reaction is expected to gain the player on this throw, in cells of
 * the move — positive when it helps. A throw again, or the better of two, is
 * judged over every throw it may bring; a face rerolled over every face it
 * may turn into.
 */
export function reactionGain(view: ReactionView, reaction: ReactionRules): number {
  if (view.faces.length === 0) return 0;
  const { count, sides } = view.dice;
  const rules = withReaction(view.rules, reaction);
  const shown = sumOf(view.faces);
  let dist: number[];
  if (reaction.reroll || reaction.bestOfTwo) {
    const fresh = sumChances(dieChances(sides, view.rules.rerollValues), count);
    if (reaction.bestOfTwo) {
      // The better of the throw shown (or its throw again) and one more.
      const base = reaction.reroll ? fresh : pointAt(shown);
      dist = new Array<number>(fresh.length).fill(0);
      base.forEach((p, a) => {
        if (p === 0) return;
        fresh.forEach((q, b) => {
          if (q === 0) return;
          const keep = (view.outcome === "passed" ? b > a : b < a) ? b : a;
          dist[keep]! += p * q;
        });
      });
    } else {
      dist = fresh;
    }
  } else if (reaction.rerollValues.length > 0) {
    // The dice showing a listed face are thrown again, once; the others stay.
    const kept = view.faces.filter((f) => !reaction.rerollValues.includes(f));
    const again = sumChances(dieChances(sides, []), count - kept.length);
    const offset = sumOf(kept);
    dist = new Array<number>(offset + again.length).fill(0);
    again.forEach((p, s) => {
      if (p !== 0) dist[offset + s]! += p;
    });
  } else {
    dist = pointAt(shown);
  }
  return expectedMove(dist, view, rules) - currentMove(view);
}

/** A distribution that is one sum for certain. */
function pointAt(sum: number): number[] {
  const dist = new Array<number>(sum + 1).fill(0);
  dist[sum] = 1;
  return dist;
}

/**
 * Which reaction a bot takes (§7.4), the one the power of an item assumes a
 * player takes (§6.15): on a bad throw, the offer expected to gain the most —
 * if it gains anything; on any other throw, none.
 */
export function chooseReaction<T extends { rules: ReactionRules }>(view: ReactionView, offers: readonly T[]): T | null {
  if (!isBadThrow(view)) return null;
  let best: T | null = null;
  let bestGain = 0;
  for (const offer of offers) {
    const gain = reactionGain(view, offer.rules);
    if (gain > bestGain + 1e-9) {
      best = offer;
      bestGain = gain;
    }
  }
  return best;
}
