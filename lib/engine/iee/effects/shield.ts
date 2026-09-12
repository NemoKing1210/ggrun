import type { EffectDef } from "../../types/iee";

/**
 * Tracer effect #2 — positive, drops from `bonus` cells.
 *
 * Exists for two reasons beyond being a nice item:
 *  - it is the counter-play `ITEMS_EFFECTS_EVENTS.md` §8.3 demands ("every
 *    negative effect ships with a counter"); without one, a run of penalty
 *    cells is pure frustration;
 *  - it is the only tracer entry that exercises the `beforeCellEffect` veto,
 *    so the reducer's boolean-OR path is covered by something real.
 *
 * §15 sketched this as a *passive item*. Hooks belong to effects — items have
 * no hook table — and inventing a parallel dispatch for items would be
 * duplicate machinery for the same behaviour, so it ships as an effect that a
 * bonus cell can grant.
 */
export const shield: EffectDef = {
  key: "shield",
  polarity: "positive",
  rarity: "rare",
  heroIcon: "ShieldCheckIcon",
  i18n: {
    name: "iee.effects.shield.name",
    description: "iee.effects.shield.description",
  },
  stacking: "stack",
  // Spent by absorbing one hit rather than by the clock.
  duration: { kind: "charges", value: 1 },
  // Low number = runs first and wins overrides: a shield must get its say
  // before anything that reacts to the landing.
  priority: 10,
  defaults: {},
  hooks: {
    beforeCellEffect: (ctx) => {
      // Only a cell that would hurt is worth a charge.
      if (ctx.turn.cellType !== "penalty") return {};
      return {
        skipCellEffect: true,
        consumeCharge: true,
        reason: "effect:shield",
      };
    },
  },
};
