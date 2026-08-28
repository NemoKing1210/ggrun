
export type RollStatus =
  | "rolled"
  | "in_progress"
  | "passed"
  | "dropped"
  | "rerolled";

export const INITIAL_ROLL_STATUS: RollStatus = "rolled";
