import type { EffectDef } from "../../types/iee";

/**
 * The rest of the effect catalog.
 *
 * Every negative here has an answer (§8.3): `cleansing_salve` clears any of
 * them, `shield` eats a penalty landing outright, and `tailwind` / `lucky`
 * cancel their opposite numbers. A pool of punishments with no counter-play is
 * a frustration generator, not a game.
 *
 * Only hooks the loop actually dispatches are used. `beforeGameRoll`,
 * `onRollCreated` and `passive` are declared in the contract but not wired, so
 * nothing here relies on them.
 */

// --- negative ---------------------------------------------------------------

/** Harsher than `slowed`, and gone in one roll. Answer: cleansing_salve. */
export const heavyBoots: EffectDef = {
  key: "heavy_boots",
  polarity: "negative",
  rarity: "rare",
  heroIcon: "ArrowDownTrayIcon",
  i18n: {
    name: "iee.effects.heavyBoots.name",
    description: "iee.effects.heavyBoots.description",
  },
  stacking: "refresh",
  duration: { kind: "rolls", value: 1 },
  priority: 100,
  defaults: { steps: 2 },
  hooks: {
    afterMovement: (ctx) => ({
      stepsDelta: -Math.abs(Number(ctx.params.steps ?? 2)),
      reason: "effect:heavy_boots",
    }),
  },
};

/** Smaller dice for a while. Answer: `lucky`, which cancels it exactly. */
export const unlucky: EffectDef = {
  key: "unlucky",
  polarity: "negative",
  rarity: "rare",
  heroIcon: "ExclamationTriangleIcon",
  i18n: {
    name: "iee.effects.unlucky.name",
    description: "iee.effects.unlucky.description",
  },
  stacking: "unique",
  duration: { kind: "rolls", value: 3 },
  priority: 50,
  defaults: { sides: 2 },
  hooks: {
    beforeMovement: (ctx) => ({
      diceSidesDelta: -Math.abs(Number(ctx.params.sides ?? 2)),
      reason: "effect:unlucky",
    }),
  },
};

/** Bleeds a point on every landing. Answer: cleansing_salve. */
export const taxed: EffectDef = {
  key: "taxed",
  polarity: "negative",
  rarity: "common",
  heroIcon: "BanknotesIcon",
  i18n: {
    name: "iee.effects.taxed.name",
    description: "iee.effects.taxed.description",
  },
  stacking: "unique",
  duration: { kind: "rolls", value: 3 },
  priority: 200,
  defaults: { amount: 1 },
  hooks: {
    afterCellEffect: (ctx) => ({
      balanceDelta: -Math.abs(Number(ctx.params.amount ?? 1)),
      reason: "effect:taxed",
    }),
  },
};

// --- positive ---------------------------------------------------------------

/** The counterweight to `slowed` and `heavy_boots`. */
export const tailwind: EffectDef = {
  key: "tailwind",
  polarity: "positive",
  rarity: "common",
  heroIcon: "ArrowTrendingUpIcon",
  i18n: {
    name: "iee.effects.tailwind.name",
    description: "iee.effects.tailwind.description",
  },
  stacking: "refresh",
  duration: { kind: "rolls", value: 1 },
  priority: 100,
  defaults: { steps: 2 },
  hooks: {
    afterMovement: (ctx) => ({
      stepsDelta: Math.abs(Number(ctx.params.steps ?? 2)),
      reason: "effect:tailwind",
    }),
  },
};

/** Bigger dice — the exact mirror of `unlucky`, so the two cancel. */
export const lucky: EffectDef = {
  key: "lucky",
  polarity: "positive",
  rarity: "rare",
  heroIcon: "StarIcon",
  i18n: {
    name: "iee.effects.lucky.name",
    description: "iee.effects.lucky.description",
  },
  stacking: "unique",
  duration: { kind: "rolls", value: 2 },
  priority: 50,
  defaults: { sides: 2 },
  hooks: {
    beforeMovement: (ctx) => ({
      diceSidesDelta: Math.abs(Number(ctx.params.sides ?? 2)),
      reason: "effect:lucky",
    }),
  },
};

/** Pays out on a pass — the only entry that uses `onOutcome`. */
export const momentum: EffectDef = {
  key: "momentum",
  polarity: "positive",
  rarity: "epic",
  heroIcon: "BoltIcon",
  i18n: {
    name: "iee.effects.momentum.name",
    description: "iee.effects.momentum.description",
  },
  stacking: "unique",
  duration: { kind: "rolls", value: 3 },
  priority: 150,
  defaults: { amount: 1 },
  hooks: {
    onOutcome: (ctx) => {
      if (ctx.turn.outcome !== "passed") return {};
      return {
        balanceDelta: Math.abs(Number(ctx.params.amount ?? 1)),
        reason: "effect:momentum",
      };
    },
  },
};
