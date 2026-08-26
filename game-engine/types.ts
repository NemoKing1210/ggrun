/**
 * Domain contracts for the game engine (PLAN.md section 10).
 * Pure TypeScript: no next/react/drizzle/pg imports allowed here.
 */

/** Board generation strategy for special cells. */
export type BoardDistribution = "random" | "even" | "clustered" | "manual";

/** Game pool source — where rolled games come from. */
export type GamePoolSource = "catalog" | "api" | "hybrid";

/** External API provider for hybrid/api modes. */
export type GameProviderId = "internal" | "rawg" | "igdb" | "steam";

/** Filters applied when picking a game (catalog or API). */
export interface GamePoolFilters {
  genres: string[];
  platforms: string[];
  tags: string[];
  metacriticMin: number | null;
  metacriticMax: number | null;
  ratingMin: number | null;
  ratingMax: number | null;
  yearMin: number | null;
  yearMax: number | null;
  esrb: string[];
  players: "any" | "single" | "multi" | "coop";
  onlyWithCover: boolean;
  ordering: string;
  searchQuery: string | null;
}

export interface GamePoolCatalogOptions {
  allowManualAdd: boolean;
  fallbackToCatalog: boolean;
}

export interface GamePoolConfig {
  source: GamePoolSource;
  provider: GameProviderId;
  templateId: string | null;
  filters: GamePoolFilters;
  catalog: GamePoolCatalogOptions;
  /** How many candidates to consider per roll (1 = deterministic pick of filtered set). */
  maxCandidates: number;
  /** Cache TTL for API results in hours. 0 = no cache */
  cacheTtlHours: number;
  /** If true, fetch fresh API game on each roll even when catalog has matches. */
  autoFetchOnRoll: boolean;
}

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
    distribution: BoardDistribution;
    regenerateOnSave: boolean;
  };
  rerolls: { allowed: boolean; limitPerGame: number };
  gamePool: GamePoolConfig;
}
export type RollOutcome = "passed" | "dropped" | "rerolled";

export interface MovementInput {
  currentPosition: number;
  balancePoints: number;
  outcome: Exclude<RollOutcome, "rerolled">;
  streakPass: number;
  streakDrop: number;
  config: SeasonConfig;
  /** Injected externally for testability and server-side generation. */
  rng: () => number;
}

export interface MovementResult {
  diceResults: number[];
  newPosition: number;
  newBalancePoints: number;
  newStreakPass: number;
  newStreakDrop: number;
}

/** Cell types for MVP (PLAN.md 6.2), extensible via cell `config` JSONB. */
export type CellType =
  | "start"
  | "finish"
  | "normal"
  | "penalty"
  | "bonus"
  | "event"
  | "teleport"
  | "custom";

/** Shape of a board cell as consumed by the engine (`cells` row projection). */
export interface CellLike {
  /** Cell index on the board. */
  position: number;
  cellType: CellType;
  /** Free-form per-cell parameters (JSONB `cells.config`). */
  config: Record<string, unknown>;
  label?: string | null;
}

export interface CellEffectContext {
  cell: CellLike;
  /** Position right after landing (before any effect shifts the player). */
  landingPosition: number;
  balancePoints: number;
}

export interface CellEffectResult {
  /** Absolute position override (teleport). Takes precedence over `steps`. */
  position?: number;
  /** Relative positional shift applied to the landing position. */
  steps?: number;
  /** Balance delta; may be negative (penalty). */
  balanceDelta?: number;
  /** Human-readable cause for `event_log`/ledger entries. */
  reason?: string;
  /** Identifier of a triggered event for `event_log` (reserved, Phase 8). */
  eventKey?: string;
}

/** Mutable per-player state within a season (`season_players`). */
export interface SeasonPlayerState {
  currentPosition: number;
  balancePoints: number;
  streakPass: number;
  streakDrop: number;
  /** Rerolls spent on the current game roll. */
  rerollsUsed: number;
}
