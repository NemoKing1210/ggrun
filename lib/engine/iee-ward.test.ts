import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./config";
import { applyCellEffect } from "./board/cell-effects";
import { applyMovementModifiers } from "./board/movement";
import { CORE_DOCS } from "./iee/core-docs";
import { compileSet } from "./iee/dsl/set";
import { isEffect, type CompiledEffect } from "./iee/dsl/runtime";
import { runLiveHook, type LiveEffect, type TurnHook } from "./iee/resolve/live";
import type { CellLike, HookTurnContext, IeePlayerSnapshot } from "./types";

/**
 * The ward (stage 1's effect `ward`) is the counter-play the pool is built
 * around (§8.3): these run the compiled core entries through the same hook
 * runner the turn uses.
 */
const SET = compileSet(CORE_DOCS);

function effect(key: string): CompiledEffect {
  const entry = SET.byKey.get(key);
  if (!entry || !isEffect(entry)) throw new Error(`${key} is not a core effect`);
  return entry;
}

const ward = effect("ward");
const swamp = effect("swamp");

const self: IeePlayerSnapshot = {
  seasonPlayerId: "sp-1",
  position: 10,
  balancePoints: 5,
  rollSeq: 4,
  moveCount: 4,
  rank: 1,
  status: "active",
};

/** An instance granted before roll 4, so it takes part in it. */
const live = (entry: CompiledEffect, over: Partial<LiveEffect> = {}): LiveEffect => ({
  instanceId: `i-${entry.key}`,
  entry,
  params: entry.defaults,
  grantedAt: 1,
  anchorRollSeq: 3,
  ...over,
});

const run = (hook: TurnHook, effects: LiveEffect[], over: Partial<HookTurnContext> = {}) =>
  runLiveHook({
    hook,
    effects,
    turn: { rollSeq: 4, outcome: "passed", ...over },
    base: { self, target: null, selfEntries: [], targetEntries: [], rng: () => 0 },
  }).mods;

describe("ward — the counter-play (§8.3)", () => {
  it("is a rare bonus, so a bonus cell can drop it, and is spent by absorbing — not by the clock", () => {
    expect(ward.polarity).toBe("positive");
    expect(ward.rarity).toBe("rare");
    expect(ward.duration).toEqual({ unit: "triggers", count: 1 });
  });

  it("absorbs a penalty landing and asks for its charge", () => {
    const out = run("beforeCellEffect", [live(ward)], { cellType: "penalty" });
    expect(out.skipCellEffect).toBe(true);
    expect(out.consumed).toEqual(["i-ward"]);
    expect(out.reasons).toEqual(["effect:ward"]);
  });

  it.each(["bonus", "normal", "teleport", "event", "start", "finish"])(
    "does not spend itself on a %s cell",
    (cellType) => {
      const out = run("beforeCellEffect", [live(ward)], { cellType });
      expect(out.skipCellEffect).toBe(false);
      expect(out.consumed).toEqual([]);
    },
  );

  it("one granted during the roll in flight waits for the next roll", () => {
    const out = run("beforeCellEffect", [live(ward, { anchorRollSeq: 4 })], { cellType: "penalty" });
    expect(out.skipCellEffect).toBe(false);
    expect(out.consumed).toEqual([]);
  });

  // Two wards are two absorbed hits: that is what the entry promises and
  // what a player counting their protection expects. The second ward's veto
  // changed nothing, so it costs nothing (SC-WARD-3).
  it("two wards absorb one hit apiece — only the first is spent", () => {
    const out = run(
      "beforeCellEffect",
      [live(ward, { instanceId: "a", grantedAt: 1 }), live(ward, { instanceId: "b", grantedAt: 2 })],
      { cellType: "penalty" },
    );
    expect(out.skipCellEffect).toBe(true);
    expect(out.consumed, "the older ward takes the hit").toEqual(["a"]);
  });

  it("and the survivor absorbs the next one", () => {
    const out = run("beforeCellEffect", [live(ward, { instanceId: "b", grantedAt: 2 })], {
      cellType: "penalty",
    });
    expect(out.skipCellEffect).toBe(true);
    expect(out.consumed).toEqual(["b"]);
  });

  it("stacks rather than refreshing — two drops are two wards", () => {
    expect(ward.stacking.mode).toBe("stack");
  });

  it("gets its say before a reactive rule, by priority", () => {
    expect(ward.hooks.beforeCellEffect![0]!.priority).toBeLessThan(swamp.hooks.afterMovement![0]!.priority);
  });
});

/**
 * What the loop does with the patch: the veto has to actually prevent the
 * penalty, and the same landing must still move the player normally.
 */
describe("ward in the turn loop", () => {
  const penalty: CellLike = { position: 12, cellType: "penalty", config: { amount: 3 } };

  it("without a ward the penalty is applied", () => {
    const effect = applyCellEffect(penalty, 12, 5);
    expect(effect.balancePoints).toBe(2);
    expect(effect.ledgerDelta).toBe(-3);
  });

  it("with a ward the loop skips applyCellEffect entirely", () => {
    const out = run("beforeCellEffect", [live(ward)], { cellType: "penalty" });
    // The loop's branch: balance and ledger stay exactly where they were.
    const balance = out.skipCellEffect ? 5 : applyCellEffect(penalty, 12, 5).balancePoints;
    const ledger = out.skipCellEffect ? 0 : applyCellEffect(penalty, 12, 5).ledgerDelta;
    expect(balance).toBe(5);
    expect(ledger).toBe(0);
  });

  it("swamp still shortens the move on the same turn", () => {
    const mods = run("afterMovement", [live(swamp)]);
    const moved = applyMovementModifiers(
      {
        diceResults: [4],
        newPosition: 14,
        newBalancePoints: 5,
        newStreakPass: 1,
        newStreakDrop: 0,
      },
      mods,
      DEFAULT_SEASON_CONFIG.board,
      10,
    );
    expect(moved.newPosition).toBe(13);
  });

  it("a ward and a swamp coexist: one shortens, the other absorbs", () => {
    const effects = [live(ward, { instanceId: "sh" }), live(swamp, { instanceId: "sl" })];
    const move = run("afterMovement", effects);
    const cell = run("beforeCellEffect", effects, { cellType: "penalty" });
    expect(move.stepsDelta).toBe(-1);
    expect(cell.skipCellEffect).toBe(true);
    // Only the ward asked for a charge; the swamp ticks on its own clock.
    expect(cell.consumed).toEqual(["sh"]);
  });
});
