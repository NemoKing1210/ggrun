import { describe, expect, it } from "vitest";

import {
  PLAY_MODEL,
  arrivalOf,
  bestItemWorth,
  expectedValue,
  fairDie,
  heldItemWorth,
  itemsHeldUpTo,
  meanHeld,
  rerolledDie,
  sumDistribution,
  twoThrows,
} from "./play-model";

const total = (dist: readonly number[]) => dist.reduce((a, b) => a + b, 0);
const mean = (dist: readonly number[]) => expectedValue(dist, (s) => s);

describe("play model — the dice, exactly", () => {
  it("sums of fair dice are distributions with the means they should have", () => {
    const one = sumDistribution(fairDie(6), 1);
    const two = sumDistribution(fairDie(6), 2);
    expect(total(one)).toBeCloseTo(1);
    expect(total(two)).toBeCloseTo(1);
    expect(mean(one)).toBeCloseTo(3.5);
    expect(mean(two)).toBeCloseTo(7);
    expect(two[7]).toBeCloseTo(6 / 36);
    expect(sumDistribution(fairDie(6), 0)).toEqual([1]);
  });

  it("a die thrown again on listed faces keeps a whole distribution; faces it does not have change nothing", () => {
    const again = rerolledDie(6, [1]);
    expect(total(again)).toBeCloseTo(1);
    expect(again[1]).toBeCloseTo(1 / 36);
    expect(mean(again)).toBeCloseTo(3.5 + 2.5 / 6);
    expect(rerolledDie(6, [9])).toEqual(fairDie(6));
  });

  it("the better and the worse of two throws", () => {
    const d6 = sumDistribution(fairDie(6), 1);
    expect(total(twoThrows(d6, "max"))).toBeCloseTo(1);
    expect(mean(twoThrows(d6, "max"))).toBeCloseTo(161 / 36);
    expect(mean(twoThrows(d6, "min"))).toBeCloseTo(91 / 36);
  });
});

describe("play model — the items players hold (wave B, spec §6.12)", () => {
  it("a held item is worth its rarity's, or the mix the wheel hands out", () => {
    expect(heldItemWorth(["rare"])).toBe(PLAY_MODEL.heldItem.rare.worth);
    // Common and rare at their shares among what players hold.
    const { common, rare } = PLAY_MODEL.heldItem;
    expect(heldItemWorth(["common", "rare"])).toBeCloseTo((common.share * common.worth + rare.share * rare.worth) / (common.share + rare.share));
    expect(heldItemWorth(null)).toBeCloseTo(heldItemWorth(["common", "rare", "epic", "legendary"]));
    expect(heldItemWorth([])).toBe(heldItemWorth(null));
    const shares = Object.values(PLAY_MODEL.heldItem).reduce((sum, r) => sum + r.share, 0);
    expect(shares).toBeCloseTo(1);
  });

  it("a holder gives only what they hold: the Poisson spread around the items held", () => {
    const mean = meanHeld("bonus");
    expect(itemsHeldUpTo(1, null)).toBeCloseTo(1 - Math.exp(-mean));
    expect(itemsHeldUpTo(2, null)).toBeCloseTo(1 - Math.exp(-mean) + 1 - Math.exp(-mean) * (1 + mean));
    // Fewer of one rarity than of all of them.
    expect(itemsHeldUpTo(1, ["epic"])).toBeLessThan(itemsHeldUpTo(1, null));
    expect(itemsHeldUpTo(0, null)).toBe(0);
  });

  it("a pick takes the strongest of what its rarities carry", () => {
    expect(bestItemWorth(["common"])).toBe(PLAY_MODEL.bestItem.common);
    expect(bestItemWorth(["rare", "common"])).toBe(PLAY_MODEL.bestItem.rare);
    expect(bestItemWorth(null)).toBe(PLAY_MODEL.bestItem.legendary);
  });
});

