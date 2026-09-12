import type { EffectDef } from "../../types/iee";

/**
 * Tracer effect — negative, drops from `penalty` cells.
 *
 * Deliberately trivial: it removes one step from the next two moves. Chosen
 * because it is always observable and has no zero-dice edge case (subtracting
 * a die would be invisible with the default `passDiceCount: 1`).
 */
export const slowed: EffectDef = {
  key: "slowed",
  polarity: "negative",
  rarity: "common",
  heroIcon: "ArrowTrendingDownIcon",
  i18n: {
    name: "iee.effects.slowed.name",
    description: "iee.effects.slowed.description",
  },
  stacking: "refresh",
  duration: { kind: "rolls", value: 2 },
  priority: 100,
  defaults: { steps: 1 },
  hooks: {
    afterMovement: (ctx) => ({
      stepsDelta: -Math.abs(Number(ctx.params.steps ?? 1)),
      reason: "effect:slowed",
    }),
  },
};
