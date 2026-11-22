import { describe, expect, it } from "vitest";
import type { IeePlayerSnapshot } from "../types/iee";
import { checkItemUse, filterAllows, type Standing, type UseGuardInput, type UseGuardResult, type UseGuardUsage } from "./use-guards";

const player = (over: Partial<IeePlayerSnapshot> = {}): IeePlayerSnapshot => ({
  seasonPlayerId: "sp-actor",
  position: 10,
  balancePoints: 0,
  rollSeq: 5,
  moveCount: 5,
  rank: 2,
  status: "active",
  ...over,
});

const usage = (over: Partial<UseGuardUsage> = {}): UseGuardUsage => ({
  mode: "active",
  window: "anytime",
  target: "other",
  ...over,
});

const input = (over: Partial<UseGuardInput> = {}): UseGuardInput => ({
  usage: usage(),
  hasOpenRoll: false,
  actor: player(),
  target: player({ seasonPlayerId: "sp-target" }),
  targetInSameSeason: true,
  allowTargetingOthers: true,
  pvpProtectionMoves: 0,
  ...over,
});

const code = (r: UseGuardResult): string | null => (r.ok ? null : r.code);

describe("checkItemUse — usability and window", () => {
  it("allows a valid use on another active player", () => {
    expect(checkItemUse(input())).toEqual({ ok: true, target: "other" });
  });

  it("refuses a passive item, since there is nothing to activate", () => {
    expect(code(checkItemUse(input({ usage: usage({ mode: "passive" }) })))).toBe("ieeItemNotUsable");
  });

  it("checks the timing window before it looks at the target", () => {
    expect(
      code(
        checkItemUse(
          input({
            usage: usage({ window: "before_roll" }),
            hasOpenRoll: true,
            target: null,
          }),
        ),
      ),
    ).toBe("ieeItemWrongWindow");
  });

  it("refuses on_open_roll without an open roll", () => {
    expect(
      code(checkItemUse(input({ usage: usage({ window: "on_open_roll" }), hasOpenRoll: false }))),
    ).toBe("ieeItemWrongWindow");
  });
});

describe("checkItemUse — target resolution", () => {
  it("a none-target item succeeds without a target", () => {
    expect(checkItemUse(input({ usage: usage({ target: "none" }), target: null }))).toEqual({
      ok: true,
      target: "none",
    });
  });

  it("a self item ignores the form's target and every targeting rule", () => {
    const r = checkItemUse(
      input({
        usage: usage({ target: "self" }),
        target: player({ seasonPlayerId: "sp-other" }),
        targetInSameSeason: false,
        allowTargetingOthers: false,
        pvpProtectionMoves: 99,
      }),
    );
    expect(r).toEqual({ ok: true, target: "self" });
  });

  it("an 'other' item requires a target", () => {
    expect(code(checkItemUse(input({ target: null })))).toBe("ieeTargetRequired");
  });

  it("an 'any' item with no target resolves to none", () => {
    expect(checkItemUse(input({ usage: usage({ target: "any" }), target: null }))).toEqual({
      ok: true,
      target: "none",
    });
  });

  it("an 'any' item used on yourself resolves to self", () => {
    expect(
      checkItemUse(
        input({ usage: usage({ target: "any" }), target: player({ seasonPlayerId: "sp-actor" }) }),
      ),
    ).toEqual({ ok: true, target: "self" });
  });

  it("refuses self-targeting for an 'other' item server-side", () => {
    expect(
      code(checkItemUse(input({ target: player({ seasonPlayerId: "sp-actor" }) }))),
    ).toBe("ieeTargetSelfNotAllowed");
  });
});

