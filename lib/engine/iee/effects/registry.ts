import type { EffectDef, EffectKey } from "../../types/iee";
import {
  heavyBoots,
  lucky,
  momentum,
  tailwind,
  taxed,
  unlucky,
} from "./catalog-effects";
import { shield } from "./shield";
import { slowed } from "./slowed";

/**
 * The effect catalog. Developer-authored, hardcoded on purpose: an effect is
 * inseparable from the function that implements it, and a key here is
 * persisted forever — deprecate, never rename.
 */
export const EFFECTS: Record<EffectKey, EffectDef> = {
  [slowed.key]: slowed,
  [shield.key]: shield,
  [heavyBoots.key]: heavyBoots,
  [unlucky.key]: unlucky,
  [taxed.key]: taxed,
  [tailwind.key]: tailwind,
  [lucky.key]: lucky,
  [momentum.key]: momentum,
};

export function getEffect(key: EffectKey): EffectDef | null {
  return EFFECTS[key] ?? null;
}

export function listEffects(): EffectDef[] {
  return Object.values(EFFECTS);
}
