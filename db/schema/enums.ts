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
export const ieeEventStatusEnum = pgEnum("iee_event_status", [
  "assigned",
  "submitted",
  "approved",
  "rejected",
  "expired",
]);
export const fileVisibilityEnum = pgEnum("file_visibility", ["public", "private"]);

// --- IEE constructor runtime (docs/IEE_CONSTRUCTOR_SPEC.md §4.1) ------------

/** What a live instance is. Board objects and roll conditions arrive in waves C–D. */
export const ieeInstanceKindEnum = pgEnum("iee_instance_kind", [
  "item",
  "effect",
  "board_object",
  "roll_condition",
]);
/** What an instance belongs to: a participant, a board cell or a game roll. */
export const ieeHolderKindEnum = pgEnum("iee_holder_kind", ["player", "cell", "roll"]);
export const ieeInstanceStatusEnum = pgEnum("iee_instance_status", ["active", "ended"]);
export const ieeEndReasonEnum = pgEnum("iee_end_reason", [
  "used",
  "expired",
  "triggered",
  "cleansed",
  "removed",
  "stolen",
  "transferred",
  "discarded",
  "burned",
  "replaced",
  "revoked",
  "reset",
]);
export const ieeDurationUnitEnum = pgEnum("iee_duration_unit", [
  "rolls",
  "moves",
  "passed_games",
  "triggers",
  "next_game",
  "permanent",
]);
/** Who may read a journal row: everyone (the feed), the holder, or staff only. */
export const ieeVisibilityEnum = pgEnum("iee_visibility", ["public", "holder", "staff"]);
/** A pause that waits for a player: the reaction window after the dice, a victim's choice (wave B, §7.4, §7.6). */
export const ieeDecisionKindEnum = pgEnum("iee_decision_kind", ["reaction_window", "victim_choice", "game_choice"]);
/** `resolved` — the player chose; `judged` — a judge chose for them; `defaulted` — the default was applied. */
export const ieeDecisionStatusEnum = pgEnum("iee_decision_status", ["pending", "resolved", "judged", "defaulted"]);

// --- IEE library (docs/IEE_CONSTRUCTOR_SPEC.md §4.1–§4.2) ------------------

export const ieeEntryKindEnum = pgEnum("iee_entry_kind", ["item", "effect"]);
/** `bonus` or `penalty` for whoever receives the entry — it also picks the drop pool. */
export const ieeCharacterEnum = pgEnum("iee_character", ["bonus", "penalty"]);
export const ieeRarityEnum = pgEnum("iee_rarity", ["common", "rare", "epic", "legendary"]);
/** `draft` hides a pack from the season wizard. */
export const ieePackVisibilityEnum = pgEnum("iee_pack_visibility", ["draft", "library"]);
