import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "judge",
  "player",
  "viewer",
]);
export const seasonStatusEnum = pgEnum("season_status", [
  "draft",
  "active",
  "paused",
  "finished",
  "archived",
]);
export const cellTypeEnum = pgEnum("cell_type", [
  "start",
  "finish",
  "normal",
  "penalty",
  "event",
  "bonus",
  "teleport",
  "custom",
]);
export const rollStatusEnum = pgEnum("roll_status", [
  "rolled",
  "in_progress",
  "passed",
  "dropped",
  "rerolled",
]);
export const rerollRequestStatusEnum = pgEnum("reroll_request_status", [
  "pending",
  "approved",
  "rejected",
]);
export const completionRequestStatusEnum = pgEnum("completion_request_status", [
  "pending",
  "approved",
  "rejected",
]);
export const playerStatusEnum = pgEnum("player_status", [
  "active",
  "finished",
  "eliminated",
  "withdrawn",
]);
export const registrationModeEnum = pgEnum("registration_mode", [
  "open",
  "manual_approval",
  "email_link",
]);