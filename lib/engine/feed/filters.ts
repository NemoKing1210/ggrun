/**
 * Public feed filters — the tab list and the matcher, from one table.
 *
 * They used to be two independent literals inside the page, which is why
 * `AGENTS.md` §10 carried a standing warning that new event types "render
 * under All until a filter is added". A warning in a document is not a
 * mechanism: the only way it stops being needed is for an unfiled event type
 * to fail the build, which is what the exhaustiveness check in
 * `lib/infrastructure/events` does against this table.
 *
 * Pure by design — no imports, so the engine boundary holds and the page,
 * the check and the tests all read the same source.
 */

/** Which event types each tab collects. "all" is the absence of a filter. */
export const FEED_FILTER_TYPES = {
  rolled: ["game_rolled", "game_rerolled", "reroll_requested", "reroll_rejected"],
  passed: ["game_passed"],
  dropped: ["game_dropped"],
  // Reaching the finish is the last thing a move can do, so it files here
  // rather than under the roster or the season's own milestones.
  moved: ["moved", "player_finished"],
  iee: [
    "item_granted",
    "item_used",
    "item_expired",
    "item_revoked",
    "effect_applied",
    "effect_expired",
    "effect_cleansed",
    "effect_revoked",
  ],
  challenges: ["event_assigned", "event_submitted", "event_approved", "event_rejected"],
  joined: ["player_joined", "player_left"],
  system: [
    "season_started",
    "season_reset",
    "admin_adjustment",
    "completion_requested",
    "completion_approved",
    "completion_rejected",
  ],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/** Tab order, left to right. "all" first, meta last. */
export const FEED_FILTERS = [
  "all",
  "rolled",
  "passed",
  "dropped",
  "moved",
  "iee",
  "challenges",
  "joined",
  "system",
] as const;

export type FeedFilterKey = (typeof FEED_FILTERS)[number];

/** Every event type any tab claims — the set the exhaustiveness check uses. */
export type FiltrableEventType =
  (typeof FEED_FILTER_TYPES)[keyof typeof FEED_FILTER_TYPES][number];

export function isFeedFilterKey(value: string | undefined): value is FeedFilterKey {
  return (FEED_FILTERS as readonly string[]).includes(value ?? "");
}

/** "all" matches everything; every other tab matches exactly its own list. */
export function matchesFeedFilter(eventType: string, filter: FeedFilterKey): boolean {
  if (filter === "all") return true;
  return (FEED_FILTER_TYPES[filter] as readonly string[]).includes(eventType);
}
