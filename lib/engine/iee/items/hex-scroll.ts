import type { ItemDef } from "../../types/iee";

/**
 * Tracer item — positive, drops from `bonus` cells.
 *
 * Positive because polarity means *which pool it drops from*, not whether it
 * is kind (§12 B7): receiving a usable weapon is a reward, so it belongs to
 * the bonus pool even though its effect is hostile.
 *
 * `apply` is pure and returns an intent — the engine may not write to the
 * database, so the service executes this inside the transaction.
 */
export const hexScroll: ItemDef = {
  key: "hex_scroll",
  polarity: "positive",
  rarity: "common",
  heroIcon: "SparklesIcon",
  i18n: {
    name: "iee.items.hexScroll.name",
    description: "iee.items.hexScroll.description",
  },
  usage: {
    mode: "active",
    window: "anytime",
    target: "other",
    charges: 1,
    consumedOnUse: true,
  },
  defaults: { effectKey: "slowed" },
  apply: (ctx) => {
    if (!ctx.target) return { rejected: "ieeTargetRequired" };
    if (ctx.target.seasonPlayerId === ctx.actor.seasonPlayerId) {
      return { rejected: "ieeTargetSelfNotAllowed" };
    }
    if (ctx.target.status !== "active") return { rejected: "ieeTargetNotActive" };

    const effectKey = String(ctx.params.effectKey ?? "slowed");
    return {
      grantEffects: [{ effectKey, to: ctx.target.seasonPlayerId }],
      feedPayload: {
        itemKey: "hex_scroll",
        effectKey,
        targetSeasonPlayerId: ctx.target.seasonPlayerId,
      },
    };
  },
};
