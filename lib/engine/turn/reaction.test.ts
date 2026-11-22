/**
 * The reaction window's arithmetic (docs/IEE_CONSTRUCTOR_SPEC.md §6.15, §7.4):
 * what a reaction does to a throw, when it changes anything, what it is
 * expected to gain, and which one a bot takes.
 */
import { describe, expect, it } from "vitest";

import { NO_DICE_RULES, type DiceRules } from "../board/movement";
import {
  NO_REACTION,
  applyReaction,
  averageMove,
  chooseReaction,
  currentMove,
  isBadThrow,
  reactionActs,
  reactionGain,
  withReaction,
  type ReactionRules,
  type ReactionView,
} from "./reaction";

/** A stream of faces for the dice: each draw shows the next face of `sides`. */
function facesRng(faces: readonly number[], sides = 6): () => number {
  let i = 0;
  return () => {
    const face = faces[Math.min(i, faces.length - 1)]!;
    i += 1;
    return (face - 1 + 0.5) / sides;
  };
}

const view = (over: Partial<ReactionView> = {}): ReactionView => ({
  outcome: "passed",
  dice: { count: 1, sides: 6 },
  faces: [2],
  throws: [[2]],
  rules: NO_DICE_RULES,
  ...over,
});

const reroll: ReactionRules = { ...NO_REACTION, reroll: true };
const best: ReactionRules = { ...NO_REACTION, bestOfTwo: true };
const plusOne: ReactionRules = { ...NO_REACTION, resultDelta: 1 };

describe("applyReaction — step 4 (spec §7.2, §7.4)", () => {
  it("a throw again: the new throw stands, whatever it shows", () => {
    expect(applyReaction(view({ faces: [5], throws: [[5]] }), reroll, facesRng([2]))).toEqual({ faces: [2], throws: [[5], [2]] });
  });

  it("the better of two: the higher on a pass, the lower on a drop, the first on a tie", () => {
    expect(applyReaction(view({ faces: [2] }), best, facesRng([5])).faces).toEqual([5]);
    expect(applyReaction(view({ faces: [5] }), best, facesRng([2])).faces).toEqual([5]);
    const drop = view({ outcome: "dropped", dice: { count: 2, sides: 6 }, faces: [6, 5], throws: [[6, 5]] });
    expect(applyReaction(drop, best, facesRng([1, 2]))).toEqual({ faces: [1, 2], throws: [[6, 5], [1, 2]] });
    expect(applyReaction(view({ faces: [3] }), best, facesRng([3])).throws).toEqual([[2], [3]]);
  });

  it("a throw again is a new throw: the statuses' face rerolls act on it too", () => {
    // «Удача» rerolls a 1: the coin's throw shows a 1, which is thrown again once.
    const lucky = view({ faces: [2], rules: { ...NO_DICE_RULES, rerollValues: [1] } });
    expect(applyReaction(lucky, reroll, facesRng([1, 4])).faces).toEqual([4]);
  });

  it("rerolling faces throws again only the dice showing them, once", () => {
    const two = view({ dice: { count: 2, sides: 6 }, faces: [1, 5], throws: [[1, 5]] });
    expect(applyReaction(two, { ...NO_REACTION, rerollValues: [1] }, facesRng([3])).faces).toEqual([3, 5]);
    // Nothing to throw again: the throw stands as it was.
    expect(applyReaction(view({ faces: [4] }), { ...NO_REACTION, rerollValues: [1] }, facesRng([6]))).toEqual({ faces: [4], throws: [[2]] });
  });
});

describe("reactionActs — what the window offers (spec §6.15)", () => {
  it("a throw again always changes the throw; rerolling faces only when one shows", () => {
    expect(reactionActs(view(), reroll)).toBe(true);
    expect(reactionActs(view(), best)).toBe(true);
    expect(reactionActs(view({ faces: [1] }), { ...NO_REACTION, rerollValues: [1] })).toBe(true);
    expect(reactionActs(view({ faces: [2] }), { ...NO_REACTION, rerollValues: [1] })).toBe(false);
  });

  it("a result change only when the result moves", () => {
    expect(reactionActs(view(), plusOne)).toBe(true);
    // A cap of 3 on a throw of 2 changes nothing; on a 5 it does.
    expect(reactionActs(view({ faces: [2] }), { ...NO_REACTION, resultCap: 3 })).toBe(false);
    expect(reactionActs(view({ faces: [5] }), { ...NO_REACTION, resultCap: 3 })).toBe(true);
    // Never below 1: −1 on a 1 does nothing.
    expect(reactionActs(view({ faces: [1] }), { ...NO_REACTION, resultDelta: -1 })).toBe(false);
  });

  it("no dice, nothing to react to", () => {
    expect(reactionActs(view({ dice: { count: 0, sides: 6 }, faces: [], throws: [[]] }), reroll)).toBe(false);
  });
});

