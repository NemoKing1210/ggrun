import type { ItemDef } from "../../types/iee";

/**
 * The rest of the item catalog.
 *
 * All of them are positive: an item is a tool, and a cell that hands you one is
 * a reward (§12 B7). The negative pool carries effects — things that happen
 * *to* you — which is what makes a penalty cell a penalty.
 *
 * All are active as well. A passive item would need a hook table of its own,
 * and hooks belong to effects; an item that wants a standing benefit grants an
 * effect instead, which is what `lodestone` and `spare_die` do.
 */

/** The universal answer to every negative status (§8.3). */
export const cleansingSalve: ItemDef = {
  key: "cleansing_salve",
  polarity: "positive",
  rarity: "rare",
  heroIcon: "BeakerIcon",
  i18n: {
    name: "iee.items.cleansingSalve.name",
    description: "iee.items.cleansingSalve.description",
  },
  usage: {
    mode: "active",
    window: "anytime",
    target: "self",
    charges: 1,
    consumedOnUse: true,
  },
  defaults: {},
  apply: (ctx) => ({
    cleanse: [{ from: ctx.actor.seasonPlayerId, effectKeys: "all", polarity: "negative" }],
    feedPayload: { itemKey: "cleansing_salve" },
  }),
};

/** A push on your own next move. */
export const lodestone: ItemDef = {
  key: "lodestone",
  polarity: "positive",
  rarity: "common",
  heroIcon: "ArrowTrendingUpIcon",
  i18n: {
    name: "iee.items.lodestone.name",
    description: "iee.items.lodestone.description",
  },
  usage: {
    mode: "active",
    // Using it after seeing the dice would be free hindsight.
    window: "before_roll",
    target: "self",
    charges: 1,
    consumedOnUse: true,
  },
  defaults: { effectKey: "tailwind" },
  apply: (ctx) => ({
    grantEffects: [
      { effectKey: String(ctx.params.effectKey ?? "tailwind"), to: ctx.actor.seasonPlayerId },
    ],
    feedPayload: { itemKey: "lodestone" },
  }),
};

/** Bigger dice for a couple of rolls. */
export const spareDie: ItemDef = {
  key: "spare_die",
  polarity: "positive",
  rarity: "epic",
  heroIcon: "CubeIcon",
  i18n: {
    name: "iee.items.spareDie.name",
    description: "iee.items.spareDie.description",
  },
  usage: {
    mode: "active",
    window: "before_roll",
    target: "self",
    charges: 1,
    consumedOnUse: true,
  },
  defaults: { effectKey: "lucky" },
  apply: (ctx) => ({
    grantEffects: [
      { effectKey: String(ctx.params.effectKey ?? "lucky"), to: ctx.actor.seasonPlayerId },
    ],
    feedPayload: { itemKey: "spare_die" },
  }),
};

/** Offensive, like hex_scroll but heavier. */
export const leadWeights: ItemDef = {
  key: "lead_weights",
  polarity: "positive",
  rarity: "rare",
  heroIcon: "ArrowDownTrayIcon",
  i18n: {
    name: "iee.items.leadWeights.name",
    description: "iee.items.leadWeights.description",
  },
  usage: {
    mode: "active",
    window: "anytime",
    target: "other",
    charges: 1,
    consumedOnUse: true,
  },
  defaults: { effectKey: "heavy_boots" },
  apply: (ctx) => {
    if (!ctx.target) return { rejected: "ieeTargetRequired" };
    if (ctx.target.seasonPlayerId === ctx.actor.seasonPlayerId) {
      return { rejected: "ieeTargetSelfNotAllowed" };
    }
    if (ctx.target.status !== "active") return { rejected: "ieeTargetNotActive" };
    const effectKey = String(ctx.params.effectKey ?? "heavy_boots");
    return {
      grantEffects: [{ effectKey, to: ctx.target.seasonPlayerId }],
      feedPayload: {
        itemKey: "lead_weights",
        effectKey,
        targetSeasonPlayerId: ctx.target.seasonPlayerId,
      },
    };
  },
};

/** Offensive: shrinks someone else's dice. */
export const jinx: ItemDef = {
  key: "jinx",
  polarity: "positive",
  rarity: "epic",
  heroIcon: "ExclamationTriangleIcon",
  i18n: {
    name: "iee.items.jinx.name",
    description: "iee.items.jinx.description",
  },
  usage: {
    mode: "active",
    window: "anytime",
    target: "other",
    charges: 1,
    consumedOnUse: true,
  },
  defaults: { effectKey: "unlucky" },
  apply: (ctx) => {
    if (!ctx.target) return { rejected: "ieeTargetRequired" };
    if (ctx.target.seasonPlayerId === ctx.actor.seasonPlayerId) {
      return { rejected: "ieeTargetSelfNotAllowed" };
    }
    if (ctx.target.status !== "active") return { rejected: "ieeTargetNotActive" };
    const effectKey = String(ctx.params.effectKey ?? "unlucky");
    return {
      grantEffects: [{ effectKey, to: ctx.target.seasonPlayerId }],
      feedPayload: {
        itemKey: "jinx",
        effectKey,
        targetSeasonPlayerId: ctx.target.seasonPlayerId,
      },
    };
  },
};
