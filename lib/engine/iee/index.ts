/**
 * Items / Effects / Events — public surface of the IEE subsystem.
 *
 * Pure domain code: selection, hook reduction and the hardcoded catalog.
 * Persistence, transactions and feed writes live in lib/modules/game.
 */
import type { IeeParams, Rarity } from "../types/iee";
import type { PoolCandidate } from "./selection/gates";
import { EFFECTS } from "./effects/registry";
import { ITEMS } from "./items/registry";

export * from "./selection/gates";
export * from "./selection/pick";
export * from "./resolve/hooks";
export * from "./grant";
export * from "./reel";
export * from "./use-guards";
export * from "./filter";
export * from "./events";
export * from "./scenarios";
export * from "./effects/registry";
export * from "./items/registry";
export { slowed } from "./effects/slowed";
export { shield } from "./effects/shield";
export * from "./effects/catalog-effects";
export * from "./items/catalog-items";
export { hexScroll } from "./items/hex-scroll";

/** Rarity as an ordinal, 0..3 — the catch-up rule weights by it. */
export const RARITY_TIER: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

/**
 * The whole catalog flattened for the picker. Items and effects share one
 * pool per polarity: the season's weights decide the mix (§12 B2).
 */
export function catalogCandidates(
  items = ITEMS,
  effects = EFFECTS,
): PoolCandidate[] {
  return [
    ...Object.values(items).map(
      (def): PoolCandidate => ({
        kind: "item",
        key: def.key,
        polarity: def.polarity,
        tier: RARITY_TIER[def.rarity],
      }),
    ),
    ...Object.values(effects).map(
      (def): PoolCandidate => ({
        kind: "effect",
        key: def.key,
        polarity: def.polarity,
        tier: RARITY_TIER[def.rarity],
        stacking: def.stacking,
      }),
    ),
  ];
}

/** Catalog default params per key, before the season's overrides are applied. */
export function catalogDefaults(
  items = ITEMS,
  effects = EFFECTS,
): Record<string, IeeParams> {
  const out: Record<string, IeeParams> = {};
  for (const def of Object.values(items)) out[def.key] = def.defaults;
  for (const def of Object.values(effects)) out[def.key] = def.defaults;
  return out;
}
