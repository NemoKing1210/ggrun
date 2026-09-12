import type { SeasonConfig, RollOutcome } from "./season";
import type { IeeModifiers } from "./iee";

export interface MovementInput {
  currentPosition: number;
  balancePoints: number;
  outcome: Exclude<RollOutcome, "rerolled">;
  streakPass: number;
  streakDrop: number;
  config: SeasonConfig;
  rng: () => number;
  /**
   * Reduced result of the `beforeMovement` hook. Optional so every existing
   * call site keeps compiling; omitted means "no effects are speaking".
   */
  modifiers?: IeeModifiers;
}

export interface MovementResult {
  diceResults: number[];
  newPosition: number;
  newBalancePoints: number;
  newStreakPass: number;
  newStreakDrop: number;
}

/** Mutable per-player state within a season (`season_players`). */
export interface SeasonPlayerState {
  currentPosition: number;
  balancePoints: number;
  streakPass: number;
  streakDrop: number;
  rerollsUsed: number;
}
