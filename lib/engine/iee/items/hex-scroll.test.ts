import { describe, expect, it } from "vitest";
import type { IeePlayerSnapshot, ItemUseContext, ItemUseResult } from "../../types/iee";
import { hexScroll } from "./hex-scroll";

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

const call = (over: Partial<ItemUseContext> = {}): ItemUseResult =>
  hexScroll.apply({
    itemKey: "hex_scroll",
    params: { effectKey: "slowed" },
    actor,
    target: other,
    ...over,
  });

describe("hex_scroll", () => {
  it("is a positive tool dropped from bonus cells, aimed at another player", () => {
    expect(hexScroll.polarity).toBe("positive");
    expect(hexScroll.rarity).toBe("common");
    expect(hexScroll.usage).toMatchObject({
      mode: "active",
      window: "anytime",
      target: "other",
      charges: 1,
      consumedOnUse: true,
    });
  });

  it("grants its effect to the target and reports both sides for the feed", () => {
    expect(call()).toEqual({
      grantEffects: [{ effectKey: "slowed", to: "sp-2" }],
      feedPayload: {
        itemKey: "hex_scroll",
        effectKey: "slowed",
        targetSeasonPlayerId: "sp-2",
      },
    });
  });

  it("honours an effectKey carried on the row", () => {
    expect(call({ params: { effectKey: "taxed" } }).grantEffects).toEqual([
      { effectKey: "taxed", to: "sp-2" },
    ]);
  });

  it("refuses a missing target", () => {
    expect(call({ target: null })).toEqual({ rejected: "ieeTargetRequired" });
  });

  it("refuses self-targeting server-side", () => {
    expect(call({ target: actor })).toEqual({ rejected: "ieeTargetSelfNotAllowed" });
  });

  it.each(["finished", "eliminated", "withdrawn"] as const)("refuses a %s target", (status) => {
    expect(call({ target: { ...other, status } })).toEqual({ rejected: "ieeTargetNotActive" });
  });

  it("returns intentions only — the engine never writes here", () => {
    const out = call();
    for (const key of Object.keys(out)) {
      expect(["grantEffects", "grantItems", "balance", "cleanse", "feedPayload", "rejected"]).toContain(key);
    }
  });
});
