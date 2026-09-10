import { z } from "zod";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { int } from "./helpers";

/** Snapshot-able scalar bag: item/effect params and admin overrides. */
const ParamsSchema = z
  .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
  .default({});

const PolaritySchema = z.enum(["positive", "negative"]);

const nullableNonNegative = z
  .union([z.number().int().min(0), z.null()])
  .default(null);

/**
 * Per-entry tuning for one item or effect within a season.
 *
 * Every field defaults, so `entries: { shield: {} }` is a valid way of saying
 * "this entry is in the pool with catalog defaults" — the admin UI writes only
 * what the host actually changed.
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
  targetOverride: z
    .union([z.enum(["self", "other", "any", "none"]), z.null()])
    .default(null),
});

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
  entries: z.record(z.string(), IeeEntryConfigSchema).default({}),
  events: z.array(z.string()).default([]),
});
