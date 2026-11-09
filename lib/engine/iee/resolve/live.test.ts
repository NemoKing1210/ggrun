import { describe, expect, it } from "vitest";

import { CORE_DOCS } from "../core-docs";
import { compileSet } from "../dsl/set";
import type { CompiledEffect } from "../dsl/runtime";
import {
  countingFrom,
  grantAnchor,
  participates,
  refreshCounter,
  runLiveHook,
  tickAmount,
  type LiveEffect,
} from "./live";

const set = compileSet(CORE_DOCS);
const effect = (key: string) => set.byKey.get(key) as CompiledEffect;
const self = {
  seasonPlayerId: "sp-1",
  position: 4,
  balancePoints: 2,
  rollSeq: 5,
  moveCount: 5,
  rank: 1,
  status: "active" as const,
};
const base = { self, target: null, selfEntries: [], targetEntries: [], rng: () => 0.5 };

const live = (key: string, over: Partial<LiveEffect> = {}): LiveEffect => ({
  instanceId: `inst-${key}`,
  entry: effect(key),
  params: effect(key).defaults,
  grantedAt: 1,
  anchorRollSeq: 4,
  ...over,
});

describe("participates — a status never touches a roll it was granted during", () => {
  it("takes part in rolls after its anchor only", () => {
    expect(participates(5, 5)).toBe(false);
    expect(participates(5, 6)).toBe(true);
    expect(participates(null, 1)).toBe(true);
  });
});

describe("grantAnchor — the roll a grant counts from", () => {
  it("counts from the last finished roll when the recipient is idle", () => {
    expect(grantAnchor(7, false)).toBe(7);
  });

  it("pushes the clock past a roll already in flight", () => {
    expect(grantAnchor(7, true)).toBe(8);
    expect(grantAnchor(0, true)).toBe(1);
  });

  it("keeps a status granted in flight out of that roll, and in the next", () => {
    const anchor = grantAnchor(7, true);
    expect(participates(anchor, 8)).toBe(false);
    expect(participates(anchor, 9)).toBe(true);
  });
});

describe("runLiveHook", () => {
  it("reduces every participating effect and reports what fired", () => {
    const { mods, fired } = runLiveHook({
      hook: "afterMovement",
      effects: [live("swamp"), live("tailwind"), live("lucky")],
      turn: { rollSeq: 6, outcome: "passed" },
      base,
    });
    expect(mods.stepsDelta).toBe(1);
    expect(mods.reasons).toEqual(["effect:swamp", "effect:tailwind"]);
    expect(fired.map((f) => [f.key, f.ruleIndex, f.hook])).toEqual([
      ["swamp", 0, "afterMovement"],
      ["tailwind", 0, "afterMovement"],
    ]);
    expect(fired[0]!.revisionId).toBe(effect("swamp").revisionId);
  });

  it("leaves out an instance anchored at the roll being resolved", () => {
    const { mods, fired } = runLiveHook({
      hook: "afterMovement",
      effects: [live("swamp", { anchorRollSeq: 6 })],
      turn: { rollSeq: 6, outcome: "passed" },
      base,
    });
    expect(mods.stepsDelta).toBe(0);
    expect(fired).toEqual([]);
  });

  it("records the random draws of each firing for the journal", () => {
    const values = [0.1, 0.9];
    const { fired } = runLiveHook({
      hook: "afterMovement",
      effects: [live("swamp"), live("tailwind")],
      turn: { rollSeq: 6 },
      base: { ...base, rng: () => values.shift() ?? 0 },
    });
    // Neither core rule draws; the capture is per firing, empty here.
    expect(fired.map((f) => f.draws)).toEqual([[], []]);
  });

  it("journals exactly the draws a chance rule made, firing or not", () => {
    // A `chance` condition draws from the server rng; the firing records the
    // value so the journal can replay why the rule did (or did not) fire.
    const doc = {
      dslVersion: 1,
      kind: "effect",
      slug: "gust",
      name: { ru: "Порыв", en: "Gust", uk: "Порив" },
      character: "bonus",
      rarity: "common",
      tags: ["movement"],
      duration: { unit: "rolls", count: 2 },
      stacking: { mode: "refresh" },
      rules: [{ when: "afterMovement", if: [{ op: "chance", percent: 50 }], do: [{ op: "steps", delta: 1 }] }],
    };
    const gust = compileSet([
      { entryId: "00000000-0000-4000-8000-0000000000a1", revisionId: "00000000-0000-4000-8000-0000000000a2", doc },
    ]).byKey.get("gust") as CompiledEffect;
    const values = [0.2, 0.8];
    const run = () =>
      runLiveHook({
        hook: "afterMovement",
        effects: [{ instanceId: "inst-gust", entry: gust, params: {}, grantedAt: 1, anchorRollSeq: 4 }],
        turn: { rollSeq: 6 },
        base: { ...base, rng: () => values.shift() ?? 0 },
      });

    const hit = run();
    expect(hit.mods.stepsDelta).toBe(1);
    expect(hit.fired).toEqual([expect.objectContaining({ key: "gust", draws: [0.2] })]);

    // The second draw (0.8) misses: nothing fires, nothing is journaled.
    const miss = run();
    expect(miss.mods.stepsDelta).toBe(0);
    expect(miss.fired).toEqual([]);
  });

  it("reads each instance's own parameter snapshot", () => {
    const { mods } = runLiveHook({
      hook: "afterMovement",
      effects: [live("swamp", { params: { steps: -3 } })],
      turn: { rollSeq: 6 },
      base,
    });
    expect(mods.stepsDelta).toBe(-3);
  });

  it("orders same-priority sources by grant time, so the older ward pays", () => {
    const { mods } = runLiveHook({
      hook: "beforeCellEffect",
      effects: [
        live("ward", { instanceId: "young", grantedAt: 20 }),
        live("ward", { instanceId: "old", grantedAt: 10 }),
      ],
      turn: { rollSeq: 6, cellType: "penalty" },
      base,
    });
    expect(mods.skipCellEffect).toBe(true);
    expect(mods.consumed).toEqual(["old"]);
  });
});

