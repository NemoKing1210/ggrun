import { z } from "zod";
import type { SeasonConfig } from "./types";

/**
 * Default MVP configuration (PLAN.md section 6.2).
 * Numbers match the reference `season.config` example verbatim.
 */
export const DEFAULT_SEASON_CONFIG: SeasonConfig = {
  dice: {
    sides: 6,
    passDiceCount: 1,
    dropDiceCount: 2,
    dropStreakMultiplier: true,
  },
  points: {
    startingBalance: 0,
    bonusAddsToRollOnPass: true,
    resetBalanceAfterUse: true,
  },
  board: { size: 40, loop: false },
  rerolls: { allowed: true, limitPerGame: 1 },
};

const int = (min: number) => z.number().int().min(min);

export const DiceConfigSchema = z.object({
  sides: int(2).default(DEFAULT_SEASON_CONFIG.dice.sides),
  passDiceCount: int(0).default(DEFAULT_SEASON_CONFIG.dice.passDiceCount),
  dropDiceCount: int(0).default(DEFAULT_SEASON_CONFIG.dice.dropDiceCount),
  dropStreakMultiplier: z.boolean().default(DEFAULT_SEASON_CONFIG.dice.dropStreakMultiplier),
});

export const PointsConfigSchema = z.object({
  startingBalance: int(0).default(DEFAULT_SEASON_CONFIG.points.startingBalance),
  bonusAddsToRollOnPass: z.boolean().default(
    DEFAULT_SEASON_CONFIG.points.bonusAddsToRollOnPass,
  ),
  resetBalanceAfterUse: z.boolean().default(DEFAULT_SEASON_CONFIG.points.resetBalanceAfterUse),
});

export const BoardConfigSchema = z.object({
  size: int(1).default(DEFAULT_SEASON_CONFIG.board.size),
  loop: z.boolean().default(DEFAULT_SEASON_CONFIG.board.loop),
});

export const RerollsConfigSchema = z.object({
  allowed: z.boolean().default(DEFAULT_SEASON_CONFIG.rerolls.allowed),
  limitPerGame: int(0).default(DEFAULT_SEASON_CONFIG.rerolls.limitPerGame),
});

/**
 * Parses partial/admin-supplied JSON into a full SeasonConfig: every nested
 * object is optional (falling back to its defaults) and every field carries
 * a default too. Throws a ZodError on invalid values — intended for
 * admin-panel validation of season configs.
 */
export const SeasonConfigSchema = z
  .object({
    dice: DiceConfigSchema.default(DEFAULT_SEASON_CONFIG.dice),
    points: PointsConfigSchema.default(DEFAULT_SEASON_CONFIG.points),
    board: BoardConfigSchema.default(DEFAULT_SEASON_CONFIG.board),
    rerolls: RerollsConfigSchema.default(DEFAULT_SEASON_CONFIG.rerolls),
  })
  // Compile-time assertion: the parsed shape must satisfy the domain contract.
  .transform((parsed): SeasonConfig => parsed);
