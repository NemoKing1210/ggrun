import type {
  IeeConfig,
  IeeEntryConfig,
  IeePlayerSnapshot,
  Polarity,
  StackingPolicy,
} from "../../types/iee";

/**
 * A catalog entry flattened to what selection actually needs, so the picker
 * does not care whether it is looking at an item or an effect.
 */
export interface PoolCandidate {
  kind: "item" | "effect";
  key: string;
  polarity: Polarity;
  /** Rarity tier index: common 0 … legendary 3. Drives catch-up weighting. */
  tier: number;
  /** Effects only; items ignore it. */
  stacking?: StackingPolicy;
  /** The entry's tags — the season's `disabledTags` and `tagLimits` read them. */
  tags?: readonly string[];
  /** It moves the nearest rival behind the holder on arrival: nothing to do with nobody behind. */
  needsBehind?: boolean;
  /** An item a holder holds at most one of — cursed items always (spec §6.10). */
  unique?: boolean;
  /** One in the season (wave D, spec §6.19): once it has dropped, the wheel never offers it again. */
  seasonUnique?: boolean;
  /** What the entry is for its recipient: a penalty item (cursed) takes no inventory slot. */
  character?: "bonus" | "penalty";
}

/** Counters the caller reads from the database before picking. */
export interface PoolCounters {
  /** Total drops of a key across the whole season. */
  perSeason: Readonly<Record<string, number>>;
  /** Drops of a key to this player. */
  perPlayer: Readonly<Record<string, number>>;
  /** Season roll sequence at which a key last dropped to anyone. */
  lastDropRollSeq: Readonly<Record<string, number>>;
}

export interface GateInput {
  candidate: PoolCandidate;
  entry: IeeEntryConfig;
  config: IeeConfig;
  player: IeePlayerSnapshot;
  counters: PoolCounters;
  /** Effect keys currently active on the player. */
  activeEffectKeys: readonly string[];
  /** Items the player currently holds — checked against `inventorySize`. */
  heldItemCount: number;
  /** Season-wide roll sequence, for cooldowns. */
  seasonRollSeq: number;
  /** The player's active instances (items and effects) per tag — for `tagLimits`. */
  activeTagCounts?: Readonly<Record<string, number>>;
  /** Active rivals behind the cell the player landed on; unknown = someone is. */
  playersBehind?: number;
  /** Keys of the items the player holds — a unique one is not offered twice. */
  heldItemKeys?: readonly string[];
}

/** Why a candidate did not make it onto the wheel. `null` means eligible. */
export type GateReason =
  | "disabled"
  | "polarity"
  | "zero_weight"
  | "disabled_tag"
  | "max_per_season"
  | "max_per_player"
  | "cooldown"
  | "min_position"
  | "unlock_after_move"
  | "duplicate_unique"
  | "inventory_full"
  | "effect_limit"
  | "tag_limit"
  | "nobody_behind"
  | "unique_season";

/** Effective polarity: the season override wins over the catalog. */
export function effectivePolarity(
  candidate: PoolCandidate,
  entry: IeeEntryConfig,
): Polarity {
  return entry.polarityOverride ?? candidate.polarity;
}

/**
 * Decides whether one candidate may appear on a wheel of `polarity`.
 *
 * Gating happens *before* the wheel is built rather than after a pick, so the
 * slices handed to the client only contain outcomes that can really happen —
 * a wheel showing a slice that cannot be granted would be dishonest.
 */
export function gateCandidate(
  input: GateInput,
  polarity: Polarity,
): GateReason | null {
  const { candidate, entry, config, player, counters } = input;

  if (!entry.enabled) return "disabled";
  if (effectivePolarity(candidate, entry) !== polarity) return "polarity";
  if (entry.weight <= 0) return "zero_weight";
  // Removed from the season entirely (spec §4.5).
  if ((candidate.tags ?? []).some((tag) => config.disabledTags.includes(tag))) return "disabled_tag";

  if (
    entry.maxPerSeason !== null &&
    (counters.perSeason[candidate.key] ?? 0) >= entry.maxPerSeason
  ) {
    return "max_per_season";
  }
  // One in the season (spec §6.19): handed out once, it only changes hands.
  if (candidate.seasonUnique && (counters.perSeason[candidate.key] ?? 0) > 0) return "unique_season";
  if (
    entry.maxPerPlayer !== null &&
    (counters.perPlayer[candidate.key] ?? 0) >= entry.maxPerPlayer
  ) {
    return "max_per_player";
  }

  if (entry.cooldownRolls > 0) {
    const last = counters.lastDropRollSeq[candidate.key];
    if (last !== undefined && input.seasonRollSeq - last < entry.cooldownRolls) {
      return "cooldown";
    }
  }

  if (player.position < entry.minPosition) return "min_position";
  if (player.moveCount < entry.unlockAfterMove) return "unlock_after_move";
  // «Погоня», «Рокировка»: a rival behind is what they move (spec §16).
  if (candidate.needsBehind && input.playersBehind === 0) return "nobody_behind";

  if (candidate.kind === "effect") {
    if (
      candidate.stacking === "unique" &&
      input.activeEffectKeys.includes(candidate.key)
    ) {
      return "duplicate_unique";
    }
  } else {
    if (candidate.unique && (input.heldItemKeys ?? []).includes(candidate.key)) return "duplicate_unique";
    // C3: a full inventory blocks the drop rather than discarding silently.
    // The cap counts bonus items only: a cursed item takes no slot (spec §6.10).
    if (candidate.character !== "penalty" && config.inventorySize > 0 && input.heldItemCount >= config.inventorySize) {
      return "inventory_full";
    }
  }

  // Season-wide limits (spec §4.5) count instances, so they bite only when the
  // drop would add one: a `refresh` effect already held extends its clock.
  const refreshes =
    candidate.kind === "effect" &&
    candidate.stacking === "refresh" &&
    input.activeEffectKeys.includes(candidate.key);
  if (!refreshes) {
    if (
      candidate.kind === "effect" &&
      config.maxActiveEffectsPerPlayer !== null &&
      input.activeEffectKeys.length >= config.maxActiveEffectsPerPlayer
    ) {
      return "effect_limit";
    }
    for (const tag of candidate.tags ?? []) {
      const limit = config.tagLimits[tag];
      if (limit !== undefined && (input.activeTagCounts?.[tag] ?? 0) >= limit) return "tag_limit";
    }
  }

  return null;
}