describe("tickAmount — which counters a turn moves", () => {
  it("counts rolls always, moves when the token moved, passed games on a pass", () => {
    const passedMove = { roll: true as const, moved: true, passed: true };
    const droppedStill = { roll: true as const, moved: false, passed: false };
    expect([tickAmount("rolls", passedMove), tickAmount("rolls", droppedStill)]).toEqual([1, 1]);
    expect([tickAmount("moves", passedMove), tickAmount("moves", droppedStill)]).toEqual([1, 0]);
    expect([tickAmount("passed_games", passedMove), tickAmount("passed_games", droppedStill)]).toEqual([1, 0]);
    expect([tickAmount("triggers", passedMove), tickAmount("permanent", passedMove), tickAmount(null, passedMove)]).toEqual([
      0, 0, 0,
    ]);
  });
});

describe("countingFrom — the roll a counter counts from", () => {
  it("is the anchor until a renewal moved it", () => {
    expect(countingFrom(4, null)).toBe(4);
    expect(countingFrom(4, 6)).toBe(6);
    expect(countingFrom(null, null)).toBeNull();
  });
});

describe("refreshCounter — a renewal is a fresh copy, never a shorter one (fix A3, §7.10)", () => {
  const existing = (remaining: number | null, anchorRollSeq: number | null = 4, countFromRollSeq: number | null = null) => ({
    remaining,
    anchorRollSeq,
    countFromRollSeq,
  });

  it("between turns: the incoming count from the roll a fresh copy counts from", () => {
    // Rolls 1–5 resolved, nothing in flight: a fresh copy counts from 5.
    expect(refreshCounter({ existing: existing(1), incoming: { remaining: 2, anchorRollSeq: 5 } })).toEqual({
      remaining: 2,
      countFromRollSeq: 5,
    });
  });

  it("the roll underway — in flight, or the one whose landing renewed it — stays with the old count", () => {
    // Roll 6 is in flight (or resolving): the renewal counts from 6, so roll
    // 6 does not touch its two — whatever that roll turns out to be.
    expect(refreshCounter({ existing: existing(2), incoming: { remaining: 2, anchorRollSeq: 6 } })).toEqual({
      remaining: 2,
      countFromRollSeq: 6,
    });
  });

  it("keeps the old copy when it has more left: the roll underway takes at most one off it", () => {
    expect(refreshCounter({ existing: existing(5), incoming: { remaining: 2, anchorRollSeq: 6 } })).toBeNull();
    expect(refreshCounter({ existing: existing(3), incoming: { remaining: 2, anchorRollSeq: 6 } })).toBeNull();
  });

  it("an equal count is renewed — it can only gain the roll underway", () => {
    expect(refreshCounter({ existing: existing(2, 3), incoming: { remaining: 2, anchorRollSeq: 6 } })).toEqual({
      remaining: 2,
      countFromRollSeq: 6,
    });
  });

  it("never moves a count back to an earlier roll", () => {
    // Renewed once during roll 6; a later grant anchored earlier keeps 6.
    expect(refreshCounter({ existing: existing(1, 3, 6), incoming: { remaining: 2, anchorRollSeq: 5 } })).toEqual({
      remaining: 2,
      countFromRollSeq: 6,
    });
    expect(refreshCounter({ existing: existing(1, null), incoming: { remaining: 2, anchorRollSeq: 5 } })).toEqual({
      remaining: 2,
      countFromRollSeq: 5,
    });
  });

  it("a permanent duration has nothing to renew", () => {
    expect(refreshCounter({ existing: existing(null), incoming: { remaining: null, anchorRollSeq: 9 } })).toBeNull();
    expect(refreshCounter({ existing: existing(2), incoming: { remaining: null, anchorRollSeq: 9 } })).toBeNull();
  });
});
