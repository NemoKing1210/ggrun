import { describe, expect, it } from "vitest";
import type {
  ActiveEffectLike,
  EffectDef,
  HookContext,
  IeePlayerSnapshot,
} from "../../types/iee";
import {
  activeEffects,
  emptyModifiers,
  expiredEffects,
  isEffectActive,
  reduceHookPatches,
  runHook,
  sortPatchSources,
  type PatchSource,
} from "./hooks";

const self: IeePlayerSnapshot = {
  seasonPlayerId: "sp-1",
  position: 10,
  balancePoints: 0,
  rollSeq: 5,
  moveCount: 5,
  rank: 2,
  status: "active",
};

const src = (over: Partial<PatchSource> = {}): PatchSource => ({
  id: "e1",
  effectKey: "x",
  priority: 100,
  appliedAt: 1,
  patch: {},
  ...over,
});

const row = (over: Partial<ActiveEffectLike> = {}): ActiveEffectLike => ({
  id: "row-1",
  effectKey: "slowed",
  params: { steps: 1 },
  chargesLeft: null,
  expiresAfterRollSeq: null,
  appliedAt: 1,
  ...over,
});

describe("emptyModifiers", () => {
  it("is the neutral result every reduction starts from", () => {
    expect(emptyModifiers()).toEqual({
      stepsDelta: 0,
      balanceDelta: 0,
      diceCountDelta: 0,
      diceSidesDelta: 0,
      forcedPosition: null,
      forcedOutcome: null,
      skipCellEffect: false,
      immune: false,
      reasons: [],
      consumed: [],
      conflicts: [],
    });
  });
});

describe("sortPatchSources", () => {
  it("orders by priority, then application time, then id — never input order", () => {
    const ordered = sortPatchSources([
      src({ id: "z", priority: 10, appliedAt: 2 }),
      src({ id: "a", priority: 20, appliedAt: 1 }),
      src({ id: "b", priority: 20, appliedAt: 1 }),
      src({ id: "c", priority: 20, appliedAt: 0 }),
    ]);
    expect(ordered.map((s) => s.id)).toEqual(["z", "c", "a", "b"]);
  });

  it("returns a new array and leaves the caller's order untouched", () => {
    const input = [src({ id: "b", priority: 2 }), src({ id: "a", priority: 1 })];
    const ordered = sortPatchSources(input);
    expect(ordered).not.toBe(input);
    expect(input.map((s) => s.id)).toEqual(["b", "a"]);
    expect(ordered.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("reduceHookPatches — veto bookkeeping", () => {
  it("charges only the first of two redundant vetoes", () => {
    const out = reduceHookPatches([
      src({ id: "a", priority: 10, patch: { skipCellEffect: true, consumeCharge: true } }),
      src({ id: "b", priority: 20, patch: { skipCellEffect: true, consumeCharge: true } }),
    ]);
    expect(out.skipCellEffect).toBe(true);
    expect(out.consumed).toEqual(["a"]);
    expect(out.conflicts).toEqual([]);
  });

  it("still charges an effect that adds a different veto to one already in force", () => {
    // `skipCellEffect` was already true, but `immune` was new — the patch was
    // not fully redundant, so the charge is not free.
    const out = reduceHookPatches([
      src({ id: "a", priority: 10, patch: { skipCellEffect: true } }),
      src({ id: "b", priority: 20, patch: { immune: true, consumeCharge: true } }),
    ]);
    expect(out.skipCellEffect).toBe(true);
    expect(out.immune).toBe(true);
    expect(out.consumed).toEqual(["b"]);
  });

  it("charges an effect that asks for a charge without vetoing anything", () => {
    const out = reduceHookPatches([src({ patch: { consumeCharge: true } })]);
    expect(out.consumed).toEqual(["e1"]);
  });

  it("never charges a repeated veto on its own", () => {
    const out = reduceHookPatches([
      src({ id: "a", priority: 10, patch: { immune: true } }),
      src({ id: "b", priority: 20, patch: { immune: true } }),
    ]);
    expect(out.immune).toBe(true);
    expect(out.consumed).toEqual([]);
  });

  it("records an override conflict but keeps the first setter's value", () => {
    const out = reduceHookPatches([
      src({ id: "a", effectKey: "first", priority: 10, patch: { forcedPosition: 4 } }),
      src({ id: "b", effectKey: "second", priority: 20, patch: { forcedPosition: 9 } }),
    ]);
    expect(out.forcedPosition).toBe(4);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0]).toContain("second");
  });
});

describe("isEffectActive — boundaries", () => {
  it("treats a negative charge count as spent", () => {
    expect(isEffectActive(row({ chargesLeft: -1 }), 5)).toBe(false);
  });

  it("is active exactly at its deadline and expired one roll later", () => {
    expect(isEffectActive(row({ expiresAfterRollSeq: 5 }), 5)).toBe(true);
    expect(isEffectActive(row({ expiresAfterRollSeq: 5 }), 6)).toBe(false);
  });

  it("splits a mixed set without reordering either side", () => {
    const rows = [
      row({ id: "gone", chargesLeft: 0 }),
      row({ id: "keep" }),
      row({ id: "late", expiresAfterRollSeq: 4 }),
    ];
    expect(activeEffects(rows, 5).map((r) => r.id)).toEqual(["keep"]);
    expect(expiredEffects(rows, 5).map((r) => r.id)).toEqual(["gone", "late"]);
  });
});

describe("runHook — dispatch", () => {
  const seen: HookContext[] = [];
  const spy: EffectDef = {
    key: "spy",
    polarity: "positive",
    rarity: "common",
    heroIcon: "BeakerIcon",
    i18n: { name: "iee.effects.spy.name", description: "iee.effects.spy.description" },
    stacking: "unique",
    duration: { kind: "permanent" },
    priority: 1,
    defaults: {},
    hooks: {
      afterMovement: (ctx) => {
        seen.push(ctx);
        return { stepsDelta: 1 };
      },
    },
  };

  it("passes the row's params, the self player and the turn to the hook", () => {
    seen.length = 0;
    runHook({
      hook: "afterMovement",
      effects: [row({ id: "spy-row", effectKey: "spy", params: { steps: 9 } })],
      registry: { spy },
      self,
      turn: { rollSeq: 5, diceResults: [3] },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      hook: "afterMovement",
      effectKey: "spy",
      params: { steps: 9 },
      self: { seasonPlayerId: "sp-1" },
      turn: { rollSeq: 5 },
    });
    expect(seen[0]!.turn.diceResults).toEqual([3]);
  });

  it("skips a row whose effect key is no longer in the registry", () => {
    expect(
      runHook({
        hook: "afterMovement",
        effects: [row({ effectKey: "deleted_in_v9" })],
        registry: { spy },
        self,
        turn: { rollSeq: 5 },
      }),
    ).toEqual(emptyModifiers());
  });

  it("skips an effect that has no handler for the hook", () => {
    expect(
      runHook({
        hook: "onOutcome",
        effects: [row({ effectKey: "spy" })],
        registry: { spy },
        self,
        turn: { rollSeq: 5 },
      }),
    ).toEqual(emptyModifiers());
  });
});
