import { describe, expect, it } from "vitest";
import type { HookContext, IeePlayerSnapshot } from "../../types/iee";
import { slowed } from "./slowed";

const self: IeePlayerSnapshot = {
  seasonPlayerId: "sp-1",
  position: 10,
  balancePoints: 0,
  rollSeq: 4,
  moveCount: 4,
  rank: 2,
  status: "active",
};

const ctx = (params: Record<string, number | string | boolean> = {}): HookContext => ({
  hook: "afterMovement",
  effectKey: "slowed",
  params,
  self,
  turn: { rollSeq: 4 },
});

const hook = slowed.hooks.afterMovement!;

describe("slowed", () => {
  it("is a common negative that refreshes rather than stacks", () => {
    expect(slowed.polarity).toBe("negative");
    expect(slowed.rarity).toBe("common");
    expect(slowed.stacking).toBe("refresh");
    expect(slowed.duration).toEqual({ kind: "rolls", value: 2 });
  });

  it("removes one step by default", () => {
    expect(hook(ctx())).toEqual({ stepsDelta: -1, reason: "effect:slowed" });
  });

  it("uses the season's step count when the row carries one", () => {
    expect(hook(ctx({ steps: 3 }))).toEqual({ stepsDelta: -3, reason: "effect:slowed" });
  });

  it("keeps the penalty a subtraction even when the row's value is signed the other way", () => {
    expect(hook(ctx({ steps: -4 }))).toEqual({ stepsDelta: -4, reason: "effect:slowed" });
  });

  it("coerces a string param the way a stored jsonb row arrives", () => {
    expect(hook(ctx({ steps: "2" }))).toEqual({ stepsDelta: -2, reason: "effect:slowed" });
  });
});
