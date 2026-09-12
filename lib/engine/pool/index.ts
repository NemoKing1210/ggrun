/**
 * Why a roll found no game.
 *
 * Pure, and in the engine rather than beside the query, for the same reason
 * every other rule is: the four cases are domain vocabulary, and the map below
 * is what turns each into something a person can act on.
 *
 * They arrived as a single `null` before, which the caller could only report as
 * "no games available in the catalog — add games or check your filters". That
 * sentence is right for exactly one of the four. A player who has been handed
 * every game in the pool is told to check filters that are not the problem, and
 * a host whose provider key has expired is told to add games by hand.
 */

export type PoolEmptyReason =
  /** `games_catalog` holds nothing that is not blacklisted. Add games. */
  | "catalog_empty"
  /** There are games, but this participant has already been handed all of them. */
  | "all_played"
  /** Unplayed games exist; the season's pool filters exclude every one of them. */
  | "filters_exclude_all"
  /** An API-sourced season whose provider returned nothing. */
  | "provider_empty";

/**
 * Error code per reason. Each is a separate dictionary entry on purpose — the
 * host does something different about each one, so telling them apart is the
 * entire point.
 */
export const POOL_EMPTY_ERROR: Record<PoolEmptyReason, string> = {
  catalog_empty: "catalogEmpty",
  all_played: "catalogAllPlayed",
  filters_exclude_all: "catalogFiltersExcludeAll",
  provider_empty: "catalogProviderEmpty",
};
