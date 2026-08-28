import type { RollOutcome, SeasonConfig } from "../types/season";
import type { RollStatus } from "./types";
import { INITIAL_ROLL_STATUS } from "./types";

export { INITIAL_ROLL_STATUS } from "./types";

const OUTCOMES_BY_STATUS: Record<RollStatus, readonly RollOutcome[]> = {
  rolled: [],
  in_progress: ["passed", "dropped", "rerolled"],
  passed: [],
  dropped: [],
  rerolled: [],
};

export function nextRollStatus(status: RollStatus, outcome: RollOutcome): RollStatus {
  const allowed = OUTCOMES_BY_STATUS[status];
  if (!allowed.includes(outcome)) {
    throw new RangeError(`illegal roll transition: ${status} -> ${outcome}`);
  }
  return outcome;
}

export function canReroll(rerollsUsed: number, config: SeasonConfig): boolean {
  return config.rerolls.allowed && rerollsUsed < config.rerolls.limitPerGame;
}

export type RerollRejectionReason =
  | "rerolls-disabled"
  | "limit-reached"
  | "invalid-status";

export interface RerollDecision {
  allowed: boolean;
  nextStatus: RollStatus;
  rerollsUsed: number;
  reason?: RerollRejectionReason;
}

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
