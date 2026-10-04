import { describe, expect, it } from "vitest";
import type { HookContext, IeePlayerSnapshot } from "../../types/iee";
import { shield } from "./shield";
import { slowed } from "./slowed";

const self: IeePlayerSnapshot = {
  seasonPlayerId: "sp-1",
  position: 10,
  balancePoints: 5,
  rollSeq: 4,
  moveCount: 4,
  rank: 1,
  status: "active",
};

const ctx = (over: Partial<HookContext> = {}): HookContext => ({
  hook: "beforeCellEffect",
  effectKey: "shield",
  params: {},
  self,
  turn: { rollSeq: 4, cellType: "penalty" },
  ...over,
});

const hook = shield.hooks.beforeCellEffect!;

describe("shield", () => {
  it("is a rare positive that stacks and is spent by charge, not the clock", () => {
    expect(shield.polarity).toBe("positive");
    expect(shield.rarity).toBe("rare");
    expect(shield.stacking).toBe("stack");
    expect(shield.duration).toEqual({ kind: "charges", value: 1 });
  });

  it("vetoes a penalty landing, claims a charge and names the reason", () => {
    expect(hook(ctx())).toEqual({
      skipCellEffect: true,
      consumeCharge: true,
      reason: "effect:shield",
    });
  });

  it.each(["bonus", "normal", "event", "start", "finish", "teleport"])(
    "does nothing on a %s cell",
    (cellType) => {
      expect(hook(ctx({ turn: { rollSeq: 4, cellType } }))).toEqual({});
    },
  );

  it("does nothing when the context carries no cell type at all", () => {
    expect(hook(ctx({ turn: { rollSeq: 4 } }))).toEqual({});
  });

  it("ignores its own params — the veto is unconditional", () => {
    expect(hook(ctx({ params: { amount: 99 } }))).toEqual({
      skipCellEffect: true,
      consumeCharge: true,
      reason: "effect:shield",
    });
  });

  it("runs before a reactive movement effect, by priority", () => {
    expect(shield.priority).toBeLessThan(slowed.priority);
  });
});
