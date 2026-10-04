import { describe, expect, it } from "vitest";

import type { IeePlayerSnapshot } from "../types/iee";
import { planBotItemUse, type BotItemHold, type BotOtherPlayer, type BotItemInput } from "./items";

const ACTOR: IeePlayerSnapshot = {
  seasonPlayerId: "sp-self",
  position: 10,
  balancePoints: 4,
  rollSeq: 3,
  moveCount: 3,
  rank: 2,
  status: "active",
};

function hold(itemKey: string, params: Record<string, number | string | boolean> = {}): BotItemHold {
  return { inventoryId: `inv-${itemKey}`, itemKey, params };
}

function other(overrides: Partial<BotOtherPlayer> = {}): BotOtherPlayer {
  return {
    seasonPlayerId: "sp-rival",
    username: "rival",
    position: 20,
    moveCount: 5,
    status: "active",
    effects: [],
    ...overrides,
  };
}

function input(overrides: Partial<BotItemInput> = {}): BotItemInput {
  return {
    actor: ACTOR,
    hasOpenRoll: false,
    held: [],
    activeEffects: [],
    others: [],
    allowTargetingOthers: true,
    pvpProtectionMoves: 3,
    ...overrides,
  };
}

/** Deterministic rng: no shuffle movement, no score jitter. */
const zero = () => 0;

const opts = { strategy: "leader" as const, autoCleanse: true, rng: zero };

describe("planBotItemUse", () => {
  it("plans nothing with an empty inventory", () => {
    expect(planBotItemUse(input(), opts)).toBeNull();
  });

  it("prefers a cleanse over an attack when a debuff is on the bot", () => {
    const plan = planBotItemUse(
      input({
        held: [hold("hex_scroll"), hold("cleansing_salve")],
        activeEffects: [{ effectKey: "slowed", polarity: "negative" }],
        others: [other()],
      }),
      opts,
    );
    expect(plan).toMatchObject({ itemKey: "cleansing_salve", intent: "cleanse" });
  });

  it("ignores a cleanse item when the only status is positive", () => {
    const plan = planBotItemUse(
      input({
        held: [hold("cleansing_salve")],
        activeEffects: [{ effectKey: "lucky", polarity: "positive" }],
      }),
      opts,
    );
    expect(plan).toBeNull();
  });

  it("buffs itself before a roll", () => {
    const plan = planBotItemUse(input({ held: [hold("lodestone")] }), opts);
    expect(plan).toMatchObject({
      itemKey: "lodestone",
      intent: "buff",
      targetSeasonPlayerId: ACTOR.seasonPlayerId,
    });
  });

  it("respects the before-roll window: no self-buff while a game is in flight", () => {
    expect(planBotItemUse(input({ held: [hold("lodestone")], hasOpenRoll: true }), opts)).toBeNull();
  });

  it("hexes the leader under the leader strategy", () => {
    const plan = planBotItemUse(
      input({
        held: [hold("hex_scroll")],
        others: [
          other({ seasonPlayerId: "sp-chaser", position: 12 }),
          other({ seasonPlayerId: "sp-leader", position: 30 }),
        ],
      }),
      opts,
    );
    expect(plan).toMatchObject({ itemKey: "hex_scroll", intent: "attack", targetSeasonPlayerId: "sp-leader" });
  });

  it("aims at the nearest rival under the nearest strategy", () => {
    const plan = planBotItemUse(
      input({
        held: [hold("lead_weights")],
        others: [
          other({ seasonPlayerId: "sp-far", position: 32 }),
          other({ seasonPlayerId: "sp-near", position: 12 }),
        ],
      }),
      { ...opts, strategy: "nearest" },
    );
    expect(plan?.targetSeasonPlayerId).toBe("sp-near");
  });

  it("never attacks when targeting others is disabled", () => {
    const plan = planBotItemUse(
      input({ held: [hold("hex_scroll")], others: [other()], allowTargetingOthers: false }),
      opts,
    );
    expect(plan).toBeNull();
  });

  it("leaves protected newcomers alone", () => {
    const plan = planBotItemUse(
      input({ held: [hold("hex_scroll")], others: [other({ moveCount: 1 })], pvpProtectionMoves: 3 }),
      opts,
    );
    expect(plan).toBeNull();
  });

  it("does not re-grant a unique status the bot already carries", () => {
    const plan = planBotItemUse(
      input({ held: [hold("spare_die")], activeEffects: [{ effectKey: "lucky", polarity: "positive" }] }),
      opts,
    );
    expect(plan).toBeNull();
  });

  it("does not re-grant a unique status the target already carries", () => {
    const plan = planBotItemUse(
      input({ held: [hold("jinx")], others: [other({ effects: ["unlucky"] })] }),
      opts,
    );
    expect(plan).toBeNull();
  });

  it("drops cleanse plans when auto-cleanse is off", () => {
    const plan = planBotItemUse(
      input({ held: [hold("cleansing_salve")], activeEffects: [{ effectKey: "taxed", polarity: "negative" }] }),
      { ...opts, autoCleanse: false },
    );
    expect(plan).toBeNull();
  });
});
