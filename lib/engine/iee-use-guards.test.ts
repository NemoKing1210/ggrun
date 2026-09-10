import { describe, expect, it } from "vitest";
import { checkItemUse, hexScroll, type UseGuardInput } from "./iee";
import type { IeePlayerSnapshot, ItemUsage } from "./types";

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

const usage = (over: Partial<ItemUsage> = {}): ItemUsage => ({
  mode: "active",
  window: "anytime",
  target: "other",
  charges: 1,
  consumedOnUse: true,
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

const code = (r: ReturnType<typeof checkItemUse>) => (r.ok ? null : r.code);

describe("checkItemUse — usability", () => {
  it("allows a valid use on another player", () => {
    expect(checkItemUse(input())).toEqual({ ok: true, target: "other" });
  });

  it("refuses a passive item — there is nothing to activate", () => {
    expect(code(checkItemUse(input({ usage: usage({ mode: "passive" }) })))).toBe(
      "ieeItemNotUsable",
    );
  });
});

describe("checkItemUse — timing window", () => {
  it("before_roll refuses while a roll is open", () => {
    expect(
      code(checkItemUse(input({ usage: usage({ window: "before_roll" }), hasOpenRoll: true }))),
    ).toBe("ieeItemWrongWindow");
  });

  it("before_roll allows when no roll is open", () => {
    expect(
      checkItemUse(input({ usage: usage({ window: "before_roll" }), hasOpenRoll: false })).ok,
    ).toBe(true);
  });

  it("on_open_roll refuses without an open roll", () => {
    expect(
      code(checkItemUse(input({ usage: usage({ window: "on_open_roll" }), hasOpenRoll: false }))),
    ).toBe("ieeItemWrongWindow");
  });

  it("anytime ignores the roll state", () => {
    expect(checkItemUse(input({ hasOpenRoll: true })).ok).toBe(true);
  });
});

describe("checkItemUse — targeting", () => {
  it("a self item ignores whatever the form sent", () => {
    const r = checkItemUse(
      input({ usage: usage({ target: "self" }), target: player({ seasonPlayerId: "sp-other" }) }),
    );
    expect(r).toEqual({ ok: true, target: "self" });
  });

  it("a no-target item needs nothing", () => {
    expect(checkItemUse(input({ usage: usage({ target: "none" }), target: null }))).toEqual({
      ok: true,
      target: "none",
    });
  });

  it("an 'other' item requires a target", () => {
    expect(code(checkItemUse(input({ target: null })))).toBe("ieeTargetRequired");
  });

  it("an 'any' item is happy without one", () => {
    expect(checkItemUse(input({ usage: usage({ target: "any" }), target: null })).ok).toBe(true);
  });

  it("refuses self-targeting for an 'other' item — server-side, not hidden in the UI", () => {
    expect(
      code(checkItemUse(input({ target: player({ seasonPlayerId: "sp-actor" }) }))),
    ).toBe("ieeTargetSelfNotAllowed");
  });

  it("lets an 'any' item be used on yourself", () => {
    expect(
      checkItemUse(
        input({ usage: usage({ target: "any" }), target: player({ seasonPlayerId: "sp-actor" }) }),
      ),
    ).toEqual({ ok: true, target: "self" });
  });

  it("refuses a target from another season", () => {
    expect(code(checkItemUse(input({ targetInSameSeason: false })))).toBe("ieeTargetNotActive");
  });
});

describe("checkItemUse — PvP guardrails (§8.3)", () => {
  it("refuses when the season has targeting switched off", () => {
    expect(code(checkItemUse(input({ allowTargetingOthers: false })))).toBe(
      "ieeTargetingDisabled",
    );
  });

  it("...but a self item still works with targeting off", () => {
    expect(
      checkItemUse(input({ usage: usage({ target: "self" }), allowTargetingOthers: false })).ok,
    ).toBe(true);
  });

  it.each(["finished", "eliminated", "withdrawn"] as const)(
    "refuses a %s participant",
    (status) => {
      expect(
        code(checkItemUse(input({ target: player({ seasonPlayerId: "sp-target", status }) }))),
      ).toBe("ieeTargetNotActive");
    },
  );

  it("refuses a newcomer inside the protection window", () => {
    expect(
      code(
        checkItemUse(
          input({
            pvpProtectionMoves: 3,
            target: player({ seasonPlayerId: "sp-target", moveCount: 2 }),
          }),
        ),
      ),
    ).toBe("ieeTargetProtected");
  });

  it("allows them the moment the window closes", () => {
    expect(
      checkItemUse(
        input({
          pvpProtectionMoves: 3,
          target: player({ seasonPlayerId: "sp-target", moveCount: 3 }),
        }),
      ).ok,
    ).toBe(true);
  });

  it("the protection window never blocks a self item", () => {
    expect(
      checkItemUse(input({ usage: usage({ target: "self" }), pvpProtectionMoves: 99 })).ok,
    ).toBe(true);
  });
});

describe("the tracer item obeys the guards", () => {
  it("hex_scroll is active, single-charge and aimed at someone else", () => {
    expect(hexScroll.usage).toMatchObject({
      mode: "active",
      target: "other",
      charges: 1,
      consumedOnUse: true,
    });
  });

  it("a season with PvP off makes it unusable", () => {
    expect(
      code(checkItemUse(input({ usage: hexScroll.usage, allowTargetingOthers: false }))),
    ).toBe("ieeTargetingDisabled");
  });
});
