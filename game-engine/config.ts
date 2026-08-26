import { z } from "zod";
import type { SeasonConfig } from "./types";

/**
 * Default season configuration. Base numbers match PLAN.md 6.2, extended
 * defaults cover the new flexible board counts and game-pool filters.
 */
export const DEFAULT_SEASON_CONFIG: SeasonConfig = {
  dice: {
    sides: 6,
    passDiceCount: 1,
    dropDiceCount: 2,
    dropStreakMultiplier: true,
  },
  points: {
    startingBalance: 0,
    bonusAddsToRollOnPass: true,
    resetBalanceAfterUse: true,
  },
  board: {
    size: 40,
    loop: false,
    bonusCount: 4,
    penaltyCount: 4,
    teleportCount: 2,
    eventCount: 3,
    distribution: "random",
    regenerateOnSave: false,
  },
  rerolls: { allowed: true, limitPerGame: 1 },
  gamePool: {
    source: "catalog",
    provider: "internal",
    templateId: null,
    filters: {
      genres: [],
      platforms: [],
      tags: [],
      metacriticMin: null,
      metacriticMax: null,
      ratingMin: null,
      ratingMax: null,
      yearMin: null,
      yearMax: null,
      esrb: [],
      players: "any",
      onlyWithCover: false,
      ordering: "-metacritic",
      searchQuery: null,
    },
    catalog: {
      allowManualAdd: true,
      fallbackToCatalog: true,
    },
    maxCandidates: 20,
    cacheTtlHours: 24,
    autoFetchOnRoll: false,
  },
};

const int = (min: number) => z.number().int().min(min);
const nullableInt = (min: number) =>
  z.union([z.number().int().min(min), z.null()]).default(null);

export const DiceConfigSchema = z.object({
  sides: int(2).default(DEFAULT_SEASON_CONFIG.dice.sides),
  passDiceCount: int(0).default(DEFAULT_SEASON_CONFIG.dice.passDiceCount),
  dropDiceCount: int(0).default(DEFAULT_SEASON_CONFIG.dice.dropDiceCount),
  dropStreakMultiplier: z.boolean().default(DEFAULT_SEASON_CONFIG.dice.dropStreakMultiplier),
});

export const PointsConfigSchema = z.object({
  startingBalance: int(0).default(DEFAULT_SEASON_CONFIG.points.startingBalance),
  bonusAddsToRollOnPass: z.boolean().default(
    DEFAULT_SEASON_CONFIG.points.bonusAddsToRollOnPass,
  ),
  resetBalanceAfterUse: z.boolean().default(DEFAULT_SEASON_CONFIG.points.resetBalanceAfterUse),
});

export const BoardConfigSchema = z.object({
  size: int(1).max(200).default(DEFAULT_SEASON_CONFIG.board.size),
  loop: z.boolean().default(DEFAULT_SEASON_CONFIG.board.loop),
  bonusCount: int(0).max(100).default(DEFAULT_SEASON_CONFIG.board.bonusCount),
  penaltyCount: int(0).max(100).default(DEFAULT_SEASON_CONFIG.board.penaltyCount),
  teleportCount: int(0).max(100).default(DEFAULT_SEASON_CONFIG.board.teleportCount),
  eventCount: int(0).max(100).default(DEFAULT_SEASON_CONFIG.board.eventCount),
  distribution: z
    .enum(["random", "even", "clustered", "manual"])
    .default(DEFAULT_SEASON_CONFIG.board.distribution),
  regenerateOnSave: z.boolean().default(DEFAULT_SEASON_CONFIG.board.regenerateOnSave),
});

export const RerollsConfigSchema = z.object({
  allowed: z.boolean().default(DEFAULT_SEASON_CONFIG.rerolls.allowed),
  limitPerGame: int(0).default(DEFAULT_SEASON_CONFIG.rerolls.limitPerGame),
});

export const GamePoolFiltersSchema = z.object({
  genres: z.array(z.string().min(1)).default([]),
  platforms: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  metacriticMin: nullableInt(0).refine((v) => v === null || v <= 100, "max 100"),
  metacriticMax: nullableInt(0).refine((v) => v === null || v <= 100, "max 100"),
  ratingMin: z.union([z.number().min(0).max(5), z.null()]).default(null),
  ratingMax: z.union([z.number().min(0).max(5), z.null()]).default(null),
  yearMin: nullableInt(1970),
  yearMax: nullableInt(1970),
  esrb: z.array(z.string().min(1)).default([]),
  players: z.enum(["any", "single", "multi", "coop"]).default("any"),
  onlyWithCover: z.boolean().default(false),
  ordering: z.string().default("-metacritic"),
  searchQuery: z.union([z.string(), z.null()]).default(null),
});

export const GamePoolCatalogSchema = z.object({
  allowManualAdd: z.boolean().default(true),
  fallbackToCatalog: z.boolean().default(true),
});

export const GamePoolConfigSchema = z.object({
  source: z.enum(["catalog", "api", "hybrid"]).default(DEFAULT_SEASON_CONFIG.gamePool.source),
  provider: z.enum(["internal", "rawg", "igdb", "steam"]).default(DEFAULT_SEASON_CONFIG.gamePool.provider),
  templateId: z.union([z.string(), z.null()]).default(null),
  filters: GamePoolFiltersSchema.default(DEFAULT_SEASON_CONFIG.gamePool.filters),
  catalog: GamePoolCatalogSchema.default(DEFAULT_SEASON_CONFIG.gamePool.catalog),
  maxCandidates: int(1).max(100).default(DEFAULT_SEASON_CONFIG.gamePool.maxCandidates),
  cacheTtlHours: int(0).max(720).default(DEFAULT_SEASON_CONFIG.gamePool.cacheTtlHours),
  autoFetchOnRoll: z.boolean().default(DEFAULT_SEASON_CONFIG.gamePool.autoFetchOnRoll),
});

/**
 * Parses partial/admin-supplied JSON into a full SeasonConfig: every nested
 * object is optional (falling back to its defaults) and every field carries
 * a default too. Throws a ZodError on invalid values — intended for
 * admin-panel validation of season configs.
 */
export const SeasonConfigSchema = z
  .object({
    dice: DiceConfigSchema.default(DEFAULT_SEASON_CONFIG.dice),
    points: PointsConfigSchema.default(DEFAULT_SEASON_CONFIG.points),
    board: BoardConfigSchema.default(DEFAULT_SEASON_CONFIG.board),
    rerolls: RerollsConfigSchema.default(DEFAULT_SEASON_CONFIG.rerolls),
    gamePool: GamePoolConfigSchema.default(DEFAULT_SEASON_CONFIG.gamePool),
  })
  // Compile-time assertion: the parsed shape must satisfy the domain contract.
  .transform((parsed): SeasonConfig => parsed);
