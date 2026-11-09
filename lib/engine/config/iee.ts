import { z } from "zod";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { int } from "./helpers";

/** Snapshot-able scalar bag: item/effect params and admin overrides. */
const ParamsSchema = z
  .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
  .default({});

const PolaritySchema = z.enum(["positive", "negative"]);

/** Tag spelling of the entry documents (spec §6.6). */
const TagSchema = z.string().regex(/^[a-z0-9_]{1,32}$/);

const nullableNonNegative = z
  .union([z.number().int().min(0), z.null()])
  .default(null);

const TargetOverrideSchema = z
  .union([z.enum(["self", "other", "any", "none"]), z.null()])
  .default(null);

/**
 * Per-entry tuning as the wheel reads it. A season's entries and their tuning
 * live in its catalog (`season_catalog`, spec §4.2); a catalog row folds into
 * this shape, and every field defaults.
 */
export const IeeEntryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  /** Relative drop weight inside its polarity pool; 0 = never drops. */
  weight: int(0).max(10_000).default(100),
  polarityOverride: z.union([PolaritySchema, z.null()]).default(null),
  maxPerSeason: nullableNonNegative,
  maxPerPlayer: nullableNonNegative,
  cooldownRolls: int(0).max(1_000).default(0),
  minPosition: int(0).max(200).default(0),
  unlockAfterMove: int(0).max(1_000).default(0),
  paramOverrides: ParamsSchema,
  durationOverride: nullableNonNegative,
  targetOverride: TargetOverrideSchema,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * One row of a season's catalog as the wizard submits it (spec §4.2). The
 * server checks it against the library — the entry exists, the revision is
 * the entry's, the slug is free in the season — before it is stored.
 */
export const SeasonCatalogEntrySchema = z.strictObject({
  entryId: z.string().regex(UUID_RE),
  revisionId: z.string().regex(UUID_RE),
  enabled: z.boolean().default(true),
  pool: z.enum(["bonus", "penalty"]),
  rarity: z.union([z.enum(["common", "rare", "epic", "legendary"]), z.null()]).default(null),
  weight: int(0).max(10_000),
  maxPerSeason: nullableNonNegative,
  maxPerPlayer: nullableNonNegative,
  cooldownRolls: int(0).max(1_000).default(0),
  minPosition: int(0).max(200).default(0),
  unlockAfterMove: int(0).max(1_000).default(0),
  paramOverrides: ParamsSchema,
  durationOverride: z.union([int(0).max(1_000), z.null()]).default(null),
  targetOverride: TargetOverrideSchema,
});

export const SeasonCatalogSchema = z.array(SeasonCatalogEntrySchema).max(500);

export const IeeCatchUpConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_SEASON_CONFIG.iee.catchUp.enabled),
  maxMultiplier: z
    .number()
    .min(1)
    .max(5)
    .default(DEFAULT_SEASON_CONFIG.iee.catchUp.maxMultiplier),
});

export const IeeConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_SEASON_CONFIG.iee.enabled),
  inventorySize: int(0).max(100).default(DEFAULT_SEASON_CONFIG.iee.inventorySize),
  allowTargetingOthers: z
    .boolean()
    .default(DEFAULT_SEASON_CONFIG.iee.allowTargetingOthers),
  pvpProtectionMoves: int(0)
    .max(100)
    .default(DEFAULT_SEASON_CONFIG.iee.pvpProtectionMoves),
  revealDropsInFeed: z
    .boolean()
    .default(DEFAULT_SEASON_CONFIG.iee.revealDropsInFeed),
  nothingWeight: int(0).max(10_000).default(DEFAULT_SEASON_CONFIG.iee.nothingWeight),
  catchUp: IeeCatchUpConfigSchema.default(DEFAULT_SEASON_CONFIG.iee.catchUp),
  // The stage-1 `entries` map is gone: the season catalog holds a season's
  // entries. An old config that still carries it parses — unknown keys are
  // dropped — and loses it on the next save.
  events: z.array(z.string()).default([]),
  // --- season-wide limits (spec §4.5) ---
  maxActiveEffectsPerPlayer: z.union([int(0).max(100), z.null()]).default(null),
  tagLimits: z.record(TagSchema, int(0).max(100)).default({}),
  disabledTags: z.array(TagSchema).max(64).default([]),
  powerCeiling: z.union([z.number().min(0).max(1_000), z.null()]).default(null),
  boardObjectsPerPlayer: int(0).max(20).default(DEFAULT_SEASON_CONFIG.iee.boardObjectsPerPlayer),
});
