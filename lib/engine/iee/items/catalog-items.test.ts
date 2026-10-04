import { describe, expect, it } from "vitest";
import type { IeePlayerSnapshot, ItemDef, ItemUseContext, ItemUseResult } from "../../types/iee";
import {
  cleansingSalve,
  jinx,
  leadWeights,
  lodestone,
  spareDie,
} from "./catalog-items";

const actor: IeePlayerSnapshot = {
  seasonPlayerId: "sp-1",
  position: 10,
  balancePoints: 0,
  rollSeq: 5,
  moveCount: 5,
  rank: 1,
  status: "active",
};

const other: IeePlayerSnapshot = { ...actor, seasonPlayerId: "sp-2", rank: 2 };

const call = (def: ItemDef, over: Partial<ItemUseContext> = {}): ItemUseResult =>
  def.apply({ itemKey: def.key, params: def.defaults, actor, target: null, ...over });

describe("cleansing_salve", () => {
  it("clears every negative status the actor carries, for the feed", () => {
    expect(call(cleansingSalve)).toEqual({
      cleanse: [{ from: "sp-1", effectKeys: "all", polarity: "negative" }],
      feedPayload: { itemKey: "cleansing_salve" },
    });
  });
});

describe("lodestone", () => {
  it("grants its default effect to the actor when used before a roll", () => {
    expect(lodestone.usage).toMatchObject({ mode: "active", window: "before_roll", target: "self" });
    expect(call(lodestone)).toEqual({
      grantEffects: [{ effectKey: "tailwind", to: "sp-1" }],
      feedPayload: { itemKey: "lodestone" },
    });
  });

  it("honours an effectKey carried on the row", () => {
    expect(call(lodestone, { params: { effectKey: "lucky" } }).grantEffects).toEqual([
      { effectKey: "lucky", to: "sp-1" },
    ]);
  });
});

describe("spare_die", () => {
  it("grants its default effect to the actor when used before a roll", () => {
    expect(spareDie.usage).toMatchObject({ mode: "active", window: "before_roll", target: "self" });
    expect(call(spareDie)).toEqual({
      grantEffects: [{ effectKey: "lucky", to: "sp-1" }],
      feedPayload: { itemKey: "spare_die" },
    });
  });

  it("honours an effectKey carried on the row", () => {
    expect(call(spareDie, { params: { effectKey: "shield" } }).grantEffects).toEqual([
      { effectKey: "shield", to: "sp-1" },
    ]);
  });
});

describe("lead_weights", () => {
  it("grants heavy boots to another active player and names them for the feed", () => {
    expect(call(leadWeights, { target: other })).toEqual({
      grantEffects: [{ effectKey: "heavy_boots", to: "sp-2" }],
      feedPayload: { itemKey: "lead_weights", effectKey: "heavy_boots", targetSeasonPlayerId: "sp-2" },
    });
  });

  it("refuses a missing target", () => {
    expect(call(leadWeights)).toEqual({ rejected: "ieeTargetRequired" });
  });

  it("refuses self-targeting server-side, not only in the UI", () => {
    expect(call(leadWeights, { target: actor })).toEqual({ rejected: "ieeTargetSelfNotAllowed" });
  });

  it.each(["finished", "eliminated", "withdrawn"] as const)("refuses a %s target", (status) => {
    expect(call(leadWeights, { target: { ...other, status } })).toEqual({
      rejected: "ieeTargetNotActive",
    });
  });

  it("honours an effectKey carried on the row", () => {
    expect(call(leadWeights, { target: other, params: { effectKey: "slowed" } }).grantEffects).toEqual(
      [{ effectKey: "slowed", to: "sp-2" }],
    );
  });
});

describe("jinx", () => {
  it("shrinks another active player's dice and names them for the feed", () => {
    expect(call(jinx, { target: other })).toEqual({
      grantEffects: [{ effectKey: "unlucky", to: "sp-2" }],
      feedPayload: { itemKey: "jinx", effectKey: "unlucky", targetSeasonPlayerId: "sp-2" },
    });
  });

  it("refuses a missing target and a self target", () => {
    expect(call(jinx)).toEqual({ rejected: "ieeTargetRequired" });
    expect(call(jinx, { target: actor })).toEqual({ rejected: "ieeTargetSelfNotAllowed" });
  });

  it("refuses a target who has left the season", () => {
    expect(call(jinx, { target: { ...other, status: "withdrawn" } })).toEqual({
      rejected: "ieeTargetNotActive",
    });
  });

  it("honours an effectKey carried on the row", () => {
    expect(call(jinx, { target: other, params: { effectKey: "taxed" } }).grantEffects).toEqual([
      { effectKey: "taxed", to: "sp-2" },
    ]);
  });
});