describe("withReaction — the result modifiers of step 5", () => {
  it("additions add up, the lower cap wins", () => {
    const rules: DiceRules = { ...NO_DICE_RULES, resultDelta: -2, resultCap: 4 };
    expect(withReaction(rules, { ...NO_REACTION, resultDelta: 1, resultCap: 3 })).toMatchObject({ resultDelta: -1, resultCap: 3 });
    expect(withReaction(NO_DICE_RULES, plusOne)).toMatchObject({ resultDelta: 1, resultCap: null });
  });
});

describe("what a reaction is expected to gain (spec §6.15)", () => {
  it("a bad throw is a move worse than an average one: a short pass, a long drop", () => {
    expect(averageMove(view())).toBeCloseTo(3.5);
    expect(isBadThrow(view({ faces: [3] }))).toBe(true);
    expect(isBadThrow(view({ faces: [4] }))).toBe(false);
    const drop = view({ outcome: "dropped", dice: { count: 2, sides: 6 } });
    expect(currentMove({ ...drop, faces: [6, 6] })).toBe(-12);
    expect(isBadThrow({ ...drop, faces: [4, 4] })).toBe(true);
    expect(isBadThrow({ ...drop, faces: [3, 3] })).toBe(false);
  });

  it("a throw again brings an average throw: +2.5 on a pass of 1, −2.5 on a 6", () => {
    expect(reactionGain(view({ faces: [1] }), reroll)).toBeCloseTo(2.5);
    expect(reactionGain(view({ faces: [6] }), reroll)).toBeCloseTo(-2.5);
    // On a drop of 12 a throw again brings 7 back: 5 cells saved.
    expect(reactionGain(view({ outcome: "dropped", dice: { count: 2, sides: 6 }, faces: [6, 6] }), reroll)).toBeCloseTo(5);
  });

  it("the better of two never loses: E[max(0, X − x)] on a pass", () => {
    expect(reactionGain(view({ faces: [1] }), best)).toBeCloseTo(2.5);
    expect(reactionGain(view({ faces: [3] }), best)).toBeCloseTo(1);
    expect(reactionGain(view({ faces: [6] }), best)).toBeCloseTo(0);
  });

  it("rerolling faces: what the listed dice may turn into", () => {
    expect(reactionGain(view({ faces: [1] }), { ...NO_REACTION, rerollValues: [1] })).toBeCloseTo(2.5);
    const two = view({ dice: { count: 2, sides: 6 }, faces: [1, 4] });
    expect(reactionGain(two, { ...NO_REACTION, rerollValues: [1] })).toBeCloseTo(2.5);
  });

  it("+1 to the result helps a pass and costs a drop", () => {
    expect(reactionGain(view({ faces: [2] }), plusOne)).toBeCloseTo(1);
    expect(reactionGain(view({ outcome: "dropped", dice: { count: 2, sides: 6 }, faces: [2, 2] }), plusOne)).toBeCloseTo(-1);
  });
});

describe("chooseReaction — what a bot takes (spec §7.4)", () => {
  const offers = [
    { id: "elixir", rules: plusOne },
    { id: "coin", rules: reroll },
    { id: "gold", rules: best },
  ];

  it("on a bad throw, the offer expected to gain the most", () => {
    expect(chooseReaction(view({ faces: [1] }), offers)?.id).toBe("coin");
    // A pass of 3: a throw again brings 0.5, the better of two 1, +1 brings 1 — the first of the best stays.
    expect(chooseReaction(view({ faces: [3] }), offers.slice(1))?.id).toBe("gold");
  });

  it("on a throw no worse than average, none — the bot accepts", () => {
    expect(chooseReaction(view({ faces: [4] }), offers)).toBeNull();
  });

  it("none that gains: none — +1 on a bad drop moves the token further back", () => {
    expect(chooseReaction(view({ outcome: "dropped", dice: { count: 2, sides: 6 }, faces: [6, 6] }), [{ id: "elixir", rules: plusOne }])).toBeNull();
  });
});
