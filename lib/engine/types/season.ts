import type { GamePoolConfig } from "./game-pool";

/** Season configuration, stored as JSONB `seasons.config`. */
export interface SeasonConfig {
  dice: {
    sides: number;
    passDiceCount: number;
    dropDiceCount: number;
    dropStreakMultiplier: boolean;
  };
  points: {
    startingBalance: number;
    bonusAddsToRollOnPass: boolean;
    resetBalanceAfterUse: boolean;
  };
  board: {
    size: number;
    loop: boolean;
    bonusCount: number;
    penaltyCount: number;
    teleportCount: number;
    eventCount: number;
    distribution: import("./board").BoardDistribution;
    regenerateOnSave: boolean;
    perCellGenre: boolean;
  };
  rerolls: { allowed: boolean; limitPerGame: number; requireApproval: boolean };
  moderation: { completionRequireApproval: boolean };
  gamePool: GamePoolConfig;
  rules: { mode: "auto" | "manual" };
}

export type RollOutcome = "passed" | "dropped" | "rerolled";
