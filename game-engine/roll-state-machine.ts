import type { RollOutcome, SeasonConfig } from "./types";

/**
 * Lifecycle statuses of a single game roll:
 * `rolled -> in_progress -> passed | dropped | rerolled`.
 * A `rerolled` outcome spawns a brand-new roll (back to `rolled`) with the
 * per-game reroll counter incremented.
 */
export type RollStatus =
  | "rolled"
  | "in_progress"
  | "passed"
  | "dropped"
  | "rerolled";

/** Status every new game roll starts in (`game_rolls.status` initial value). */
export const INITIAL_ROLL_STATUS: RollStatus = "rolled";

const OUTCOMES_BY_STATUS: Record<RollStatus, readonly RollOutcome[]> = {
  rolled: [],
  in_progress: ["passed", "dropped", "rerolled"],
  passed: [],
  dropped: [],
  rerolled: [],
};

/**
 * Returns the status following `status` when the player marks `outcome`.
 * Terminal outcomes are themselves statuses; throws on illegal transitions
 * (e.g. marking an outcome while the roll is merely `rolled`, or advancing a
 * finished roll).
 */
export function nextRollStatus(status: RollStatus, outcome: RollOutcome): RollStatus {
  const allowed = OUTCOMES_BY_STATUS[status];
  if (!allowed.includes(outcome)) {
    throw new RangeError(`illegal roll transition: ${status} -> ${outcome}`);
  }
  return outcome;
}

/**
 * Whether one more reroll may be spent on the current game roll:
 * enabled by config and under the per-game limit.
 */
export function canReroll(rerollsUsed: number, config: SeasonConfig): boolean {
  return config.rerolls.allowed && rerollsUsed < config.rerolls.limitPerGame;
}

export type RerollRejectionReason =
  | "rerolls-disabled"
  | "limit-reached"
  | "invalid-status";

export interface RerollDecision {
  allowed: boolean;
  /** `rolled` when allowed; the input status otherwise. */
  nextStatus: RollStatus;
  /** Incremented when allowed; unchanged otherwise. */
  rerollsUsed: number;
  reason?: RerollRejectionReason;
}

/**
 * Pure decision point for the reroll action: takes the current status and
 * counter, returns whether the reroll is permitted and the resulting
 * status/counter (a fresh `rolled` roll with the counter bumped).
 */
export function requestReroll(
  status: RollStatus,
  rerollsUsed: number,
  config: SeasonConfig,
): RerollDecision {
  if (!config.rerolls.allowed) {
    return { allowed: false, nextStatus: status, rerollsUsed, reason: "rerolls-disabled" };
  }
  if (rerollsUsed >= config.rerolls.limitPerGame) {
    return { allowed: false, nextStatus: status, rerollsUsed, reason: "limit-reached" };
  }
  try {
    nextRollStatus(status, "rerolled");
  } catch {
    return { allowed: false, nextStatus: status, rerollsUsed, reason: "invalid-status" };
  }
  return { allowed: true, nextStatus: INITIAL_ROLL_STATUS, rerollsUsed: rerollsUsed + 1 };
}