describe("play model — what arrives (wave B, spec §6.13)", () => {
  it("one arrival of a scope: how often per roll, and its worth to whoever receives it", () => {
    const { arrival } = PLAY_MODEL;
    expect(arrivalOf({ is: "harm" })).toEqual({ perRoll: arrival.harm.perRoll, worth: -arrival.harm.worth });
    expect(arrivalOf({ is: "moveBack" })).toEqual({ perRoll: arrival.moveBack.perRoll, worth: -arrival.moveBack.worth });
    const bonusItem = arrivalOf({ is: "entry", kind: "item", character: "bonus" });
    expect(bonusItem.perRoll).toBeCloseTo(arrival.entry.bonus.item.perRoll, 6);
    expect(bonusItem.worth).toBeCloseTo(arrival.entry.bonus.item.worth, 6);
    const penaltyEffect = arrivalOf({ is: "entry", kind: "effect", character: "penalty" });
    expect(penaltyEffect.perRoll).toBeCloseTo(arrival.entry.penalty.effect.perRoll, 6);
    // A penalty arrives as a loss.
    expect(penaltyEffect.worth).toBeCloseTo(-arrival.entry.penalty.effect.worth, 6);
  });

  it("a wider scope is its parts at their rates — everything at once without one", () => {
    const { harm, moveBack, entry } = PLAY_MODEL.arrival;
    const { item: bonusItem, effect: bonusEffect } = entry.bonus;
    const { item: cursed, effect: penalty } = entry.penalty;
    const bonus = arrivalOf({ is: "entry", kind: null, character: "bonus" });
    expect(bonus.perRoll).toBeCloseTo(bonusItem.perRoll + bonusEffect.perRoll, 6);
    expect(bonus.worth).toBeCloseTo((bonusItem.perRoll * bonusItem.worth + bonusEffect.perRoll * bonusEffect.worth) / bonus.perRoll, 6);
    const items = arrivalOf({ is: "entry", kind: "item", character: null });
    expect(items.worth).toBeCloseTo((bonusItem.perRoll * bonusItem.worth - cursed.perRoll * cursed.worth) / (bonusItem.perRoll + cursed.perRoll), 6);
    const everything = arrivalOf(null);
    expect(everything.perRoll).toBeCloseTo(harm.perRoll + moveBack.perRoll + bonusItem.perRoll + bonusEffect.perRoll + cursed.perRoll + penalty.perRoll, 6);
    // Most of what arrives is a setback: penalties, harm and moves back outweigh the bonuses.
    expect(everything.worth).toBeLessThan(0);
  });
});

describe("play model — the next game (wave C, spec §6.16)", () => {
  it("a pass instead of a drop: a pass's die forward and a drop's two back spared, at the streak weight", () => {
    const { dieMean, passDice, dropDice, dropWeight, passRate } = PLAY_MODEL;
    expect(PLAY_MODEL.gameSwing).toBeCloseTo(passDice * dieMean + dropDice * dieMean * (dropWeight / (1 - passRate)), 9);
    expect(PLAY_MODEL.gameSwing).toBeCloseTo(11.9, 9);
  });

  it("what the holder picks works for them, what they did not pick against them; a choice gains less the wider it is", () => {
    const { pool } = PLAY_MODEL;
    expect(pool.picked.require.genre).toBeGreaterThan(pool.picked.require.years);
    expect(pool.picked.require.years).toBeGreaterThan(pool.picked.exclude.genre);
    for (const shift of Object.values(pool.imposed)) expect(shift).toBeLessThan(0);
    expect(pool.condition).toBeLessThan(0);
    const choices = [pool.choice[2], pool.choice[3], pool.choice[4], pool.choice[5]];
    for (let i = 1; i < choices.length; i++) {
      expect(choices[i]!).toBeGreaterThan(choices[i - 1]!);
      expect(choices[i]! - choices[i - 1]!).toBeLessThanOrEqual(choices[1]! - choices[0]!);
    }
  });
});