describe("checkItemUse — PvP guardrails", () => {
  it("refuses a target from another season before anything about them is trusted", () => {
    expect(code(checkItemUse(input({ targetInSameSeason: false })))).toBe("ieeTargetNotActive");
  });

  it("refuses a cross-season target even for an 'any' item", () => {
    expect(
      code(
        checkItemUse(
          input({ usage: usage({ target: "any" }), targetInSameSeason: false }),
        ),
      ),
    ).toBe("ieeTargetNotActive");
  });

  it("refuses when the season has targeting switched off", () => {
    expect(code(checkItemUse(input({ allowTargetingOthers: false })))).toBe("ieeTargetingDisabled");
  });

  it("checks the targeting switch before the target's own status", () => {
    expect(
      code(
        checkItemUse(
          input({ allowTargetingOthers: false, target: player({ seasonPlayerId: "sp-target", status: "finished" }) }),
        ),
      ),
    ).toBe("ieeTargetingDisabled");
  });

  it.each(["finished", "eliminated", "withdrawn"] as const)("refuses a %s participant", (status) => {
    expect(
      code(checkItemUse(input({ target: player({ seasonPlayerId: "sp-target", status }) }))),
    ).toBe("ieeTargetNotActive");
  });

  it("holds a newcomer inside the protection window and releases them at the boundary", () => {
    const at = (moveCount: number) =>
      checkItemUse(
        input({ pvpProtectionMoves: 3, target: player({ seasonPlayerId: "sp-target", moveCount }) }),
      );
    expect(code(at(2))).toBe("ieeTargetProtected");
    expect(at(3)).toEqual({ ok: true, target: "other" });
  });

  it("never lets the protection window block a self item", () => {
    expect(
      checkItemUse(input({ usage: usage({ target: "self" }), pvpProtectionMoves: 99 })).ok,
    ).toBe(true);
  });
});

describe("checkItemUse — cursed items and target filters (spec §6.10)", () => {
  it("refuses a cursed item like a passive one: it works by itself", () => {
    expect(code(checkItemUse(input({ usage: usage({ mode: "cursed" }) })))).toBe("ieeItemNotUsable");
  });

  const at = (id: string, position: number, status: Standing["status"] = "active"): Standing => ({ seasonPlayerId: id, position, status });
  // The user on 10; rivals on 4, 8, 8, 14, 20, and one who finished on 30.
  const field: Standing[] = [at("me", 10), at("a", 4), at("b", 8), at("c", 8), at("d", 14), at("e", 20), at("gone", 30, "finished")];
  const me = field[0]!;
  const allows = (filter: Parameters<typeof filterAllows>[0], id: string) =>
    filterAllows(filter, me, field.find((s) => s.seasonPlayerId === id)!, field);

  it("judges ahead and behind strictly", () => {
    expect([allows("ahead", "d"), allows("ahead", "b"), allows("behind", "a"), allows("behind", "e")]).toEqual([true, false, true, false]);
  });

  it("the nearest that way, ties all counting; the leader among those still running", () => {
    expect([allows("nearest_ahead", "d"), allows("nearest_ahead", "e")]).toEqual([true, false]);
    expect([allows("nearest_behind", "b"), allows("nearest_behind", "c"), allows("nearest_behind", "a")]).toEqual([true, true, false]);
    // Someone who finished is out of the field: the leader is on 20.
    expect([allows("leader", "e"), allows("leader", "d")]).toEqual([true, false]);
  });

  it("refuses a target the filter does not allow, and the user themselves", () => {
    const filtered = (filter: UseGuardUsage["filter"], target: IeePlayerSnapshot, standings = field) =>
      code(checkItemUse(input({ usage: usage({ target: "any", filter }), actor: player({ seasonPlayerId: "me", position: 10 }), target, standings })));
    expect(filtered("ahead", player({ seasonPlayerId: "d", position: 14 }))).toBeNull();
    expect(filtered("ahead", player({ seasonPlayerId: "b", position: 8 }))).toBe("ieeTargetNotEligible");
    expect(filtered("ahead", player({ seasonPlayerId: "me", position: 10 }))).toBe("ieeTargetNotEligible");
    // Without the field, the two players are all it knows.
    expect(
      code(checkItemUse(input({ usage: usage({ filter: "nearest_ahead" }), target: player({ seasonPlayerId: "sp-target", position: 12 }) }))),
    ).toBeNull();
  });
});
