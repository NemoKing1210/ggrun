/**
 * Status -> badge variant, in one place.
 *
 * Season and player statuses are deliberately two maps: both enums contain the
 * key `finished` and it means opposite things. A finished *season* is over --
 * idle, nothing left to act on. A finished *player* completed the run -- an
 * achievement. A single shared map cannot colour both correctly, and before
 * this file existed it painted them the same.
 *
 * Colours follow DESIGN.md 1.2: amber = interactive / active, green = success,
 * red = danger, grey = idle. A finished season is none of those, so it takes
 * the neutral variant; it earns its distinction from the other two grey
 * statuses (`draft`, `archived`) with an icon rather than with a hue, because
 * inventing a sixth status colour would dilute the four that already carry
 * meaning.
 *
 * `import type` only -- this file is erased at runtime and stays a leaf.
 */
import type { Season, SeasonPlayer } from "@/db/schema";

/** The subset of `Badge`'s variants that carries status meaning. */
export type StatusVariant = "military" | "amber" | "danger" | "dim" | "neutral";

export type SeasonStatus = Season["status"];
export type PlayerStatus = SeasonPlayer["status"];

/**
 * Total `Record`s on purpose: adding a value to `season_status` or
 * `player_status` without deciding its colour is a compile error here rather
 * than a silently grey badge in production.
 */
export const SEASON_STATUS_VARIANT: Record<SeasonStatus, StatusVariant> = {
  draft: "dim",
  active: "military",
  paused: "amber",
  finished: "neutral",
  archived: "dim",
};

export const PLAYER_STATUS_VARIANT: Record<PlayerStatus, StatusVariant> = {
  active: "military",
  finished: "amber",
  eliminated: "danger",
  withdrawn: "dim",
};
