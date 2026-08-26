import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./config";
import { normalizePosition, resolveMovement } from "./movement";
import type { MovementInput, SeasonConfig } from "./types";

/** rng yielding dice so that die i of `dice` is rolled at call i. */
const rngFor = (dice: number[], sides: number): (() => number) => {
  let call = 0;
  return () => (dice[call++ % dice.length] - 0.5) / sides;
};

const configWith = (
  overrides: { [K in keyof SeasonConfig]?: Partial<SeasonConfig[K]> },
): SeasonConfig => ({
  dice: { ...DEFAULT_SEASON_CONFIG.dice, ...overrides.dice },
  points: { ...DEFAULT_SEASON_CONFIG.points, ...overrides.points },
  board: { ...DEFAULT_SEASON_CONFIG.board, ...overrides.board },
  rerolls: { ...DEFAULT_SEASON_CONFIG.rerolls, ...overrides.rerolls },
  gamePool: {
    ...DEFAULT_SEASON_CONFIG.gamePool,
    ...overrides.gamePool,
    filters: {
      ...DEFAULT_SEASON_CONFIG.gamePool.filters,
      ...(overrides.gamePool?.filters ?? {}),
    },
    catalog: {
      ...DEFAULT_SEASON_CONFIG.gamePool.catalog,
      ...(overrides.gamePool?.catalog ?? {}),
    },
  },
});

const baseInput = (overrides: Partial<MovementInput>): MovementInput => ({
  currentPosition: 10,
  balancePoints: 0,
  outcome: "passed",
  streakPass: 0,
  streakDrop: 0,
  config: DEFAULT_SEASON_CONFIG,
  rng: () => 0.5,
  ...overrides,
});

describe("resolveMovement — passed", () => {
  it("moves forward by the raw dice sum and bumps streakPass", () => {
    const input = baseInput({
      currentPosition: 5,
      streakDrop: 3,
      rng: rngFor([4], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    expect(resolveMovement(input)).toEqual({
      diceResults: [4],
      newPosition: 9,
      newBalancePoints: 0,
      newStreakPass: 1,
      newStreakDrop: 0,
    });
  });

  it("adds a positive balance to the step and zeroes it", () => {
    const input = baseInput({
      balancePoints: 7,
      rng: rngFor([3], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    const result = resolveMovement(input);
    expect(result.newPosition).toBe(10 + 3 + 7);
    expect(result.newBalancePoints).toBe(0);
  });

  it("keeps the balance when resetBalanceAfterUse is false", () => {
    const input = baseInput({
      balancePoints: 7,
      config: configWith({ points: { resetBalanceAfterUse: false } }),
      rng: rngFor([3], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    const result = resolveMovement(input);
    expect(result.newPosition).toBe(20);
    expect(result.newBalancePoints).toBe(7);
  });

  it("ignores the balance when bonusAddsToRollOnPass is false", () => {
    const input = baseInput({
      balancePoints: 7,
      config: configWith({ points: { bonusAddsToRollOnPass: false } }),
      rng: rngFor([3], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    const result = resolveMovement(input);
    expect(result.newPosition).toBe(13);
    expect(result.newBalancePoints).toBe(7);
  });

  it("adds nothing for zero or negative balance", () => {
    for (const balancePoints of [0, -5]) {
      const input = baseInput({
        balancePoints,
        rng: rngFor([3], DEFAULT_SEASON_CONFIG.dice.sides),
      });
      const result = resolveMovement(input);
      expect(result.newPosition).toBe(13);
      expect(result.newBalancePoints).toBe(balancePoints);
    }
  });

  it("clamps at the upper bound when loop is disabled", () => {
    const input = baseInput({
      currentPosition: DEFAULT_SEASON_CONFIG.board.size - 2,
      rng: rngFor([6], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    expect(resolveMovement(input).newPosition).toBe(DEFAULT_SEASON_CONFIG.board.size - 1);
  });

  it("wraps around when loop is enabled", () => {
    const input = baseInput({
      currentPosition: 38,
      config: configWith({ board: { size: 40, loop: true } }),
      rng: rngFor([4], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    expect(resolveMovement(input).newPosition).toBe(2);
  });
});

describe("resolveMovement — dropped", () => {
  it("moves backward by the raw sum, resets streakPass, bumps streakDrop", () => {
    const input = baseInput({
      outcome: "dropped",
      streakPass: 4,
      streakDrop: 0,
      rng: rngFor([2, 5], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    expect(resolveMovement(input)).toEqual({
      diceResults: [2, 5],
      newPosition: 3,
      newBalancePoints: 0,
      newStreakPass: 0,
      newStreakDrop: 1,
    });
  });

  it("multiplies the sum when dropStreakMultiplier is on and streakDrop > 0", () => {
    const input = baseInput({
      outcome: "dropped",
      streakDrop: 2,
      rng: rngFor([1, 1], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    const result = resolveMovement(input);
    // sum=2, multiplied by (streakDrop + 1) = 3
    expect(result.diceResults).toEqual([1, 1]);
    expect(result.newPosition).toBe(10 - 6);
    expect(result.newStreakDrop).toBe(3);
  });

  it("does not multiply when the toggle is off", () => {
    const input = baseInput({
      outcome: "dropped",
      streakDrop: 2,
      config: configWith({ dice: { dropStreakMultiplier: false } }),
      rng: rngFor([1, 1], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    expect(resolveMovement(input).newPosition).toBe(8);
  });

  it("does not multiply when streakDrop is 0 even if the toggle is on", () => {
    const input = baseInput({
      outcome: "dropped",
      streakDrop: 0,
      rng: rngFor([1, 1], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    expect(resolveMovement(input).newPosition).toBe(8);
  });

  it("adds the balance to the backward magnitude and consumes it", () => {
    const input = baseInput({
      outcome: "dropped",
      balancePoints: 4,
      rng: rngFor([1, 1], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    const result = resolveMovement(input);
    expect(result.newPosition).toBe(10 - (2 + 4));
    expect(result.newBalancePoints).toBe(0);
  });

  it("clamps at the lower bound when loop is disabled", () => {
    const input = baseInput({
      outcome: "dropped",
      currentPosition: 2,
      rng: rngFor([5, 5], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    expect(resolveMovement(input).newPosition).toBe(0);
  });

  it("wraps below zero when loop is enabled", () => {
    const input = baseInput({
      outcome: "dropped",
      currentPosition: 1,
      config: configWith({ board: { size: 40, loop: true } }),
      rng: rngFor([2, 3], DEFAULT_SEASON_CONFIG.dice.sides),
    });
    expect(resolveMovement(input).newPosition).toBe(36);
  });
});

describe("normalizePosition", () => {
  const clamped = { ...DEFAULT_SEASON_CONFIG.board, size: 40, loop: false as const };
  const looped = { ...DEFAULT_SEASON_CONFIG.board, size: 40, loop: true as const };

  it("clamps into [0, size-1]", () => {
    expect(normalizePosition(-7, clamped)).toBe(0);
    expect(normalizePosition(39, clamped)).toBe(39);
    expect(normalizePosition(100, clamped)).toBe(39);
  });

  it("wraps modulo size including negatives", () => {
    expect(normalizePosition(40, looped)).toBe(0);
    expect(normalizePosition(42, looped)).toBe(2);
    expect(normalizePosition(-1, looped)).toBe(39);
    expect(normalizePosition(-41, looped)).toBe(39);
  });
});
