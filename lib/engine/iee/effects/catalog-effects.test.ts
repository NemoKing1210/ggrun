import { describe, expect, it } from "vitest";
import type { HookContext, HookName, HookTurnContext, IeeParams, IeePlayerSnapshot } from "../../types/iee";
import {
  heavyBoots,
  lucky,
  momentum,
  tailwind,
  taxed,
  unlucky,
} from "./catalog-effects";

const self: IeePlayerSnapshot = {
  seasonPlayerId: "sp-1",
  position: 10,
  balancePoints: 5,
  rollSeq: 5,
  moveCount: 5,
  rank: 2,
  status: "active",
};

const ctx = (
  effectKey: string,
  params: IeeParams,
  hook: HookName,
  turn: Partial<HookTurnContext> = {},
): HookContext => ({ hook, effectKey, params, self, turn: { rollSeq: 5, ...turn } });

describe("catalog effects — negative hooks", () => {
  it("heavy boots subtract two steps by default, and coerce a signed/string param to a magnitude", () => {
    const hook = heavyBoots.hooks.afterMovement!;
    expect(hook(ctx("heavy_boots", {}, "afterMovement"))).toEqual({
      stepsDelta: -2,
      reason: "effect:heavy_boots",
    });
    expect(hook(ctx("heavy_boots", { steps: 3 }, "afterMovement")).stepsDelta).toBe(-3);
    expect(hook(ctx("heavy_boots", { steps: -3 }, "afterMovement")).stepsDelta).toBe(-3);
    expect(hook(ctx("heavy_boots", { steps: "4" }, "afterMovement")).stepsDelta).toBe(-4);
  });

  it("unlucky removes two die sides by default, keeping the delta a subtraction", () => {
    const hook = unlucky.hooks.beforeMovement!;
    expect(hook(ctx("unlucky", {}, "beforeMovement"))).toEqual({
      diceSidesDelta: -2,
      reason: "effect:unlucky",
    });
    expect(hook(ctx("unlucky", { sides: -5 }, "beforeMovement")).diceSidesDelta).toBe(-5);
  });

  it("taxed bleeds one point per landing by default", () => {
    const hook = taxed.hooks.afterCellEffect!;
    expect(hook(ctx("taxed", {}, "afterCellEffect"))).toEqual({
      balanceDelta: -1,
      reason: "effect:taxed",
    });
    expect(hook(ctx("taxed", { amount: 4 }, "afterCellEffect")).balanceDelta).toBe(-4);
  });
});

describe("catalog effects — positive hooks", () => {
  it("tailwind adds two steps by default and never turns a positive ask into a negative", () => {
    const hook = tailwind.hooks.afterMovement!;
    expect(hook(ctx("tailwind", {}, "afterMovement"))).toEqual({
      stepsDelta: 2,
      reason: "effect:tailwind",
    });
    expect(hook(ctx("tailwind", { steps: -6 }, "afterMovement")).stepsDelta).toBe(6);
  });

  it("lucky adds two die sides by default and mirrors unlucky exactly", () => {
    const hook = lucky.hooks.beforeMovement!;
    expect(hook(ctx("lucky", {}, "beforeMovement"))).toEqual({
      diceSidesDelta: 2,
      reason: "effect:lucky",
    });
    expect(hook(ctx("lucky", { sides: 5 }, "beforeMovement")).diceSidesDelta).toBe(5);
  });

  it("momentum pays a point only when the roll is passed", () => {
    const hook = momentum.hooks.onOutcome!;
    expect(hook(ctx("momentum", {}, "onOutcome", { outcome: "passed" }))).toEqual({
      balanceDelta: 1,
      reason: "effect:momentum",
    });
    expect(hook(ctx("momentum", {}, "onOutcome", { outcome: "dropped" }))).toEqual({});
    expect(hook(ctx("momentum", {}, "onOutcome"))).toEqual({});
    expect(hook(ctx("momentum", { amount: 3 }, "onOutcome", { outcome: "passed" })).balanceDelta).toBe(3);
  });
});

describe("catalog effects — structural facts", () => {
  it("keeps the negatives negative and the positives positive", () => {
    expect([heavyBoots.polarity, unlucky.polarity, taxed.polarity]).toEqual([
      "negative",
      "negative",
      "negative",
    ]);
    expect([tailwind.polarity, lucky.polarity, momentum.polarity]).toEqual([
      "positive",
      "positive",
      "positive",
    ]);
  });

  it("momentum is the only entry wired to onOutcome", () => {
    for (const def of [heavyBoots, unlucky, taxed, tailwind, lucky]) {
      expect(def.hooks.onOutcome).toBeUndefined();
    }
    expect(momentum.hooks.onOutcome).toBeTypeOf("function");
  });

  it("only the two refresh entries may stack; the rest are unique", () => {
    expect(heavyBoots.stacking).toBe("refresh");
    expect(tailwind.stacking).toBe("refresh");
    expect(unlucky.stacking).toBe("unique");
    expect(taxed.stacking).toBe("unique");
    expect(lucky.stacking).toBe("unique");
    expect(momentum.stacking).toBe("unique");
  });

  it("each roll-based duration is a positive number of rolls", () => {
    for (const def of [heavyBoots, unlucky, taxed, tailwind, lucky, momentum]) {
      expect(def.duration.kind).toBe("rolls");
      if (def.duration.kind === "rolls") expect(def.duration.value).toBeGreaterThan(0);
    }
  });
});
