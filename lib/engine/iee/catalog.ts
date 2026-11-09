/**
 * A season's catalog row, folded into what the wheel and the views read
 * (docs/IEE_CONSTRUCTOR_SPEC.md §4.2, §7.11).
 *
 * Pure on purpose: the registry folds the rows it loaded, the season wizard
 * folds the rows it is editing, and the two get the same wheel.
 */
import {
  RARITY_WEIGHT,
  type IeeEntryConfig,
  type Polarity,
  type Rarity,
  type SeasonCatalogEntry,
  type StackingPolicy,
} from "../types/iee";
import type { PoolCandidate } from "./selection/gates";

/**
 * The tag of an entry that plays only when another hands it out — «Магнит»'s
 * pull, the throw of «Кости судьбы» (spec §6.6): the season presets attach it
 * disabled, with what hands it out, and never put it on a wheel.
 */
export const HANDOUT_TAG = "handout";

/** Rarity as an ordinal, 0..3 — the catch-up rule weights by it. */
export const RARITY_TIER: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

/** The wheel a pool feeds: a bonus cell spins the bonus pool (D9). */
export function poolPolarity(pool: SeasonCatalogEntry["pool"]): Polarity {
  return pool === "bonus" ? "positive" : "negative";
}

/**
 * What the catalog needs of an entry — a compiled entry and an `EntryView`
 * both carry it. `stacking` is the policy for effects, null for items.
 */
export interface CatalogSubject {
  entryId: string;
  revisionId: string;
  kind: "item" | "effect";
  key: string;
  character: "bonus" | "penalty";
  rarity: Rarity;
  tags: readonly string[];
  stacking: StackingPolicy | null;
  /** An effect that moves the nearest rival behind its holder on arrival (wave A). */
  needsBehind?: boolean;
  /** An item a holder holds at most one of — cursed items always (wave A). */
  unique?: boolean;
  /** One in the season (wave D, spec §6.19). */
  seasonUnique?: boolean;
}

/** A row for an entry the season has not tuned yet: its own pool, rarity and weight. */
export function defaultCatalogEntry(
  subject: Pick<CatalogSubject, "entryId" | "revisionId" | "character" | "rarity">,
  over: Partial<SeasonCatalogEntry> = {},
): SeasonCatalogEntry {
  return {
    entryId: subject.entryId,
    revisionId: subject.revisionId,
    enabled: true,
    pool: subject.character,
    rarity: null,
    weight: RARITY_WEIGHT[subject.rarity],
    maxPerSeason: null,
    maxPerPlayer: null,
    cooldownRolls: 0,
    minPosition: 0,
    unlockAfterMove: 0,
    paramOverrides: {},
    durationOverride: null,
    targetOverride: null,
    ...over,
  };
}

/** The rarity the season plays an entry at. */
export function catalogRarity(subject: Pick<CatalogSubject, "rarity">, row: SeasonCatalogEntry): Rarity {
  return row.rarity ?? subject.rarity;
}

/** The wheel's candidate: the season's pool and rarity folded in. */
export function catalogCandidate(subject: CatalogSubject, row: SeasonCatalogEntry): PoolCandidate {
  return {
    kind: subject.kind,
    key: subject.key,
    polarity: poolPolarity(row.pool),
    tier: RARITY_TIER[catalogRarity(subject, row)],
    tags: subject.tags,
    character: subject.character,
    ...(subject.kind === "effect" && subject.stacking ? { stacking: subject.stacking } : {}),
    ...(subject.needsBehind ? { needsBehind: true } : {}),
    ...(subject.kind === "item" && subject.unique ? { unique: true } : {}),
    ...(subject.kind === "item" && subject.seasonUnique ? { seasonUnique: true } : {}),
  };
}

/** The gates and tuning the picker reads. The pool is already in the candidate. */
export function catalogEntryConfig(row: SeasonCatalogEntry): IeeEntryConfig {
  return {
    enabled: row.enabled,
    weight: row.weight,
    polarityOverride: null,
    maxPerSeason: row.maxPerSeason,
    maxPerPlayer: row.maxPerPlayer,
    cooldownRolls: row.cooldownRolls,
    minPosition: row.minPosition,
    unlockAfterMove: row.unlockAfterMove,
    paramOverrides: row.paramOverrides,
    durationOverride: row.durationOverride,
    targetOverride: row.targetOverride,
  };
}

/** How an attached entry drops in a season — what the rules page prints. */
export interface SeasonPoolSlot {
  /** False for an entry attached only because another hands it out. */
  enabled: boolean;
  weight: number;
  polarity: Polarity;
}

export function poolSlot(row: SeasonCatalogEntry): SeasonPoolSlot {
  return { enabled: row.enabled, weight: row.weight, polarity: poolPolarity(row.pool) };
}

/** The picker's inputs for a list of attached entries, keyed by key. */
export function catalogPickInputs(
  attached: readonly { subject: CatalogSubject; row: SeasonCatalogEntry }[],
): { candidates: PoolCandidate[]; entries: Record<string, IeeEntryConfig> } {
  const candidates: PoolCandidate[] = [];
  const entries: Record<string, IeeEntryConfig> = {};
  for (const { subject, row } of attached) {
    candidates.push(catalogCandidate(subject, row));
    entries[subject.key] = catalogEntryConfig(row);
  }
  return { candidates, entries };
}
