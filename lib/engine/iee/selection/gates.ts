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
}

/** Why a candidate did not make it onto the wheel. `null` means eligible. */
export type GateReason =
  | "disabled"
  | "polarity"
  | "zero_weight"
  | "max_per_season"
  | "max_per_player"
  | "cooldown"
  | "min_position"
  | "unlock_after_move"
  | "duplicate_unique"
  | "inventory_full";

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

  if (
    entry.maxPerSeason !== null &&
    (counters.perSeason[candidate.key] ?? 0) >= entry.maxPerSeason
  ) {
    return "max_per_season";
  }
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

  if (candidate.kind === "effect") {
    if (
      candidate.stacking === "unique" &&
      input.activeEffectKeys.includes(candidate.key)
    ) {
      return "duplicate_unique";
    }
  } else {
    // C3: a full inventory blocks the drop rather than discarding silently.
    if (config.inventorySize > 0 && input.heldItemCount >= config.inventorySize) {
      return "inventory_full";
    }
  }

  return null;
}
