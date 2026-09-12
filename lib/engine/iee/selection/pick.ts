import type {
  IeeCatchUpConfig,
  IeeConfig,
  IeeEntryConfig,
  IeeParams,
  IeePlayerSnapshot,
  Polarity,
  WheelOutcome,
  WheelSlice,
} from "../../types/iee";
import { gateCandidate, type GateReason, type PoolCandidate, type PoolCounters } from "./gates";

export interface PickInput {
  /** Which pool the landing cell draws from. */
  polarity: Polarity;
  config: IeeConfig;
  /** Everything the catalog offers; gates decide what survives. */
  catalog: readonly PoolCandidate[];
  /** Catalog default params per key, merged with the season's overrides. */
  catalogDefaults: Readonly<Record<string, IeeParams>>;
  player: IeePlayerSnapshot;
  counters: PoolCounters;
  activeEffectKeys: readonly string[];
  heldItemCount: number;
  seasonRollSeq: number;
  /** Number of active participants — used only for catch-up weighting. */
  playerCount: number;
  rng: () => number;
}

/** A candidate that survived gating, with its final weight. */
export interface WeightedCandidate {
  candidate: PoolCandidate;
  entry: IeeEntryConfig;
  weight: number;
}

export interface PickDebug {
  /** Why each rejected candidate was rejected — surfaced in the admin preview. */
  rejected: Record<string, GateReason>;
}

/**
 * Weight multiplier from the catch-up rule (§9.5).
 *
 * Scaling every weight equally would change nothing, so the boost is applied
 * proportionally to rarity: a trailing player draws *stronger* positives, and
 * the leader draws *stronger* negatives. Returns 1 when disabled, when the
 * player is at the neutral end of the ladder, or for common entries.
 */
export function catchUpMultiplier(
  tier: number,
  rank: number,
  playerCount: number,
  polarity: Polarity,
  catchUp: IeeCatchUpConfig,
): number {
  if (!catchUp.enabled || playerCount < 2) return 1;
  // 0 = leader, 1 = last place.
  const lead = (rank - 1) / (playerCount - 1);
  const bias = polarity === "positive" ? lead : 1 - lead;
  const tierBoost = tier / 3;
  return 1 + (catchUp.maxMultiplier - 1) * bias * tierBoost;
}

/** Applies gates and computes final weights. Pure, no rng. */
export function buildPool(input: PickInput): {
  weighted: WeightedCandidate[];
  debug: PickDebug;
} {
  const weighted: WeightedCandidate[] = [];
  const rejected: Record<string, GateReason> = {};

  for (const candidate of input.catalog) {
    const entry = input.config.entries[candidate.key];
    // Absent from `entries` = not in this season's pool at all.
    if (!entry) continue;

    const reason = gateCandidate(
      {
        candidate,
        entry,
        config: input.config,
        player: input.player,
        counters: input.counters,
        activeEffectKeys: input.activeEffectKeys,
        heldItemCount: input.heldItemCount,
        seasonRollSeq: input.seasonRollSeq,
      },
      input.polarity,
    );
    if (reason !== null) {
      rejected[candidate.key] = reason;
      continue;
    }

    const multiplier = catchUpMultiplier(
      candidate.tier,
      input.player.rank,
      input.playerCount,
      input.polarity,
      input.config.catchUp,
    );
    weighted.push({
      candidate,
      entry,
      weight: Math.max(0, entry.weight * multiplier),
    });
  }

  return { weighted, debug: { rejected } };
}

/** Builds the slice list, including the "nothing" slice, with shares filled in. */
export function buildSlices(
  weighted: readonly WeightedCandidate[],
  nothingWeight: number,
): WheelSlice[] {
  const raw: Omit<WheelSlice, "share">[] = weighted.map((w) => ({
    kind: w.candidate.kind,
    key: w.candidate.key,
    weight: w.weight,
  }));
  if (nothingWeight > 0) {
    raw.push({ kind: "nothing", key: null, weight: nothingWeight });
  }
  const total = raw.reduce((acc, s) => acc + s.weight, 0);
  return raw.map((s) => ({ ...s, share: total > 0 ? s.weight / total : 0 }));
}

/**
 * The drop table for a season, as percentages — the admin preview (§9.4) and
 * the simulator both read this, so what a host sees is what the engine does.
 */
export function dropTable(input: PickInput): WheelSlice[] {
  const { weighted } = buildPool(input);
  return buildSlices(weighted, input.config.nothingWeight);
}

/** Resolved params for a key: catalog defaults, then the season's overrides. */
export function resolveParams(
  key: string,
  catalogDefaults: Readonly<Record<string, IeeParams>>,
  entry: IeeEntryConfig | undefined,
): IeeParams {
  return { ...(catalogDefaults[key] ?? {}), ...(entry?.paramOverrides ?? {}) };
}

/**
 * Picks one wheel outcome. Randomness comes exclusively from `rng`, so a
 * seeded generator makes the whole draw reproducible in tests.
 *
 * An empty pool never throws: it returns `kind: "fallback"`, and the caller
 * applies the landing cell's legacy numeric behaviour (§7.4).
 */
export function pickWheelOutcome(input: PickInput): WheelOutcome {
  if (!input.config.enabled) {
    return {
      kind: "fallback",
      key: null,
      params: {},
      polarity: input.polarity,
      slices: [],
      fallbackReason: "iee_disabled",
    };
  }

  const { weighted } = buildPool(input);
  const slices = buildSlices(weighted, input.config.nothingWeight);
  const total = slices.reduce((acc, s) => acc + s.weight, 0);

  if (total <= 0) {
    return {
      kind: "fallback",
      key: null,
      params: {},
      polarity: input.polarity,
      slices,
      fallbackReason: weighted.length === 0 ? "empty_pool" : "zero_total_weight",
    };
  }

  let roll = input.rng() * total;
  for (const slice of slices) {
    roll -= slice.weight;
    if (roll < 0) {
      if (slice.kind === "nothing") {
        return {
          kind: "nothing",
          key: null,
          params: {},
          polarity: input.polarity,
          slices,
        };
      }
      return {
        kind: slice.kind,
        key: slice.key,
        params: resolveParams(
          slice.key!,
          input.catalogDefaults,
          input.config.entries[slice.key!],
        ),
        polarity: input.polarity,
        slices,
      };
    }
  }

  // Only reachable through floating-point drift when rng() returns ~1.
  const last = slices[slices.length - 1]!;
  return {
    kind: last.kind,
    key: last.key,
    params:
      last.key === null
        ? {}
        : resolveParams(last.key, input.catalogDefaults, input.config.entries[last.key]),
    polarity: input.polarity,
    slices,
  };
}
