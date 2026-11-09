import { describe, expect, it } from "vitest";
import { emptyModifiers, reduceHookPatches, sortPatchSources, type PatchSource } from "./hooks";

const src = (over: Partial<PatchSource> = {}): PatchSource => ({
  id: "e1",
  effectKey: "x",
  priority: 100,
  appliedAt: 1,
  patch: {},
  ...over,
});

describe("emptyModifiers", () => {
  it("is the neutral result every reduction starts from", () => {
    expect(emptyModifiers()).toEqual({
      stepsDelta: 0,
      balanceDelta: 0,
      diceCountDelta: 0,
      diceSidesDelta: 0,
      resultDelta: 0,
      rerollValues: [],
      bestOfTwo: false,
      worstOfTwo: false,
      resultCap: null,
      reverseLowerHalf: false,
      forcedPosition: null,
      forcedOutcome: null,
      skipCellEffect: false,
      immune: false,
      cancelMove: false,
      intents: [],
      extraSpins: [],
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

describe("reduceHookPatches — cancelled moves and intents", () => {
  it("treats a cancelled move as a veto: the first pays, a repeat is free", () => {
    const out = reduceHookPatches([
      src({ id: "a", priority: 10, patch: { cancelMove: true, consumeCharge: true } }),
      src({ id: "b", priority: 20, patch: { cancelMove: true, consumeCharge: true } }),
    ]);
    expect(out.cancelMove).toBe(true);
    expect(out.consumed).toEqual(["a"]);
  });

  it("collects intents in reduction order", () => {
    const grant = (to: string) => ({ kind: "grant" as const, entryId: "e", key: "k", entryKind: "effect" as const, to });
    const out = reduceHookPatches([
      src({ id: "late", priority: 200, patch: { intents: [grant("second")] } }),
      src({ id: "early", priority: 50, patch: { intents: [grant("first")] } }),
      src({ id: "none", priority: 100, patch: {} }),
    ]);
    expect(out.intents.map((i) => (i.kind === "grant" ? i.to : null))).toEqual(["first", "second"]);
  });
});
